from dataclasses import dataclass

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.services.embedding_service import embed_texts


@dataclass
class SearchResult:
    chunk_id: int
    document_id: int
    content: str
    distance: float
    similarity: float


def to_vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(str(value) for value in vector) + "]"


async def search_similar_chunks(query: str, top_k: int = 5) -> list[SearchResult]:
    query_vector = embed_texts([query])[0]
    return await search_similar_chunks_by_vector(query_vector, top_k=top_k)


async def search_similar_chunks_by_vector(
    query_vector: list[float],
    top_k: int = 5,
) -> list[SearchResult]:

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT
                    id,
                    document_id,
                    content,
                    embedding <=> CAST(:query_vector AS vector) AS distance
                FROM chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:query_vector AS vector)
                LIMIT :top_k
                """
            ),
            {
                "query_vector": to_vector_literal(query_vector),
                "top_k": top_k,
            },
        )

        return [
            SearchResult(
                chunk_id=row.id,
                document_id=row.document_id,
                content=row.content,
                distance=float(row.distance),
                similarity=1.0 - float(row.distance),
            )
            for row in rows
        ]
