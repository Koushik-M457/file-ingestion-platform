from pathlib import Path
import pandas as pd
import re

from app.database import get_connection

# Sanitize table name

def sanitize_table_name(name: str) -> str:

    name = Path(name).stem.lower()

    name = re.sub(
        r"[^a-zA-Z0-9_]",
        "_",
        name
    )

    name = re.sub(
        r"_+",
        "_",
        name
    )

    name = name.strip("_")

    if not name:
        name = "uploaded_data"

    if name[0].isdigit():
        name = f"table_{name}"

    return name

# Convert Pandas datatype to UI/DuckDB datatype

def get_column_type(series) -> str:

    pandas_type = str(
        series.dtype
    ).lower()


    # Integer

    if (
        pandas_type.startswith("int")
        or pandas_type.startswith("uint")
    ):

        return "BIGINT"


    # Floating point

    if pandas_type.startswith("float"):

        return "DOUBLE"


    # Boolean

    if pandas_type == "bool":

        return "BOOLEAN"


    # Datetime

    if (
        "datetime" in pandas_type
        or "timestamp" in pandas_type
    ):

        return "TIMESTAMP"


    # Date

    if pandas_type == "date":

        return "DATE"


    # Everything else

    return "VARCHAR"


# Create RAW + STAGING + MAIN view

def create_raw_table(
    file_path: str,
    original_filename: str,
    extension: str,
    file_id: str,
):

    connection = get_connection()

    # Read file

    if extension.lower() == ".csv":

        dataframe = pd.read_csv(
            file_path
        )

    elif extension.lower() in [
        ".xlsx",
        ".xls"
    ]:

        dataframe = pd.read_excel(
            file_path
        )

    else:

        raise ValueError(
            "Unsupported file type"
        )


    # Clean column names
    dataframe.columns = [

        str(column).strip()

        for column in dataframe.columns

    ]
    # Clean table name


    table_name = sanitize_table_name(
        original_filename
    )


    print(
        f"Uploading {original_filename}"
    )

    print(
        f"Table name: {table_name}"
    )

    # Build column metadata
   

    column_metadata = []


    for column in dataframe.columns:

        column_type = get_column_type(
            dataframe[column]
        )


        column_metadata.append({

            "name":
                str(column),

            "type":
                column_type,

        })


    print(
        f"Column metadata: {column_metadata}"
    )

    # Register dataframe

    connection.register(
        "uploaded_dataframe",
        dataframe
    )


    try:

        # RAW TABLE

        connection.execute(
            f"""
            CREATE OR REPLACE TABLE
            raw."{table_name}"
            AS
            SELECT *
            FROM uploaded_dataframe
            """
        )


        # STAGING TABLE
        #
        # Working copy
        

        connection.execute(
            f"""
            CREATE OR REPLACE TABLE
            staging."{table_name}"
            AS
            SELECT *
            FROM raw."{table_name}"
            """
        )


        # USER-FACING VIEW

        connection.execute(
            f"""
            CREATE OR REPLACE VIEW
            main."{table_name.upper()}"
            AS
            SELECT *
            FROM staging."{table_name}"
            """
        )

        # VERIFY TABLE

        test = connection.execute(
            f"""
            SELECT COUNT(*)
            FROM main."{table_name.upper()}"
            """
        ).fetchone()


        print(
            f"Created main.{table_name.upper()}"
        )

        print(
            f"Rows available: {test[0]}"
        )


    finally:

        # Remove registered dataframe

        connection.unregister(
            "uploaded_dataframe"
        )


    # Return upload information

    return {

        # Original file

        "filename":
            original_filename,


        "file_id":
            file_id,



        # Dataset information
    

        "rows":
            len(dataframe),


        "columns":
            len(dataframe.columns),

        # Keep existing column_names

        "column_names":
            list(dataframe.columns),


        # New datatype metadata
      

        "column_metadata":
            column_metadata,

        # Database tables
      

        "raw_table":
            f"raw.{table_name}",


        "working_table":
            f"staging.{table_name}",


        "table_name":
            table_name.upper(),

    }