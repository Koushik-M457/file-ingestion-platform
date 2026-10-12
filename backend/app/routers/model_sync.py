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