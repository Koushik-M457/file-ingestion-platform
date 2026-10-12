from pathlib import Path

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    HTTPException,
)

from app.services.file_service import (
    save_original_file
)

from app.services.ingestion import (
    create_raw_table
)


router = APIRouter(
    prefix="/api",
    tags=["Upload"]
)


ALLOWED_EXTENSIONS = {
    ".csv",
    ".xlsx",
    ".xls",
}


@router.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...)
):

    # -----------------------------------------
    # Validate files
    # -----------------------------------------

    if not files:

        raise HTTPException(
            status_code=400,
            detail="At least one file is required."
        )


    uploaded_files = []


    try:

        # -----------------------------------------
        # Process every uploaded file
        # -----------------------------------------

        for file in files:

            # -------------------------------------
            # Validate filename
            # -------------------------------------

            if not file.filename:

                raise HTTPException(
                    status_code=400,
                    detail="Filename is required."
                )


            # -------------------------------------
            # Validate extension
            # -------------------------------------

            extension = Path(
                file.filename
            ).suffix.lower()


            if extension not in ALLOWED_EXTENSIONS:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Unsupported file: "
                        f"{file.filename}. "
                        "Only CSV, XLSX and XLS "
                        "files are supported."
                    )
                )


            # -------------------------------------
            # Save ORIGINAL file
            # -------------------------------------

            saved = save_original_file(
                file
            )


            # -------------------------------------
            # Create RAW + WORKING tables
            # -------------------------------------

            metadata = create_raw_table(

                file_path=
                    saved["stored_path"],

                original_filename=
                    saved["original_filename"],

                extension=
                    extension,

                file_id=
                    saved["file_id"],

            )


            # -------------------------------------
            # Store metadata
            # -------------------------------------

            uploaded_files.append({

                "file_id":
                    saved["file_id"],

                "filename":
                    saved["original_filename"],

                "original_locked":
                    True,

                "rows":
                    metadata["rows"],

                "columns":
                    metadata["columns"],

                "column_names":
                    metadata["column_names"],

                "raw_table":
                    metadata["raw_table"],

                "working_table":
                    metadata["working_table"],

                "table_name":
                    metadata["table_name"],

            })


        # -----------------------------------------
        # Return all uploaded files
        # -----------------------------------------

        return {

            "status":
                "success",

            "count":
                len(uploaded_files),

            "files":
                uploaded_files,

        }


    except HTTPException:

        raise


    except Exception as error:

        raise HTTPException(

            status_code=500,

            detail=str(error)

        )