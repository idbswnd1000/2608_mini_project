from dataclasses import dataclass

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


@dataclass
class RetrievalMetrics:
    hit_at_k: float
    precision_at_k: float
    mrr: float
    intent_coverage_at_k: float


async def get_chunk_intents(chunk_ids: list[int]) -> list[str | None]:
    if not chunk_ids:
        return []

    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT
                    c.id AS chunk_id,
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
        intent_by_chunk_id = {
            row.chunk_id: row.intent
            for row in rows
        }

    return [intent_by_chunk_id.get(chunk_id) for chunk_id in chunk_ids]


def calculate_retrieval_metrics(
    expected_intents: list[str],
    retrieved_intents: list[str | None],
) -> RetrievalMetrics:
    if not retrieved_intents:
        return RetrievalMetrics(
            hit_at_k=0.0,
            precision_at_k=0.0,
            mrr=0.0,
            intent_coverage_at_k=0.0,
        )

    expected = set(expected_intents)
    relevant_flags = [
        intent in expected
        for intent in retrieved_intents
    ]
    relevant_count = sum(1 for is_relevant in relevant_flags if is_relevant)

    hit_at_k = 1.0 if relevant_count > 0 else 0.0
    precision_at_k = relevant_count / len(retrieved_intents)

    mrr = 0.0
    for index, is_relevant in enumerate(relevant_flags, start=1):
        if is_relevant:
            mrr = 1.0 / index
            break

    found_expected_intents = {
        intent
        for intent in retrieved_intents
        if intent in expected
    }
    intent_coverage_at_k = (
        len(found_expected_intents) / len(expected)
        if expected
        else 0.0
    )

    return RetrievalMetrics(
        hit_at_k=hit_at_k,
        precision_at_k=precision_at_k,
        mrr=mrr,
        intent_coverage_at_k=intent_coverage_at_k,
    )
