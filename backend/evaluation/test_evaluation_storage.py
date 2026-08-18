import asyncio
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.evaluation import EvaluationQuestion, EvaluationResult  # noqa: E402
from app.services.evaluation_service import run_and_store_evaluation  # noqa: E402


QUESTION_KEYS = ["simple_01", "ambiguous_01", "complex_01"]
RAG_TYPES = ["naive", "advanced", "agentic"]


async def print_db_summary() -> None:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(
                EvaluationQuestion.question_key,
                EvaluationQuestion.difficulty,
                EvaluationResult.rag_type,
                EvaluationResult.hit_at_k,
                EvaluationResult.precision_at_k,
                EvaluationResult.mrr,
                EvaluationResult.intent_coverage_at_k,
                EvaluationResult.total_ms,
                EvaluationResult.total_tokens,
                EvaluationResult.search_rounds,
            )
            .join(
                EvaluationResult,
                EvaluationResult.evaluation_question_id == EvaluationQuestion.id,
            )
            .where(EvaluationQuestion.question_key.in_(QUESTION_KEYS))
            .order_by(EvaluationQuestion.question_key, EvaluationResult.rag_type)
        )

        grouped = defaultdict(list)
        for row in rows:
            grouped[(row.question_key, row.difficulty)].append(row)

    for (question_key, difficulty), results in grouped.items():
        print(f"Question ID: {question_key}")
        print(f"Difficulty: {difficulty}")
        for row in results:
            label = row.rag_type.capitalize()
            print(
                f"{label}: "
                f"Hit@5={row.hit_at_k:.3f}, "
                f"Precision@5={row.precision_at_k:.3f}, "
                f"MRR={row.mrr:.3f}, "
                f"Coverage@5={row.intent_coverage_at_k:.3f}, "
                f"total_ms={row.total_ms}, "
                f"total_tokens={row.total_tokens}, "
                f"search_rounds={row.search_rounds}"
            )
        print()


async def main() -> None:
    engine.echo = False
    for question_key in QUESTION_KEYS:
        for rag_type in RAG_TYPES:
            result = await run_and_store_evaluation(
                question_key=question_key,
                rag_type=rag_type,
                top_k=5,
            )
            print(
                f"{result.saved_action}: "
                f"{result.question_key} {result.rag_type} "
                f"result_id={result.saved_result_id}"
            )

    print()
    await print_db_summary()


if __name__ == "__main__":
    asyncio.run(main())
