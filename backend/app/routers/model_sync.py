import json
import math
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import (
    get_connection,
    get_database_lock,
    get_write_lock,
    cache_get,
    cache_set,
)


router = APIRouter(
    prefix="/api/data-model",
    tags=["Data Model"],
)


# Schemas searched (in this order) for an uploaded file's table.
# Your log shows uploads are created as main.<TABLE>.
SOURCE_SCHEMAS = ["raw", "staging", "main"]


class SyncTablesRequest(BaseModel):
    tables: list[str]


def _is_safe(name: str) -> bool:

    return bool(name) and name.replace("_", "").isalnum()


# ============================================================
# SYNC UPLOADED FILES INTO THE MODEL
#
# Every uploaded file must be visible in the Data Model, even
# before "Apply mapping" has been run. Unmapped files are
# exposed as a VIEW in the model schema (no data is copied).
# If <NAME> or <NAME>_MAPPED already exists in model, nothing
# is created for that file.
# ============================================================


@router.post("/tables/sync")
def sync_uploaded_tables(request: SyncTablesRequest):

    connection = get_connection()

    try:

        with get_database_lock():

            connection.execute("CREATE SCHEMA IF NOT EXISTS model")

            existing = {
                row[0].lower()
                for row in connection.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'model'
                    """
                ).fetchall()
            }

            created = []
            skipped = []
            missing = []

            for name in request.tables:

                if not _is_safe(name):
                    missing.append(name)
                    continue

                key = name.lower()

                if key in existing or f"{key}_mapped" in existing:
                    skipped.append(name)
                    continue

                source = None

                for schema in SOURCE_SCHEMAS:

                    row = connection.execute(
                        """
                        SELECT table_schema, table_name
                        FROM information_schema.tables
                        WHERE table_schema = ?
                          AND lower(table_name) = ?
                        LIMIT 1
                        """,
                        [schema, key],
                    ).fetchone()

                    if row:
                        source = row
                        break

                if not source:
                    missing.append(name)
                    continue

                schema_name, table_name = source

                connection.execute(
                    f'''
                    CREATE OR REPLACE VIEW model."{table_name}" AS
                    SELECT * FROM {schema_name}."{table_name}"
                    '''
                )

                existing.add(key)
                created.append(table_name)

            return {
                "status": "success",
                "created": created,
                "skipped": skipped,
                "missing": missing,
            }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# CHART QUERY  (powers the Visualization dashboard)
#
#   SELECT <group-by column>, <AGG>(<measure column>)
#   FROM model.<table>
#   [JOIN model.<related table> via an APPROVED relationship]
#   GROUP BY 1  ORDER BY ...  LIMIT n
#
# - no x_column      -> one number (KPI card)
# - SUM / COUNT      -> also returns the grand total of ALL groups, so
#                       a pie chart can show "Other"
#
# Every table / column name is looked up in information_schema
# and quoted, and the aggregation comes from a fixed list, so
# nothing the browser sends is pasted into the SQL as-is.
# ============================================================


ALLOWED_AGGREGATIONS = {
    "SUM", "AVG", "MIN", "MAX", "COUNT", "COUNT_DISTINCT",
}

ALLOWED_SORTS = {"VALUE_DESC", "VALUE_ASC", "LABEL_ASC"}


class ChartQueryRequest(BaseModel):
    table: str                         # table the measure comes from
    x_column: Optional[str] = None     # column to group by (none = KPI)
    x_table: Optional[str] = None      # related table the x column lives in
    y_column: Optional[str] = None     # measure (not needed for COUNT)
    aggregation: str = "COUNT"
    sort: str = "VALUE_DESC"
    limit: int = 20


class TableRowsRequest(BaseModel):
    table: str
    columns: list[str] = []
    limit: int = 25


def _quote(name: str) -> str:

    return '"' + name.replace('"', '""') + '"'


def _resolve_table(connection, name: str) -> str:

    row = connection.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'model'
          AND lower(table_name) = ?
        """,
        [name.lower()],
    ).fetchone()

    if not row:

        raise HTTPException(
            status_code=404,
            detail=f"Table '{name}' does not exist in the data model.",
        )

    return row[0]


def _resolve_column(connection, table: str, column: str) -> str:

    row = connection.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'model'
          AND table_name = ?
          AND lower(column_name) = ?
        """,
        [table, column.lower()],
    ).fetchone()

    if not row:

        raise HTTPException(
            status_code=404,
            detail=f"Column '{column}' does not exist in {table}.",
        )

    return row[0]


def _column_type(connection, table: str, column: str) -> str:

    row = connection.execute(
        """
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'model'
          AND table_name = ?
          AND column_name = ?
        """,
        [table, column],
    ).fetchone()

    return row[0] if row else ""


def _json_value(value):
    """Make a DuckDB value safe to send as JSON."""

    if value is None or isinstance(value, (bool, int, str)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, datetime):
        if value.time() == time(0, 0):
            return value.date().isoformat()
        return value.isoformat(sep=" ")

    if isinstance(value, date):
        return value.isoformat()

    return str(value)


@router.post("/chart-query")
def chart_query(request: ChartQueryRequest):

    aggregation = request.aggregation.upper()
    sort = request.sort.upper()

    if aggregation not in ALLOWED_AGGREGATIONS:

        raise HTTPException(
            status_code=400,
            detail=(
                "Aggregation must be one of: "
                + ", ".join(sorted(ALLOWED_AGGREGATIONS))
            ),
        )

    if sort not in ALLOWED_SORTS:

        raise HTTPException(
            status_code=400,
            detail="Sort must be VALUE_DESC, VALUE_ASC or LABEL_ASC.",
        )

    if aggregation != "COUNT" and not request.y_column:

        raise HTTPException(
            status_code=400,
            detail="Choose a measure column for this aggregation.",
        )

    grouped = bool(request.x_column)

    limit = max(1, min(int(request.limit), 500))

    connection = get_connection()

    try:

        with get_database_lock():

            # make sure the metadata table exists
            connection.execute("CREATE SCHEMA IF NOT EXISTS metadata")

            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS metadata.relationships (
                    id BIGINT PRIMARY KEY,
                    source_table VARCHAR NOT NULL,
                    source_column VARCHAR NOT NULL,
                    target_table VARCHAR NOT NULL,
                    target_column VARCHAR NOT NULL,
                    cardinality VARCHAR,
                    confidence VARCHAR,
                    status VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            base = _resolve_table(connection, request.table)

            join_sql = ""
            warning = None
            x_column = None
            x_expr = None

            # ------------------------------------------------
            # Group-by column: base table, or a related table
            # ------------------------------------------------

            if grouped and request.x_table and request.x_table.lower() != base.lower():

                x_table = _resolve_table(connection, request.x_table)
                x_column = _resolve_column(connection, x_table, request.x_column)

                relationship = connection.execute(
                    """
                    SELECT
                        source_table, source_column,
                        target_table, target_column,
                        cardinality
                    FROM metadata.relationships
                    WHERE status = 'APPROVED'
                      AND (
                            (lower(source_table) = ? AND lower(target_table) = ?)
                         OR (lower(source_table) = ? AND lower(target_table) = ?)
                      )
                    ORDER BY id
                    LIMIT 1
                    """,
                    [base.lower(), x_table.lower(), x_table.lower(), base.lower()],
                ).fetchone()

                if not relationship:

                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"No approved relationship between {base} and "
                            f"{x_table}. Connect them in the Data Model first."
                        ),
                    )

                rel_source, rel_source_col, rel_target, rel_target_col, cardinality = relationship

                base_is_source = rel_source.lower() == base.lower()

                base_key = _resolve_column(
                    connection,
                    base,
                    rel_source_col if base_is_source else rel_target_col,
                )

                other_key = _resolve_column(
                    connection,
                    x_table,
                    rel_target_col if base_is_source else rel_source_col,
                )

                # Keys with the SAME type join directly (fast, can use
                # DuckDB's native hash join on the real type).
                # Keys with different types (BIGINT vs VARCHAR) are
                # compared as text.
                if (
                    _column_type(connection, base, base_key)
                    == _column_type(connection, x_table, other_key)
                ):

                    join_sql = (
                        f"JOIN model.{_quote(x_table)} AS x "
                        f"ON b.{_quote(base_key)} "
                        f"= x.{_quote(other_key)}"
                    )

                else:

                    join_sql = (
                        f"JOIN model.{_quote(x_table)} AS x "
                        f"ON CAST(b.{_quote(base_key)} AS VARCHAR) "
                        f"= CAST(x.{_quote(other_key)} AS VARCHAR)"
                    )

                x_expr = f"x.{_quote(x_column)}"

                # fan-out: base is the "one" side, so its rows repeat
                cardinality = (cardinality or "").upper()

                base_is_many = (
                    (cardinality == "1:N" and not base_is_source)
                    or (cardinality == "N:1" and base_is_source)
                )

                if cardinality == "N:N" or (
                    cardinality in {"1:N", "N:1"} and not base_is_many
                ):

                    warning = (
                        f"{base} is the 'one' side of the relationship with "
                        f"{x_table}, so its rows repeat once per matching "
                        f"{x_table} row. Sums and counts can be inflated."
                    )

            elif grouped:

                x_column = _resolve_column(connection, base, request.x_column)

                x_expr = f"b.{_quote(x_column)}"

            # ------------------------------------------------
            # Measure
            # ------------------------------------------------

            y_column = None

            if request.y_column:

                y_column = _resolve_column(connection, base, request.y_column)

            if aggregation == "COUNT":

                value_expr = "COUNT(*)"

            elif aggregation == "COUNT_DISTINCT":

                value_expr = f"COUNT(DISTINCT b.{_quote(y_column)})"

            else:

                # mapped tables are often all-VARCHAR, so cast safely
                value_expr = (
                    f"{aggregation}(TRY_CAST(b.{_quote(y_column)} AS DOUBLE))"
                )

            # ------------------------------------------------
            # KPI: one number, no grouping
            # ------------------------------------------------

            if not grouped:

                sql = f"""
                    SELECT 'Total' AS label, {value_expr} AS value
                    FROM model.{_quote(base)} AS b
                """

                row = connection.execute(sql).fetchone()

                rows = []

                if row and row[1] is not None:

                    rows = [{"label": row[0], "value": float(row[1])}]

                else:

                    warning = (
                        f"No numeric values found in {y_column}."
                        if y_column else "No data."
                    )

                return {
                    "status": "success",
                    "table": base,
                    "x_column": None,
                    "y_column": y_column,
                    "aggregation": aggregation,
                    "rows": rows,
                    "total": rows[0]["value"] if rows else None,
                    "truncated": False,
                    "warning": warning,
                    "sql": " ".join(sql.split()),
                }

            # ------------------------------------------------
            # Grouped query
            # ------------------------------------------------

            order_sql = {
                "VALUE_DESC": "value DESC NULLS LAST, label",
                "VALUE_ASC": "value ASC NULLS LAST, label",
                "LABEL_ASC": "label ASC",
            }[sort]

            sql = f"""
                SELECT
                    COALESCE(CAST({x_expr} AS VARCHAR), '(blank)') AS label,
                    {value_expr} AS value
                FROM model.{_quote(base)} AS b
                {join_sql}
                GROUP BY 1
                HAVING {value_expr} IS NOT NULL
                ORDER BY {order_sql}
                LIMIT {limit + 1}
            """

            result = connection.execute(sql).fetchall()

            truncated = len(result) > limit

            rows = [
                {
                    "label": row[0],
                    "value": float(row[1]),
                }
                for row in result[:limit]
            ]

            # grand total of ALL groups (lets a pie chart show "Other")
            total = None

            if aggregation in {"SUM", "COUNT"}:

                total_row = connection.execute(
                    f"""
                    SELECT {value_expr}
                    FROM model.{_quote(base)} AS b
                    {join_sql}
                    """
                ).fetchone()

                if total_row and total_row[0] is not None:

                    total = float(total_row[0])

            if not rows and aggregation not in {"COUNT", "COUNT_DISTINCT"}:

                warning = (
                    f"No numeric values found in {y_column}. "
                    "Pick a numeric column, or use Count."
                )

            return {
                "status": "success",
                "table": base,
                "x_column": x_column,
                "y_column": y_column,
                "aggregation": aggregation,
                "rows": rows,
                "total": total,
                "truncated": truncated,
                "warning": warning,
                "sql": " ".join(sql.split()),
            }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# TABLE ROWS  (powers the Table component)
# ============================================================


@router.post("/table-rows")
def table_rows(request: TableRowsRequest):

    limit = max(1, min(int(request.limit), 200))

    connection = get_connection()

    try:

        with get_database_lock():

            table = _resolve_table(connection, request.table)

            all_columns = connection.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'model'
                  AND table_name = ?
                ORDER BY ordinal_position
                """,
                [table],
            ).fetchall()

            types = {name: data_type for name, data_type in all_columns}

            if request.columns:

                chosen = [
                    _resolve_column(connection, table, column)
                    for column in request.columns[:40]
                ]

            else:

                chosen = [name for name, _ in all_columns[:12]]

            select_list = ", ".join(_quote(name) for name in chosen)

            rows = connection.execute(
                f"SELECT {select_list} FROM model.{_quote(table)} LIMIT {limit}"
            ).fetchall()

            row_count = connection.execute(
                f"SELECT COUNT(*) FROM model.{_quote(table)}"
            ).fetchone()[0]

            return {
                "status": "success",
                "table": table,
                "columns": [
                    {"name": name, "type": types.get(name, "")}
                    for name in chosen
                ],
                "rows": [
                    [_json_value(value) for value in row]
                    for row in rows
                ],
                "row_count": row_count,
                "truncated": row_count > limit,
            }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )