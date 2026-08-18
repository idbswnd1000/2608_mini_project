import asyncio
import sys
from dataclasses import asdict
from pathlib import Path

from sqlalchemy import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.evaluation import EvaluationQuestion  # noqa: E402
from app.services.retrieval_evaluation_service import (  # noqa: E402
    calculate_retrieval_metrics,
    get_chunk_intents,
)
from app.services.vector_search_service import search_similar_chunks  # noqa: E402


QUESTION_KEYS = ["simple_01", "ambiguous_01", "complex_01"]


async def load_question(question_key: str) -> EvaluationQuestion:
    async with AsyncSessionLocal() as session:
        question = await session.scalar(
            select(EvaluationQuestion).where(
                EvaluationQuestion.question_key == question_key
            )
        )
        if question is None:
            raise RuntimeError(f"evaluation question not found: {question_key}")
        return question


async def evaluate_question(question_key: str) -> None:
    question = await load_question(question_key)
    results = await search_similar_chunks(question.question, top_k=5)
    chunk_ids = [result.chunk_id for result in results]
    retrieved_intents = await get_chunk_intents(chunk_ids)
    metrics = calculate_retrieval_metrics(
        expected_intents=question.expected_intents,
        retrieved_intents=retrieved_intents,
    )

    print(f"[{question.difficulty}] {question.question_key}")
    print(f"question={question.question}")
    print(f"expected_intents={question.expected_intents}")
    print(f"retrieved_chunk_ids={chunk_ids}")
    print(f"retrieved_intents={retrieved_intents}")
    print(f"metrics={asdict(metrics)}")
    print()


async def main() -> None:
    engine.echo = False
    for question_key in QUESTION_KEYS:
        await evaluate_question(question_key)


if __name__ == "__main__":
    asyncio.run(main())
