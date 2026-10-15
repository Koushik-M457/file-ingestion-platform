from pathlib import Path
import os
import shutil
import uuid


ORIGINALS_DIR = Path("storage/originals")
ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)


def save_original_file(upload_file):
    file_id = str(uuid.uuid4())

    extension = Path(upload_file.filename).suffix.lower()

    stored_name = f"{file_id}{extension}"

    destination = ORIGINALS_DIR / stored_name

    with destination.open("wb") as buffer:
        shutil.copyfileobj(
            upload_file.file,
            buffer,
            length=8 * 1024 * 1024,
        )

    # LOCK the original: read-only on disk
    os.chmod(destination, 0o444)

    return {
        "file_id": file_id,
        "original_filename": upload_file.filename,
        "stored_path": str(destination),
    }