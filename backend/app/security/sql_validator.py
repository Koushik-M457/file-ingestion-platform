import re


FORBIDDEN_KEYWORDS = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "MERGE",
    "REPLACE",
    "GRANT",
    "REVOKE",
    "CREATE",
    "ATTACH",
    "DETACH",
    "COPY",
    "EXPORT",
    "IMPORT",
    "INSTALL",
    "LOAD",
    "CALL",
]


def remove_sql_comments(sql: str) -> str:

    # Remove -- comments
    sql = re.sub(
        r"--.*?$",
        "",
        sql,
        flags=re.MULTILINE
    )

    # Remove /* ... */ comments
    sql = re.sub(
        r"/\*.*?\*/",
        "",
        sql,
        flags=re.DOTALL
    )

    return sql


def validate_sql(sql: str) -> str:

    if not sql:
        raise ValueError(
            "SQL query cannot be empty."
        )

    # Remove comments
    sql = remove_sql_comments(sql)

    sql = sql.strip()

    # Remove trailing semicolon
    sql = sql.rstrip(";").strip()

    if not sql:
        raise ValueError(
            "SQL query cannot be empty."
        )

    # Only one statement
    if ";" in sql:
        raise ValueError(
            "Only one SQL statement is allowed."
        )

    # Only SELECT / WITH
    if not re.match(
        r"^(SELECT|WITH)\b",
        sql,
        re.IGNORECASE
    ):
        raise ValueError(
            "Transformation SQL must start with SELECT or WITH."
        )

    upper_sql = sql.upper()

    # Prevent modification of source data
    for keyword in FORBIDDEN_KEYWORDS:

        pattern = rf"\b{keyword}\b"

        if re.search(
            pattern,
            upper_sql
        ):
            raise ValueError(
                f"SQL operation '{keyword}' is not allowed."
            )

    return sql