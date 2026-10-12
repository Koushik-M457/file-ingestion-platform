from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload
from app.database import initialize_database
from app.routers.tables import router as tables_router
from app.routers.upload import router as upload_router
from app.routers.transform import router as transform_router
from app.routers.preview import router as preview_router
from app.routers.column_mapping import router as column_mapping_router
from app.routers.data_model import router as data_model_router
from app.routers import model_sync

app = FastAPI(
    title="Data Transformation API",
    version="1.0.0"
)

# CORS

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)

# Startup

@app.on_event("startup")
def startup():

    initialize_database()

# Routers

app.include_router(upload_router)

app.include_router(transform_router)

app.include_router(preview_router)

app.include_router(column_mapping_router)

app.include_router(tables_router)

app.include_router(data_model_router)

app.include_router(model_sync.router)  # Include the model_sync router

app.include_router(upload.router)  # Include the upload router
# --------------------------------------------------
# Health

@app.get("/")
def root():

    return {
        "message": "Data Transformation API"
    }


@app.get("/health")
def health():

    return {
        "status": "healthy"
    }