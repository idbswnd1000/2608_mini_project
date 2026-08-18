from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.core.database import create_tables, engine
from app.models import (
    Chunk,
    CustomerSupport,
    Document,
    EvaluationQuestion,
    EvaluationResult,
)
from app.routers.documents_router import router as document_router
from app.routers.evaluation_router import router as evaluation_router
from app.routers.rag_router import router as rag_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title="RAG Comparison API",
    version="1.0.0",
    lifespan=lifespan,
)


app.include_router(document_router)
app.include_router(rag_router)
app.include_router(evaluation_router)


@app.get("/")
async def root():
    return {
        "message": "RAG Comparison API",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
    }


@app.get("/db-test")
async def db_test():
    async with engine.connect() as connection:
        result = await connection.execute(
            text("SELECT version();")
        )

        return {
            "database": "connected",
            "version": result.scalar(),
        }
