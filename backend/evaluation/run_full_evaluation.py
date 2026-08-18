import asyncio
import time
import sys
from pathlib import Path

from sqlalchemy import select


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.models.evaluation import EvaluationQuestion  # noqa: E402
from app.services.embedding_service import embed_texts  # noqa: E402
from app.services.evaluation_service import run_and_store_evaluation  # noqa: E402
from app.services.evaluation_summary_service import get_evaluation_summary  # noqa: E402
from app.services.reranker_service import get_reranker_model  # noqa: E402


RAG_TYPES = ["naive", "advanced", "agentic"]


async def load_question_keys() -> list[str]:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(EvaluationQuestion.question_key).order_by(
                EvaluationQuestion.question_key
            )
        )
        return [row.question_key for row in rows]


def warm_up_local_models() -> None:
    embed_texts(["warm up retrieval evaluation"])
    model = get_reranker_model()
    model.predict(
        [("warm up query", "warm up document")],
        show_progress_bar=False,
    )


async def print_summary(title: str) -> None:
    summary = await get_evaluation_summary()
    print(title)
    print("=" * len(title))
    for difficulty in ["simple", "ambiguous", "complex", "overall"]:
        for rag_type in RAG_TYPES:
            row = summary[difficulty][rag_type]
            print(
                f"{difficulty}.{rag_type}: "
                f"count={row['question_count']} "
                f"hit={row['avg_hit_at_k']} "
                f"precision={row['avg_precision_at_k']} "
                f"mrr={row['avg_mrr']} "
                f"coverage={row['avg_intent_coverage_at_k']} "
                f"total_ms={row['avg_total_ms']} "
                f"tokens={row['avg_total_tokens']} "
                f"rounds={row['avg_search_rounds']} "
                f"steps={row['avg_step_count']}"
            )


async def main() -> None:
    engine.echo = False
    await print_summary("Smoke Summary Before Full Evaluation")

    print("Warming up local models")
    warm_started_at = time.perf_counter()
    warm_up_local_models()
    print(f"Warm-up seconds: {time.perf_counter() - warm_started_at:.2f}")

    question_keys = await load_question_keys()
    total = len(question_keys) * len(RAG_TYPES)
    successes = 0
    failures: list[tuple[str, str, str]] = []

    started_at = time.perf_counter()
    index = 0
    for question_key in question_keys:
        for rag_type in RAG_TYPES:
            index += 1
            print(f"[{index}/{total}] {question_key} - {rag_type}", flush=True)
            try:
                result = await run_and_store_evaluation(
                    question_key=question_key,
                    rag_type=rag_type,
                    top_k=5,
                )
            except Exception as exc:
                failures.append((question_key, rag_type, str(exc)))
                print(f"FAILED: {question_key} - {rag_type}: {exc}", flush=True)
                continue

            successes += 1
            print(
                f"OK: {result.saved_action} "
                f"hit={result.hit_at_k:.3f} "
                f"precision={result.precision_at_k:.3f} "
                f"coverage={result.intent_coverage_at_k:.3f}",
                flush=True,
            )

    elapsed = time.perf_counter() - started_at
    print(f"Full evaluation seconds: {elapsed:.2f}")
    print(f"success={successes}")
    print(f"failed={len(failures)}")
    for question_key, rag_type, error in failures:
        print(f"failure={question_key},{rag_type},{error}")

    await print_summary("Final Summary")


if __name__ == "__main__":
    asyncio.run(main())
