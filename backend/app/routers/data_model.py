from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import (
    get_connection,
    get_database_lock,
)


router = APIRouter(
    prefix="/api/data-model",
    tags=["Data Model"],
)


VALID_CARDINALITIES = {"1:1", "1:N", "N:1", "N:N"}


# ============================================================
# REQUEST MODELS
# ============================================================


class RelationshipValidationRequest(BaseModel):
    source_table: str
    source_column: str
    target_table: str
    target_column: str
    cardinality: str
    confidence: str = "HIGH"
    action: str


# ============================================================
# HELPERS
# ============================================================


def normalize_column_name(name: str) -> str:
    """
    EBELN -> ebeln, VENDOR_ID -> vendorid
    """

    return (
        name.lower()
        .replace("_", "")
        .replace("-", "")
        .replace(" ", "")
    )


def normalize_type(data_type: str) -> str:
    """
    Normalize DuckDB data types into broad categories.

    FIX: DuckDB reports parameterised types such as
    DECIMAL(18,3) or VARCHAR(20). The parameters are
    stripped first, otherwise those types never match.
    """

    base = data_type.upper().split("(")[0].strip()

    if base in {"VARCHAR", "CHAR", "BPCHAR", "TEXT", "STRING"}:
        return "STRING"

    if base in {
        "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
        "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
        "DECIMAL", "NUMERIC", "DOUBLE", "FLOAT", "REAL",
    }:
        return "NUMBER"

    if base in {
        "DATE",
        "TIMESTAMP",
        "TIMESTAMP WITH TIME ZONE",
        "TIMESTAMPTZ",
    }:
        return "DATE"

    if base == "BOOLEAN":
        return "BOOLEAN"

    return base


def is_compatible_type(source_type: str, target_type: str) -> bool:

    return normalize_type(source_type) == normalize_type(target_type)


def validate_identifier(name: str):
    """
    Validate SQL identifiers before using them
    inside dynamically generated SQL.
    """

    if not name:
        raise ValueError("Identifier cannot be empty.")

    if not name.replace("_", "").isalnum():
        raise ValueError(f"Invalid identifier: {name}")


def is_safe_identifier(name: str) -> bool:

    try:
        validate_identifier(name)
        return True
    except ValueError:
        return False


def get_column_stats(connection, table: str, column: str) -> dict:
    """
    Total rows, non-null rows and distinct values of one column.
    """

    row = connection.execute(
        f'''
        SELECT
            COUNT(*),
            COUNT("{column}"),
            COUNT(DISTINCT "{column}")
        FROM model."{table}"
        '''
    ).fetchone()

    return {
        "total": row[0],
        "non_null": row[1],
        "distinct": row[2],
    }


def count_matching_values(
    connection,
    source_table: str,
    source_column: str,
    target_table: str,
    target_column: str,
) -> int:
    """
    Number of distinct values present in BOTH columns.
    """

    return connection.execute(
        f'''
        SELECT COUNT(*)
        FROM (
            SELECT DISTINCT "{source_column}" AS value
            FROM model."{source_table}"
            WHERE "{source_column}" IS NOT NULL
        ) s
        INNER JOIN (
            SELECT DISTINCT "{target_column}" AS value
            FROM model."{target_table}"
            WHERE "{target_column}" IS NOT NULL
        ) t
        ON s.value = t.value
        '''
    ).fetchone()[0]


def is_unique(stats: dict) -> bool:

    return (
        stats["non_null"] > 0
        and stats["distinct"] == stats["non_null"]
    )


def relationship_to_dict(row) -> dict:

    return {
        "id": row[0],
        "source_table": row[1],
        "source_column": row[2],
        "target_table": row[3],
        "target_column": row[4],
        "cardinality": row[5],
        "confidence": row[6],
        "status": row[7],
        "created_at": str(row[8]),
    }


# ============================================================
# RELATIONSHIP STORAGE
# ============================================================


def initialize_relationship_table():

    connection = get_connection()

    connection.execute(
        "CREATE SCHEMA IF NOT EXISTS metadata"
    )

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


# ============================================================
# 7.1 TABLE DISCOVERY
# ============================================================


@router.get("/tables")
def get_model_tables():

    connection = get_connection()

    try:

        with get_database_lock():

            tables_result = connection.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'model'
                ORDER BY table_name
                """
            ).fetchall()

            tables = []

            for row in tables_result:

                table_name = row[0]

                validate_identifier(table_name)

                columns_result = connection.execute(
                    """
                    SELECT
                        column_name,
                        data_type,
                        is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = 'model'
                      AND table_name = ?
                    ORDER BY ordinal_position
                    """,
                    [table_name],
                ).fetchall()

                columns = [
                    {
                        "name": column[0],
                        "type": column[1],
                        "nullable": column[2] == "YES",
                    }
                    for column in columns_result
                ]

                row_count = connection.execute(
                    f'SELECT COUNT(*) FROM model."{table_name}"'
                ).fetchone()[0]

                tables.append(
                    {
                        "name": table_name.upper(),
                        "schema": "model",
                        "row_count": row_count,
                        "column_count": len(columns),
                        "columns": columns,
                    }
                )

            return {
                "status": "success",
                "count": len(tables),
                "tables": tables,
            }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# 7.2 COLUMN DISCOVERY
# ============================================================


@router.get("/tables/{table_name}/columns")
def get_table_columns(table_name: str):

    connection = get_connection()

    source_table = table_name.lower()

    try:
        validate_identifier(source_table)

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    try:

        with get_database_lock():

            table_exists = connection.execute(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'model'
                  AND lower(table_name) = ?
                """,
                [source_table],
            ).fetchone()[0]

            if not table_exists:

                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Model table '{table_name}' does not exist."
                    ),
                )

            columns_result = connection.execute(
                """
                SELECT
                    ordinal_position,
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'model'
                  AND lower(table_name) = ?
                ORDER BY ordinal_position
                """,
                [source_table],
            ).fetchall()

            row_count = connection.execute(
                f'SELECT COUNT(*) FROM model."{source_table}"'
            ).fetchone()[0]

            columns = []

            for column in columns_result:

                ordinal_position = column[0]
                column_name = column[1]
                data_type = column[2]
                is_nullable = column[3] == "YES"

                # Column names come from information_schema but are
                # still interpolated into SQL, so double quotes inside
                # a name are escaped.
                quoted = column_name.replace('"', '""')

                null_count = connection.execute(
                    f'''
                    SELECT COUNT(*)
                    FROM model."{source_table}"
                    WHERE "{quoted}" IS NULL
                    '''
                ).fetchone()[0]

                distinct_count = connection.execute(
                    f'''
                    SELECT COUNT(DISTINCT "{quoted}")
                    FROM model."{source_table}"
                    '''
                ).fetchone()[0]

                sample_result = connection.execute(
                    f'''
                    SELECT DISTINCT "{quoted}"
                    FROM model."{source_table}"
                    WHERE "{quoted}" IS NOT NULL
                    LIMIT 5
                    '''
                ).fetchall()

                columns.append(
                    {
                        "position": ordinal_position,
                        "name": column_name,
                        "type": data_type,
                        "nullable": is_nullable,
                        "row_count": row_count,
                        "null_count": null_count,
                        "distinct_count": distinct_count,
                        "sample_values": [
                            str(value[0])
                            for value in sample_result
                        ],
                    }
                )

            return {
                "status": "success",
                "table": source_table.upper(),
                "schema": "model",
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns,
            }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# 7.3 RELATIONSHIP DISCOVERY
# ============================================================


@router.get("/relationships/discover")
def discover_relationships():
    """
    Suggest relationships between model tables.

    Fixes compared with the previous version:
      * The "one" side (unique column) is always the SOURCE and the
        "many" side the TARGET, whatever the alphabetical order of the
        tables. EKKO.EBELN -> EKPO.EBELN is now 1:N, and
        EKBE.EBELN vs EKKO.EBELN is flipped to EKKO -> EKBE (1:N).
      * match_percentage is measured on the "many" side: how many of
        its distinct values exist in the "one" side (orphan check).
      * A 1:N relationship can now be HIGH confidence. Before, HIGH
        required the target to be unique, which a correct 1:N never is.
      * Pairs that were already approved or rejected are not suggested
        again.
      * A column with an unusual name is skipped instead of failing
        the whole discovery request.
    """

    connection = get_connection()

    try:

        with get_database_lock():

            initialize_relationship_table()

            table_rows = connection.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'model'
                ORDER BY table_name
                """
            ).fetchall()

            table_names = [
                row[0]
                for row in table_rows
                if is_safe_identifier(row[0])
            ]

            if len(table_names) < 2:

                return {
                    "status": "success",
                    "count": 0,
                    "relationships": [],
                }

            # Pairs already reviewed (either direction)
            reviewed = set()

            for row in connection.execute(
                """
                SELECT
                    lower(source_table),
                    lower(source_column),
                    lower(target_table),
                    lower(target_column)
                FROM metadata.relationships
                """
            ).fetchall():

                reviewed.add((row[0], row[1], row[2], row[3]))
                reviewed.add((row[2], row[3], row[0], row[1]))

            # Columns of every table
            table_columns = {}

            for table_name in table_names:

                table_columns[table_name] = connection.execute(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'model'
                      AND table_name = ?
                    ORDER BY ordinal_position
                    """,
                    [table_name],
                ).fetchall()

            relationships = []

            for source_index in range(len(table_names)):

                for target_index in range(
                    source_index + 1,
                    len(table_names),
                ):

                    table_a = table_names[source_index]
                    table_b = table_names[target_index]

                    for column_a in table_columns[table_a]:

                        for column_b in table_columns[table_b]:

                            name_a, type_a = column_a[0], column_a[1]
                            name_b, type_b = column_b[0], column_b[1]

                            if not is_compatible_type(type_a, type_b):
                                continue

                            if (
                                normalize_column_name(name_a)
                                != normalize_column_name(name_b)
                            ):
                                continue

                            if not (
                                is_safe_identifier(name_a)
                                and is_safe_identifier(name_b)
                            ):
                                continue

                            if (
                                table_a.lower(), name_a.lower(),
                                table_b.lower(), name_b.lower(),
                            ) in reviewed:
                                continue

                            stats_a = get_column_stats(
                                connection, table_a, name_a
                            )

                            stats_b = get_column_stats(
                                connection, table_b, name_b
                            )

                            unique_a = is_unique(stats_a)
                            unique_b = is_unique(stats_b)

                            # --------------------------------
                            # Orient: "one" side = source
                            # --------------------------------

                            if unique_b and not unique_a:

                                # swap so the unique column is the source
                                source = (table_b, name_b, type_b, stats_b)
                                target = (table_a, name_a, type_a, stats_a)

                            else:

                                source = (table_a, name_a, type_a, stats_a)
                                target = (table_b, name_b, type_b, stats_b)

                            source_table, source_column, source_type, source_stats = source
                            target_table, target_column, target_type, target_stats = target

                            source_unique = is_unique(source_stats)
                            target_unique = is_unique(target_stats)

                            if source_unique and target_unique:
                                cardinality = "1:1"
                            elif source_unique:
                                cardinality = "1:N"
                            else:
                                cardinality = "N:N"

                            # --------------------------------
                            # Match percentage
                            # --------------------------------

                            matching_values = count_matching_values(
                                connection,
                                source_table,
                                source_column,
                                target_table,
                                target_column,
                            )

                            if cardinality == "1:N":
                                # share of the "many" side that has a parent
                                denominator = target_stats["distinct"]
                            else:
                                denominator = min(
                                    source_stats["distinct"],
                                    target_stats["distinct"],
                                )

                            match_percentage = (
                                matching_values / denominator * 100
                                if denominator > 0
                                else 0
                            )

                            if match_percentage < 50:
                                continue

                            # --------------------------------
                            # Confidence
                            # --------------------------------

                            if (
                                match_percentage >= 95
                                and cardinality != "N:N"
                            ):
                                confidence = "HIGH"

                            elif match_percentage >= 80:
                                confidence = "MEDIUM"

                            else:
                                confidence = "LOW"

                            relationships.append(
                                {
                                    "source_table": source_table.upper(),
                                    "source_column": source_column,
                                    "source_type": source_type,
                                    "target_table": target_table.upper(),
                                    "target_column": target_column,
                                    "target_type": target_type,
                                    "cardinality": cardinality,
                                    "matching_values": matching_values,
                                    "match_percentage": round(
                                        match_percentage, 2
                                    ),
                                    "source_rows": source_stats["total"],
                                    "target_rows": target_stats["total"],
                                    "source_distinct": source_stats["distinct"],
                                    "target_distinct": target_stats["distinct"],
                                    "confidence": confidence,
                                }
                            )

            relationships.sort(
                key=lambda relationship: (
                    {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(
                        relationship["confidence"], 0
                    ),
                    relationship["match_percentage"],
                ),
                reverse=True,
            )

            return {
                "status": "success",
                "count": len(relationships),
                "relationships": relationships,
            }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# 7.4 RELATIONSHIP VALIDATION
# 7.5 SAVE RELATIONSHIPS
# ============================================================


@router.post("/relationships/validate")
def validate_relationship(
    request: RelationshipValidationRequest,
):
    """
    Approve or reject a relationship and save it.

    Fixes compared with the previous version:
      * Column names are saved with their real casing from the
        database, not whatever the client typed.
      * Cardinality is validated.
      * Approving a relationship between the same table pair twice
        updates the existing row instead of creating duplicates.
    """

    connection = get_connection()

    try:

        with get_database_lock():

            initialize_relationship_table()

            source_table = request.source_table.lower()
            target_table = request.target_table.lower()

            action = request.action.upper()
            cardinality = request.cardinality.upper()
            confidence = (request.confidence or "HIGH").upper()

            if action not in {"APPROVE", "REJECT"}:

                raise HTTPException(
                    status_code=400,
                    detail="Action must be APPROVE or REJECT.",
                )

            if cardinality not in VALID_CARDINALITIES:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Cardinality must be one of: "
                        + ", ".join(sorted(VALID_CARDINALITIES))
                    ),
                )

            try:

                validate_identifier(source_table)
                validate_identifier(request.source_column)
                validate_identifier(target_table)
                validate_identifier(request.target_column)

            except ValueError as error:

                raise HTTPException(
                    status_code=400,
                    detail=str(error),
                )

            # ------------------------------------------------
            # Tables must exist
            # ------------------------------------------------

            for label, table, original in (
                ("Source", source_table, request.source_table),
                ("Target", target_table, request.target_table),
            ):

                exists = connection.execute(
                    """
                    SELECT COUNT(*)
                    FROM information_schema.tables
                    WHERE table_schema = 'model'
                      AND lower(table_name) = ?
                    """,
                    [table],
                ).fetchone()[0]

                if not exists:

                    raise HTTPException(
                        status_code=404,
                        detail=f"{label} table '{original}' does not exist.",
                    )

            # ------------------------------------------------
            # Columns must exist (and return their real names)
            # ------------------------------------------------

            def resolve_column(label, table, column):

                row = connection.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'model'
                      AND lower(table_name) = ?
                      AND lower(column_name) = ?
                    """,
                    [table, column.lower()],
                ).fetchone()

                if not row:

                    raise HTTPException(
                        status_code=404,
                        detail=f"{label} column '{column}' does not exist.",
                    )

                return row[0]

            source_column = resolve_column(
                "Source", source_table, request.source_column
            )

            target_column = resolve_column(
                "Target", target_table, request.target_column
            )

            relationship_status = (
                "APPROVED" if action == "APPROVE" else "REJECTED"
            )

            # ------------------------------------------------
            # Existing relationship -> update
            # ------------------------------------------------

            existing = connection.execute(
                """
                SELECT id
                FROM metadata.relationships
                WHERE lower(source_table) = ?
                  AND lower(source_column) = ?
                  AND lower(target_table) = ?
                  AND lower(target_column) = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                [
                    source_table,
                    source_column.lower(),
                    target_table,
                    target_column.lower(),
                ],
            ).fetchone()

            if existing:

                relationship_id = existing[0]

                connection.execute(
                    """
                    UPDATE metadata.relationships
                    SET
                        cardinality = ?,
                        confidence = ?,
                        status = ?,
                        created_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    [
                        cardinality,
                        confidence,
                        relationship_status,
                        relationship_id,
                    ],
                )

                message = "Relationship status updated."

            else:

                relationship_id = connection.execute(
                    """
                    SELECT COALESCE(MAX(id), 0) + 1
                    FROM metadata.relationships
                    """
                ).fetchone()[0]

                connection.execute(
                    """
                    INSERT INTO metadata.relationships (
                        id,
                        source_table,
                        source_column,
                        target_table,
                        target_column,
                        cardinality,
                        confidence,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        relationship_id,
                        source_table.upper(),
                        source_column,
                        target_table.upper(),
                        target_column,
                        cardinality,
                        confidence,
                        relationship_status,
                    ],
                )

                message = (
                    "Relationship approved and saved."
                    if action == "APPROVE"
                    else "Relationship rejected and saved."
                )

            return {
                "status": "success",
                "action": relationship_status,
                "message": message,
                "relationship": {
                    "id": relationship_id,
                    "source_table": source_table.upper(),
                    "source_column": source_column,
                    "target_table": target_table.upper(),
                    "target_column": target_column,
                    "cardinality": cardinality,
                    "confidence": confidence,
                    "status": relationship_status,
                },
            }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# 7.5 GET SAVED RELATIONSHIPS
# ============================================================


@router.get("/relationships")
def get_relationships():

    connection = get_connection()

    try:

        with get_database_lock():

            initialize_relationship_table()

            result = connection.execute(
                """
                SELECT
                    id,
                    source_table,
                    source_column,
                    target_table,
                    target_column,
                    cardinality,
                    confidence,
                    status,
                    created_at
                FROM metadata.relationships
                ORDER BY id
                """
            ).fetchall()

            relationships = [
                relationship_to_dict(row)
                for row in result
            ]

            return {
                "status": "success",
                "count": len(relationships),
                "approved_count": sum(
                    1 for r in relationships if r["status"] == "APPROVED"
                ),
                "rejected_count": sum(
                    1 for r in relationships if r["status"] == "REJECTED"
                ),
                "relationships": relationships,
            }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# 7.6 GET APPROVED RELATIONSHIPS ONLY
#
# Used by the Visual Data Model
# ============================================================


@router.get("/relationships/approved")
def get_approved_relationships():

    connection = get_connection()

    try:

        with get_database_lock():

            initialize_relationship_table()

            result = connection.execute(
                """
                SELECT
                    id,
                    source_table,
                    source_column,
                    target_table,
                    target_column,
                    cardinality,
                    confidence,
                    status,
                    created_at
                FROM metadata.relationships
                WHERE status = 'APPROVED'
                ORDER BY id
                """
            ).fetchall()

            relationships = [
                relationship_to_dict(row)
                for row in result
            ]

            return {
                "status": "success",
                "count": len(relationships),
                "relationships": relationships,
            }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# ============================================================
# DELETE A SAVED RELATIONSHIP
# ============================================================


@router.delete("/relationships/{relationship_id}")
def delete_relationship(relationship_id: int):

    connection = get_connection()

    try:

        with get_database_lock():

            initialize_relationship_table()

            existing = connection.execute(
                "SELECT COUNT(*) FROM metadata.relationships WHERE id = ?",
                [relationship_id],
            ).fetchone()[0]

            if not existing:

                raise HTTPException(
                    status_code=404,
                    detail="Relationship not found.",
                )

            connection.execute(
                "DELETE FROM metadata.relationships WHERE id = ?",
                [relationship_id],
            )

            return {
                "status": "success",
                "message": "Relationship deleted.",
            }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )