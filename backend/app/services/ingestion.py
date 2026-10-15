import re
import time
from pathlib import Path
from threading import RLock

import duckdb
import pandas as pd

from app.database import get_connection


# serializes the small view-creation step between concurrent uploads
_view_lock = RLock()


# ============================================================
# Sanitize table name
# ============================================================

def sanitize_table_name(name: str) -> str:

    name = Path(name).stem.lower()

    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)

    name = re.sub(r"_+", "_", name)

    name = name.strip("_")

    if not name:
        name = "uploaded_data"

    if name[0].isdigit():
        name = f"table_{name}"

    return name


# ============================================================
# Helpers
# ============================================================

def _drop_object(con, schema: str, name: str, views_only: bool = False):
    """Drop schema.name whether it is a table or a view."""

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


def _read_excel(file_path: str) -> pd.DataFrame:

    # calamine is several times faster than openpyxl
    try:
        return pd.read_excel(file_path, engine="calamine")

    except (ImportError, ValueError):
        return pd.read_excel(file_path)


def _load_dataframe(con, table_name: str, dataframe: pd.DataFrame):

    dataframe.columns = [str(c).strip() for c in dataframe.columns]

    con.register("uploaded_dataframe", dataframe)

    try:
        con.execute(
            f"""
            CREATE OR REPLACE TABLE raw."{table_name}" AS
            SELECT * FROM uploaded_dataframe
            """
        )

    finally:
        con.unregister("uploaded_dataframe")


# ============================================================
# Create RAW (locked) + STAGING (working) + MODEL + MAIN
# ============================================================

def create_raw_table(
    file_path: str,
    original_filename: str,
    extension: str,
    file_id: str,
):

    extension = extension.lower()

    if extension not in (".csv", ".xlsx", ".xls"):
        raise ValueError("Unsupported file type")

    table_name = sanitize_table_name(original_filename)

    # private cursor for this upload (never shared between threads)
    con = get_connection().cursor()

    started = time.perf_counter()

    # --------------------------------------------------------
    # 1. LOAD -> raw."<table>"   (LOCKED copy, never edited)
    # --------------------------------------------------------

    _drop_object(con, "raw", table_name)

    if extension == ".csv":

        try:
            # multi-threaded, no pandas, real types detected
            con.execute(
                f"""
                CREATE OR REPLACE TABLE raw."{table_name}" AS
                SELECT * FROM read_csv(?)
                """,
                [file_path],
            )

        except duckdb.Error:

            # odd encodings / malformed rows: fall back to pandas
            dataframe = pd.read_csv(
                file_path,
                low_memory=False,
                encoding_errors="replace",
            )

            _load_dataframe(con, table_name, dataframe)

    else:

        _load_dataframe(con, table_name, _read_excel(file_path))

    loaded = time.perf_counter()

    # --------------------------------------------------------
    # 2. WORKING COPY -> staging."<table>"
    #    used by the transformer and the data model
    # --------------------------------------------------------

    _drop_object(con, "staging", table_name)

    con.execute(
        f"""
        CREATE TABLE staging."{table_name}" AS
        SELECT * FROM raw."{table_name}"
        """
    )

    copied = time.perf_counter()

    # --------------------------------------------------------
    # 3. USER-FACING VIEW + DATA MODEL VIEW (over the working copy)
    # --------------------------------------------------------

    with _view_lock:

        _drop_object(con, "main", table_name.upper())

        con.execute(
            f"""
            CREATE VIEW main."{table_name.upper()}" AS
            SELECT * FROM staging."{table_name}"
            """
        )

        # keep an existing mapped/transformed TABLE in model,
        # replace only a plain view
        has_real_model_table = con.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'model'
              AND lower(table_name) IN (lower(?), lower(?))
              AND table_type <> 'VIEW'
            """,
            [table_name, f"{table_name}_mapped"],
        ).fetchone()[0]

        if not has_real_model_table:

            _drop_object(con, "model", table_name, views_only=True)

            con.execute(
                f"""
                CREATE VIEW model."{table_name}" AS
                SELECT * FROM staging."{table_name}"
                """
            )

    # --------------------------------------------------------
    # 4. METADATA
    # --------------------------------------------------------

    described = con.execute(
        f'DESCRIBE raw."{table_name}"'
    ).fetchall()

    column_metadata = [
        {"name": str(row[0]), "type": str(row[1])}
        for row in described
    ]

    column_names = [item["name"] for item in column_metadata]

    row_count = con.execute(
        f'SELECT COUNT(*) FROM raw."{table_name}"'
    ).fetchone()[0]

    # clear cached chart results if the caching helper exists
    try:
        from app.database import bump_data_version
        bump_data_version()
    except ImportError:
        pass

    print(
        f"[ingest] {original_filename}: {row_count} rows, "
        f"load {loaded - started:.2f}s, "
        f"copy {copied - loaded:.2f}s, "
        f"total {time.perf_counter() - started:.2f}s"
    )

    # --------------------------------------------------------
    # 5. RETURN  (upload.py reads these keys)
    # --------------------------------------------------------

    return {
        "filename": original_filename,
        "file_id": file_id,
        "rows": row_count,
        "columns": len(column_names),
        "column_names": column_names,
        "column_metadata": column_metadata,
        "raw_table": f"raw.{table_name}",
        "working_table": f"staging.{table_name}",
        "model_table": f"model.{table_name}",
        "table_name": table_name.upper(),
    }