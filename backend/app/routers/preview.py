from fastapi import (
    APIRouter,
    HTTPException,
    Query,
)

from app.services.preview_service import (
    get_table_preview
)


router = APIRouter(
    prefix="/api",
    tags=["Preview"]
)


@router.get(
    "/preview/{schema}/{table}"
)
def preview_table(
    schema: str,
    table: str,
    limit: int = Query(
        default=100,
        ge=1,
        le=500
    )
):

    try:

        result = get_table_preview(
            schema=schema,
            table=table,
            limit=limit
        )

        return {
            "status": "success",
            **result
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=f"Preview failed: {error}"
        )