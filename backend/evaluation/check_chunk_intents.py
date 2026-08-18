import asyncio
import sys
from pathlib import Path

from sqlalchemy import text


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.services.vector_search_service import search_similar_chunks  # noqa: E402


QUESTION = "How can I track my order?"


async def main() -> None:
    engine.echo = False
    results = await search_similar_chunks(QUESTION, top_k=5)
    chunk_ids = [result.chunk_id for result in results]

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT
                    c.id AS chunk_id,
                    c.document_id,
                    d.source_id AS customer_support_id,
                    cs.intent
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                JOIN customer_support cs
                  ON d.source_type = 'customer_support'
                 AND d.source_id = cs.id
                WHERE c.id = ANY(:chunk_ids)
                ORDER BY array_position(:chunk_ids, c.id)
                """
            ),
            {"chunk_ids": chunk_ids},
        )

        print(f"Question: {QUESTION}")
        for row in rows:
            print(
                f"chunk_id={row.chunk_id} "
                f"document_id={row.document_id} "
                f"customer_support_id={row.customer_support_id} "
                f"intent={row.intent}"
            )


if __name__ == "__main__":
    asyncio.run(main())
