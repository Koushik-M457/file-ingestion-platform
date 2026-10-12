from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.sql_transform import execute_transform


router = APIRouter(
    prefix="/api",
    tags=["Transform"]
)


class TransformRequest(BaseModel):

    sql: str

    output_table: str


@router.post("/transform")
def transform(
    request: TransformRequest
):

    try:

        result = execute_transform(
            sql=request.sql,
            output_table=request.output_table,
        )

        return result

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:

        print(
            "TRANSFORM ERROR:",
            repr(error)
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )