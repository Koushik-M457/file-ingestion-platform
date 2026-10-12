from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection


router = APIRouter(
    prefix="/api",
    tags=["Column Mapping"]
)


# ============================================================
# REQUEST MODELS
# ============================================================

class ColumnMapping(BaseModel):
    source: str
    target: str
    type: str
    include: bool


class ColumnMappingRequest(BaseModel):
    table_name: str
    mappings: list[ColumnMapping]


# ============================================================
# COLUMN MAPPING
# ============================================================

@router.post("/column-mapping")
def apply_column_mapping(
    request: ColumnMappingRequest
):

    connection = get_connection()


    # ========================================================
    # SOURCE TABLE
    # ========================================================

    source_table = (
        request.table_name
        .strip()
        .lower()
    )


    print("========================================")
    print("COLUMN MAPPING")
    print(f"Source : staging.{source_table}")
    print("========================================")


    # ========================================================
    # CHECK SOURCE TABLE
    # ========================================================

    exists = connection.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'staging'
        AND table_name = ?
        """,
        [source_table]
    ).fetchone()[0]


    if not exists:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Working table "
                f"staging.{source_table} "
                f"does not exist."
            )
        )


    # ========================================================
    # ALLOWED TYPES
    # ========================================================

    allowed_types = {
        "VARCHAR",
        "INTEGER",
        "BIGINT",
        "DOUBLE",
        "DECIMAL",
        "DATE",
        "TIMESTAMP",
        "BOOLEAN",
    }


    expressions = []


    # ========================================================
    # BUILD CAST EXPRESSIONS
    # ========================================================

    for mapping in request.mappings:

        if not mapping.include:
            continue


        source = mapping.source.strip()
        target = mapping.target.strip()


        data_type = (
            mapping.type
            .strip()
            .upper()
        )


        # ----------------------------------------------------
        # STRING -> VARCHAR
        # ----------------------------------------------------

        if data_type == "STRING":

            data_type = "VARCHAR"


        # ----------------------------------------------------
        # Validate source
        # ----------------------------------------------------

        if not source.replace(
            "_", ""
        ).isalnum():

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid source "
                    f"column: {source}"
                )
            )


        # ----------------------------------------------------
        # Validate target
        # ----------------------------------------------------

        if not target.replace(
            "_", ""
        ).isalnum():

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid target "
                    f"column: {target}"
                )
            )


        # ----------------------------------------------------
        # Validate datatype
        # ----------------------------------------------------

        if data_type not in allowed_types:

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported data type: "
                    f"{mapping.type}"
                )
            )


        # ----------------------------------------------------
        # CAST EVERY ROW
        # ----------------------------------------------------
        #
        # This is applied to ALL rows in staging table.
        #
        # Example:
        #
        # CAST("BUKRS" AS VARCHAR)
        #
        # If BKPF has 1835 rows,
        # all 1835 BUKRS values are converted.
        # ----------------------------------------------------

        expression = (
            f'CAST("{source}" AS {data_type}) '
            f'AS "{target}"'
        )


        expressions.append(
            expression
        )


    # ========================================================
    # VALIDATE COLUMNS
    # ========================================================

    if not expressions:

        raise HTTPException(
            status_code=400,
            detail="No columns selected."
        )


    # ========================================================
    # SELECT CLAUSE
    # ========================================================

    select_sql = ",\n".join(
        expressions
    )


    # ========================================================
    # OUTPUT TABLE
    # ========================================================
    #
    # BKPF -> model.bkpf
    # BSEG -> model.bseg
    # LFA1 -> model.lfa1
    #
    # Original name is preserved.
    # ========================================================

    output_table = source_table


    # ========================================================
    # CREATE MODEL TABLE
    # ========================================================

    create_sql = f"""
        CREATE OR REPLACE TABLE
        model."{output_table}"
        AS
        SELECT
            {select_sql}
        FROM staging."{source_table}"
    """


    print("========================================")
    print("CREATE SQL")
    print("========================================")
    print(create_sql)
    print("========================================")


    # ========================================================
    # EXECUTE
    # ========================================================

    connection.execute(
        create_sql
    )


    # ========================================================
    # COUNT ALL ROWS
    # ========================================================

    row_count = connection.execute(
        f"""
        SELECT COUNT(*)
        FROM model."{output_table}"
        """
    ).fetchone()[0]


    print(
        f"Created model.{output_table}"
    )

    print(
        f"Total rows: {row_count}"
    )


    # ========================================================
    # GET COMPLETE TABLE
    # ========================================================
    #
    # IMPORTANT:
    #
    # NO LIMIT 100
    #
    # This retrieves all rows.
    # ========================================================

    result = connection.execute(
        f"""
        SELECT *
        FROM model."{output_table}"
        """
    )


    rows = result.fetchall()


    # ========================================================
    # COLUMNS
    # ========================================================

    column_names = [
        description[0]
        for description in result.description
    ]


    columns = [

        {
            "name": description[0],

            "type": (
                "STRING"
                if str(
                    description[1]
                ).upper() == "VARCHAR"
                else str(
                    description[1]
                ).upper()
            )
        }

        for description in result.description

    ]


    # ========================================================
    # COMPLETE PREVIEW
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
    # RESPONSE
    # ========================================================

    return {

        "status": "success",

        "table":
            f"model.{output_table}",

        "table_name":
            output_table.upper(),

        "rows":
            row_count,

        "preview_rows":
            len(preview),

        "columns":
            columns,

        "preview":
            preview,

    }