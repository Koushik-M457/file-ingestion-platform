import re

from app.database import get_connection
from app.security.sql_validator import validate_sql


# ============================================================
# VALIDATE TABLE NAME
# ============================================================

def validate_identifier(name: str):

    if not name:
        raise ValueError("Table name is required.")

    if not re.match(
        r"^[A-Za-z_][A-Za-z0-9_]*$",
        name
    ):
        raise ValueError(
            f"Invalid table name: {name}"
        )

    return name


# ============================================================
# EXTRACT CREATE TABLE
#
# Supports:
#
# CREATE TABLE bbr AS SELECT ...
#
# CREATE OR REPLACE TABLE bbr AS SELECT ...
#
# ============================================================

def extract_created_table(sql: str):

    pattern = re.compile(
        r"""
        ^\s*
        CREATE
        \s+
        (?:OR\s+REPLACE\s+)?
        TABLE
        \s+
        (?:
            [A-Za-z_][A-Za-z0-9_]*\.
        )?
        (?P<table>
            [A-Za-z_][A-Za-z0-9_]*
        )
        \s+
        AS
        \s+
        (?P<query>
            SELECT\b.*
        )
        \s*;?
        \s*$
        """,
        re.IGNORECASE |
        re.DOTALL |
        re.VERBOSE
    )

    match = pattern.match(sql)

    if not match:
        return None, None

    table_name = match.group(
        "table"
    )

    select_query = match.group(
        "query"
    )

    return (
        table_name,
        select_query
    )


# ============================================================
# EXECUTE TRANSFORMATION
# ============================================================

def execute_transform(
    sql: str,
    output_table: str,
):

    connection = get_connection()


    # ========================================================
    # CLEAN SQL
    # ========================================================

    sql = sql.strip()

    if not sql:
        raise ValueError(
            "SQL query cannot be empty."
        )


    # ========================================================
    # CHECK IF USER PROVIDED CREATE TABLE
    # ========================================================

    created_table, select_query = (
        extract_created_table(sql)
    )


    # ========================================================
    # CREATE TABLE SQL
    # ========================================================

    if created_table:

        output_table = validate_identifier(
            created_table
        )

        # Validate ONLY the SELECT part
        query = validate_sql(
            select_query
        )


    # ========================================================
    # NORMAL SELECT SQL
    # ========================================================

    else:

        output_table = validate_identifier(
            output_table
        )

        query = validate_sql(
            sql
        )


    # ========================================================
    # CREATE MODEL TABLE
    #
    # Example:
    #
    # SELECT *
    # FROM BKPF
    #
    # becomes:
    #
    # model.transformed_data
    #
    # ========================================================

    create_sql = f"""
        CREATE OR REPLACE TABLE
        model."{output_table}"
        AS
        {query}
    """


    print()
    print("================================================")
    print("TRANSFORMATION")
    print("================================================")
    print("Output table:")
    print(
        f"model.{output_table}"
    )
    print()
    print("SQL:")
    print(query)
    print()
    print("CREATE SQL:")
    print(create_sql)
    print("================================================")


    # ========================================================
    # EXECUTE CREATE TABLE
    # ========================================================

    connection.execute(
        create_sql
    )


    # ========================================================
    # GET TOTAL ROW COUNT
    # ========================================================

    row_count = connection.execute(
        f"""
        SELECT COUNT(*)
        FROM model."{output_table}"
        """
    ).fetchone()[0]


    # ========================================================
    # GET ALL DATA
    #
    # IMPORTANT:
    # NO LIMIT 100
    # ========================================================

    result = connection.execute(
        f"""
        SELECT *
        FROM model."{output_table}"
        """
    )


    # ========================================================
    # COLUMN INFORMATION
    # ========================================================

    column_names = [
        description[0]
        for description in result.description
    ]


    column_types = [
        str(description[1])
        for description in result.description
    ]


    columns = [

        {
            "name": name,
            "type": data_type,
        }

        for name, data_type
        in zip(
            column_names,
            column_types
        )

    ]


    # ========================================================
    # FETCH ALL ROWS
    # ========================================================

    rows = result.fetchall()


    # ========================================================
    # CONVERT ROWS TO DICTIONARIES
    # ========================================================

    preview = [

        dict(
            zip(
                column_names,
                row
            )
        )

        for row in rows

    ]


    # ========================================================
    # DEBUG
    # ========================================================

    print()
    print("================================================")
    print("TRANSFORMATION RESULT")
    print("================================================")
    print(
        "Total database rows:",
        row_count
    )
    print(
        "Rows fetched:",
        len(rows)
    )
    print(
        "Columns:",
        len(columns)
    )

    if preview:

        print(
            "First row:"
        )

        print(
            preview[0]
        )

    else:

        print(
            "WARNING: NO ROWS RETURNED"
        )

    print("================================================")
    print()


    # ========================================================
    # RETURN RESPONSE
    # ========================================================

    return {

        "status":
            "success",

        "table":
            f"model.{output_table}",

        "rows":
            row_count,

        "preview_rows":
            len(preview),

        "columns":
            columns,

        "preview":
            preview,

    }