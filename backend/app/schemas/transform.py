from pydantic import BaseModel, Field


class TransformRequest(BaseModel):

    sql: str = Field(
        ...,
        min_length=1
    )

    source_table: str

    output_table: str