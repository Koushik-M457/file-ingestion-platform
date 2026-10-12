from fastapi import APIRouter

from app.database import get_connection


router = APIRouter(
    prefix="/api",
    tags=["Tables"]
)


@router.get("/tables")
def get_tables():

    connection = get_connection()

    tables = connection.execute(
        """
        SELECT
            table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        AND table_type = 'VIEW'
        ORDER BY table_name
        """
    ).fetchall()

    result = []

    for row in tables:

        table_name = row[0]

        count = connection.execute(
            f'''
            SELECT COUNT(*)
            FROM "{table_name}"
            '''
        ).fetchone()[0]

        columns = connection.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = 'main'
            AND table_name = ?
            """,
            [table_name]
        ).fetchone()[0]

        result.append({
            "table_name": table_name,
            "rows": count,
            "columns": columns
        })

    return {
        "tables": result
    }