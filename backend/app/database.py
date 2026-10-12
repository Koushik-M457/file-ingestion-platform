import duckdb

from pathlib import Path
from threading import RLock


# ============================================================
# DATABASE PATH
# ============================================================

DATABASE_DIR = Path("storage/database")

DATABASE_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

DATABASE_PATH = (
    DATABASE_DIR / "analytics.duckdb"
)


# ============================================================
# SHARED DUCKDB CONNECTION
# ============================================================

connection = duckdb.connect(
    str(DATABASE_PATH)
)


# ============================================================
# DATABASE LOCK
# ============================================================

database_lock = RLock()


def get_connection():
    return connection


def get_database_lock():
    return database_lock


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def initialize_database():

    with database_lock:

        connection.execute(
            """
            CREATE SCHEMA IF NOT EXISTS raw;

            CREATE SCHEMA IF NOT EXISTS staging;

            CREATE SCHEMA IF NOT EXISTS model;

            CREATE SCHEMA IF NOT EXISTS metadata;
            """
        )