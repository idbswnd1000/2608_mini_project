import asyncio
import time
from pathlib import Path

import sys
from sqlalchemy import func, select, text


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, create_tables, engine  # noqa: E402
from app.models.chunk import Chunk  # noqa: E402
from app.models.document import Document  # noqa: E402
from app.services.chunk_service import (  # noqa: E402
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    split_text_into_chunks,
)
from app.services.embedding_service import (  # noqa: E402
    EMBEDDING_DIMENSION,
    EMBEDDING_MODEL_NAME,
    embed_texts,
    get_embedding_model,
)


BATCH_SIZE = 32
DOCUMENT_PAGE_SIZE = 100
PROGRESS_LOG_INTERVAL = 100


async def ensure_chunk_index() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_chunks_document_id_chunk_index "
                    "ON chunks (document_id, chunk_index)"
                )
            )


async def count_documents_with_chunks() -> int:
    async with AsyncSessionLocal() as session:
        return await session.scalar(
            select(func.count(func.distinct(Chunk.document_id)))
        ) or 0


async def fetch_document_page(last_document_id: int) -> list[tuple[int, str]]:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(Document.id, Document.content)
            .where(Document.id > last_document_id)
            .order_by(Document.id)
            .limit(DOCUMENT_PAGE_SIZE)
        )
        return [(row.id, row.content) for row in rows]


async def document_has_chunks(document_id: int) -> bool:
    async with AsyncSessionLocal() as session:
        chunk_id = await session.scalar(
            select(Chunk.id).where(Chunk.document_id == document_id).limit(1)
        )
        return chunk_id is not None


async def save_document_chunks(
    document_id: int,
    chunks: list[str],
    embeddings: list[list[float]],
) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            existing_chunk_id = await session.scalar(
                select(Chunk.id).where(Chunk.document_id == document_id).limit(1)
            )
            if existing_chunk_id is not None:
                return

            session.add_all(
                [
                    Chunk(
                        document_id=document_id,
                        chunk_index=index,
                        content=chunk,
                        embedding=embeddings[index],
                    )
                    for index, chunk in enumerate(chunks)
                ]
            )


async def build_embeddings() -> dict[str, int | float]:
    engine.echo = False
    started_at = time.perf_counter()

    await create_tables()
    await ensure_chunk_index()

    async with AsyncSessionLocal() as session:
        total_documents = await session.scalar(select(func.count()).select_from(Document)) or 0

    initially_processed_documents = await count_documents_with_chunks()
    target_documents = total_documents - initially_processed_documents

    print("Build Chunk Embeddings")
    print("======================")
    print(f"Embedding model: {EMBEDDING_MODEL_NAME}")
    print(f"Embedding dimension: {EMBEDDING_DIMENSION}")
    print(f"Device: cpu")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Chunk size: {DEFAULT_CHUNK_SIZE}")
    print(f"Chunk overlap: {DEFAULT_CHUNK_OVERLAP}")
    print(f"Total documents: {total_documents}")
    print(f"Target documents: {target_documents}")
    print(f"Already processed documents: {initially_processed_documents}")

    if target_documents > 0:
        get_embedding_model()

    processed_documents = 0
    skipped_documents = 0
    created_chunks = 0
    last_document_id = 0

    while True:
        documents = await fetch_document_page(last_document_id)
        if not documents:
            break

        for document_id, content in documents:
            last_document_id = document_id

            if await document_has_chunks(document_id):
                skipped_documents += 1
                continue

            if (
                processed_documents == 0
                or processed_documents % PROGRESS_LOG_INTERVAL == 0
            ):
                print(f"Processing document id={document_id}")
            chunks = split_text_into_chunks(content)
            if not chunks:
                skipped_documents += 1
                print(f"Skipping document id={document_id}: no chunks")
                continue

            try:
                embeddings = embed_texts(chunks, batch_size=BATCH_SIZE)
                await save_document_chunks(document_id, chunks, embeddings)
            except Exception as exc:
                print(f"Failed document id={document_id}: {exc}")
                raise

            processed_documents += 1
            created_chunks += len(chunks)
            if processed_documents % PROGRESS_LOG_INTERVAL == 0:
                print(
                    f"Progress processed={processed_documents} "
                    f"created_chunks={created_chunks} "
                    f"embedding_dim={len(embeddings[0])}"
                )

    async with AsyncSessionLocal() as session:
        total_chunks = await session.scalar(select(func.count()).select_from(Chunk)) or 0

    elapsed = time.perf_counter() - started_at
    print("Done")
    print(f"Processed documents: {processed_documents}")
    print(f"Skipped documents: {skipped_documents}")
    print(f"Created chunks: {created_chunks}")
    print(f"Final chunks total rows: {total_chunks}")
    print(f"Elapsed seconds: {elapsed:.2f}")

    return {
        "total_documents": total_documents,
        "target_documents": target_documents,
        "processed_documents": processed_documents,
        "skipped_documents": skipped_documents,
        "created_chunks": created_chunks,
        "total_chunks": total_chunks,
        "elapsed_seconds": elapsed,
    }


async def main() -> None:
    await build_embeddings()


if __name__ == "__main__":
    asyncio.run(main())
