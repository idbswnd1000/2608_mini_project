import asyncio
import sys
from pathlib import Path

from sqlalchemy import text


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.services.embedding_service import embed_texts  # noqa: E402


QUESTION = "How can I track my order?"


def to_vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(str(value) for value in vector) + "]"


async def main() -> None:
    engine.echo = False
    query_vector = embed_texts([QUESTION])[0]

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT
                    id,
                    document_id,
                    embedding <=> CAST(:query_vector AS vector) AS distance,
                    left(content, 180) AS content_preview
                FROM chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:query_vector AS vector)
                LIMIT 5
                """
            ),
            {"query_vector": to_vector_literal(query_vector)},
        )

        print(f"Question: {QUESTION}")
        print("Top 5:")
        for row in rows:
            print(
                f"- chunk_id={row.id} "
                f"document_id={row.document_id} "
                f"distance={row.distance:.6f} "
                f"content={row.content_preview!r}"
            )


if __name__ == "__main__":
    asyncio.run(main())
