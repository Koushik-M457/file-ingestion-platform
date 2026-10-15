import time
import duckdb

from contextlib import nullcontext
from pathlib import Path
from threading import RLock


# ============================================================
# DATABASE PATH
# ============================================================

DATABASE_DIR = Path("storage/database")
DATABASE_DIR.mkdir(parents=True, exist_ok=True)

TEMP_DIR = Path("storage/tmp")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATABASE_DIR / "analytics.duckdb"


# ============================================================
# ONE DATABASE, ONE CURSOR PER REQUEST
# ============================================================

_connection = duckdb.connect(str(DATABASE_PATH))

# faster bulk loads + spill big queries to disk instead of failing
_connection.execute("SET preserve_insertion_order=false")
_connection.execute(f"SET temp_directory='{TEMP_DIR.as_posix()}'")


def get_connection():
    """Every caller gets its own cursor, so a slow request
    no longer blocks the others."""
    return _connection.cursor()


# ============================================================
# LOCKS
#
# get_database_lock()  -> no-op (reads run in parallel)
# get_write_lock()     -> real lock, use it around writes that
#                         must not interleave (relationships,
#                         view sync)
# ============================================================

_write_lock = RLock()

database_lock = _write_lock


def get_database_lock():
    return nullcontext()


def get_write_lock():
    return _write_lock


# ============================================================
# SMALL RESULT CACHE (used by the chart endpoint)
# ============================================================

_cache = {}
_cache_lock = RLock()

CACHE_TTL_SECONDS = 300
CACHE_MAX_ITEMS = 500


def cache_get(key):
    with _cache_lock:
        item = _cache.get(key)

        if item and time.time() - item[0] < CACHE_TTL_SECONDS:
            return item[1]

        _cache.pop(key, None)

    return None


def cache_set(key, value):
    with _cache_lock:
        if len(_cache) >= CACHE_MAX_ITEMS:
            _cache.clear()

        _cache[key] = (time.time(), value)


def bump_data_version():
    """Call after any change to table data. Clears cached charts."""
    with _cache_lock:
        _cache.clear()


# ============================================================
# HELPER: drop a table/view whatever its type is
# ============================================================

def drop_object(con, schema, name, views_only=False):
    """Drop schema.name if it exists. With views_only=True a real
    table is left alone. Returns True if something was dropped."""

    row = con.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = ?
          AND lower(table_name) = lower(?)
        LIMIT 1
        """,
        [schema, name],
    ).fetchone()

    if not row:
        return False

    is_view = row[1] == "VIEW"

    if views_only and not is_view:
        return False

    kind = "VIEW" if is_view else "TABLE"

    con.execute(f'DROP {kind} "{schema}"."{row[0]}"')

    return True


# ============================================================
# INITIALIZE DATABASE
# ============================================================

def initialize_database():

    con = get_connection()

    con.execute(
        """
        CREATE SCHEMA IF NOT EXISTS raw;
        CREATE SCHEMA IF NOT EXISTS staging;
        CREATE SCHEMA IF NOT EXISTS model;
        CREATE SCHEMA IF NOT EXISTS metadata;
        """
    )

    con.execute(
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