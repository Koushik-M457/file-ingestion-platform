import re

from app.database import get_connection


def validate_identifier(name: str) -> str:
    """
    Prevent SQL injection through table names.
    """

    if not re.match(
        r"^[A-Za-z_][A-Za-z0-9_]*$",
        name
    ):
        raise ValueError(
            "Invalid table name."
        )

    return name


def get_table_preview(
    schema: str,
    table: str,
    limit: int = 100
):
    connection = get_connection()
    # Validate schema

    allowed_schemas = {
        "model",
        "staging",
    }

    if schema not in allowed_schemas:
        raise ValueError(
            "Preview is only available for "
            "model or staging tables."
        )

    # Validate table name

    table = validate_identifier(table)

    # Protect LIMIT

    limit = min(
        max(int(limit), 1),
        500
    )


    # Check table exists


    exists = connection.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = ?
        AND table_name = ?
        """,
        [schema, table]
    ).fetchone()[0]

    if exists == 0:
        raise ValueError(
            f"Table {schema}.{table} does not exist."
        )

    # Row count

    row_count = connection.execute(
        f"""
        SELECT COUNT(*)
        FROM "{schema}"."{table}"
        """
    ).fetchone()[0]

    
    # Column metadata


    columns = connection.execute(
        """
        SELECT
            column_name,
            data_type,
            ordinal_position
        FROM information_schema.columns
        WHERE table_schema = ?
        AND table_name = ?
        ORDER BY ordinal_position
        """,
        [schema, table]
    ).fetchall()

    column_metadata = [
        {
            "name": column[0],
            "type": column[1],
            "position": column[2],
        }
        for column in columns
    ]

   
    # Preview rows
  

    result = connection.execute(
        f"""
        SELECT *
        FROM "{schema}"."{table}"
        LIMIT {limit}
        """
    )

    rows = result.fetchall()

    column_names = [
        description[0]
        for description in result.description
    ]

    data = [
        dict(
            zip(column_names, row)
        )
        for row in rows
    ]

    return {
        "schema": schema,
        "table": table,
        "full_table_name": f"{schema}.{table}",
        "row_count": row_count,
        "preview_count": len(data),
        "columns": column_metadata,
        "data": data,
    }