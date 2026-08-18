from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import text

from app.core.config import settings
from app.models.base import Base


engine = create_async_engine(
    settings.database_url,
    echo=True,
)


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS source_type VARCHAR(50)"
            )
        )
        await connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS source_id INTEGER"
            )
        )
        await connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS "
                "ix_documents_source_type_source_id "
                "ON documents (source_type, source_id)"
            )
        )
        await connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "uq_documents_source_type_source_id "
                "ON documents (source_type, source_id) "
                "WHERE source_type IS NOT NULL AND source_id IS NOT NULL"
            )
        )
        await connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "uq_chunks_document_id_chunk_index "
                "ON chunks (document_id, chunk_index)"
            )
        )
