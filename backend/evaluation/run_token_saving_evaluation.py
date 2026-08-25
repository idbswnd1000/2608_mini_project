import asyncio
import argparse
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import func, select, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, engine
from app.models.evaluation import EvaluationQuestion, EvaluationResult
from app.services.evaluation_service import (
    REPRESENTATIVE_FULL_QUESTION_KEYS,
    SUPPORTED_RAG_TYPES,
    run_and_store_evaluation,
)
from app.services.evaluation_summary_service import get_evaluation_summary


RAG_TYPES = ["naive", "advanced", "agentic"]


async def ensure_evaluation_mode_column() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                ALTER TABLE evaluation_results
                ADD COLUMN IF NOT EXISTS evaluation_mode VARCHAR(20)
                NOT NULL DEFAULT 'full'
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_evaluation_results_evaluation_mode
                ON evaluation_results (evaluation_mode)
                """
            )
        )


async def result_exists(
    question_key: str,
    rag_type: str,
    evaluation_mode: str,
) -> bool:
    async with AsyncSessionLocal() as session:
        result_id = await session.scalar(
            select(EvaluationResult.id)
            .join(
                EvaluationQuestion,
                EvaluationQuestion.id == EvaluationResult.evaluation_question_id,
            )
            .where(
                EvaluationQuestion.question_key == question_key,
                EvaluationResult.rag_type == rag_type,
                EvaluationResult.evaluation_mode == evaluation_mode,
            )
        )
    return result_id is not None


async def load_question_keys() -> list[str]:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(EvaluationQuestion.question_key)
            .order_by(EvaluationQuestion.difficulty, EvaluationQuestion.question_key)
        )
    return [row.question_key for row in rows]


async def count_results() -> None:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(
                EvaluationResult.evaluation_mode,
                EvaluationResult.rag_type,
                func.count(EvaluationResult.id).label("result_count"),
            )
            .group_by(EvaluationResult.evaluation_mode, EvaluationResult.rag_type)
            .order_by(EvaluationResult.evaluation_mode, EvaluationResult.rag_type)
        )
    print("Current evaluation_results:")
    for row in rows:
        print(f"- {row.evaluation_mode}.{row.rag_type}: {row.result_count}")


async def run_missing_results(
    question_keys: list[str],
    rag_types: list[str],
    evaluation_mode: str,
    force_agentic: bool = False,
) -> tuple[int, int, int]:
    completed = 0
    skipped = 0
    failed = 0
    total = len(question_keys) * len(rag_types)
    index = 0

    for question_key in question_keys:
        for rag_type in rag_types:
            index += 1
            if rag_type not in SUPPORTED_RAG_TYPES:
                raise ValueError(f"unsupported rag_type: {rag_type}")
            label = f"[{index}/{total}] {evaluation_mode} {question_key} - {rag_type}"
            force_result = (
                force_agentic
                and evaluation_mode == "retrieval"
                and rag_type == "agentic"
            )

            if not force_result and await result_exists(question_key, rag_type, evaluation_mode):
                skipped += 1
                print(f"{label} SKIP")
                continue

            print(f"{label} {'FORCE' if force_result else 'RUN'}")
            try:
                result = await run_and_store_evaluation(
                    question_key=question_key,
                    rag_type=rag_type,
                    top_k=5,
                    evaluation_mode=evaluation_mode,
                )
            except Exception as exc:
                failed += 1
                print(f"{label} FAILED {exc}")
                continue

            completed += 1
            print(
                f"{label} OK hit={result.hit_at_k} "
                f"precision={result.precision_at_k:.3f} "
                f"tokens={result.total_tokens}"
            )

    return completed, skipped, failed


def print_summary_block(name: str, summary: dict) -> None:
    print(name)
    for difficulty in ["simple", "ambiguous", "complex", "overall"]:
        for rag_type in RAG_TYPES:
            row = summary[difficulty][rag_type]
            print(
                f"- {difficulty}.{rag_type}: "
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run stored RAG evaluation results.",
    )
    parser.add_argument(
        "--force-agentic",
        action="store_true",
        help=(
            "Recalculate only existing agentic retrieval results. "
            "Naive, Advanced, and full-mode rows still use the existing SKIP logic."
        ),
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    engine.echo = False
    await ensure_evaluation_mode_column()
    await count_results()

    question_keys = await load_question_keys()
    difficulty_counts = Counter(key.split("_")[0] for key in question_keys)
    print("Evaluation questions:", dict(difficulty_counts))

    print("Retrieval-only smoke test")
    smoke_completed, smoke_skipped, smoke_failed = await run_missing_results(
        question_keys=["simple_01"],
        rag_types=RAG_TYPES,
        evaluation_mode="retrieval",
    )
    if smoke_failed:
        raise RuntimeError("retrieval-only smoke test failed")
    print(
        "Smoke:",
        f"completed={smoke_completed}",
        f"skipped={smoke_skipped}",
        f"failed={smoke_failed}",
    )

    print("Retrieval-only full set")
    retrieval_completed, retrieval_skipped, retrieval_failed = await run_missing_results(
        question_keys=question_keys,
        rag_types=RAG_TYPES,
        evaluation_mode="retrieval",
        force_agentic=args.force_agentic,
    )

    print("Representative Full RAG set")
    full_completed, full_skipped, full_failed = await run_missing_results(
        question_keys=REPRESENTATIVE_FULL_QUESTION_KEYS,
        rag_types=RAG_TYPES,
        evaluation_mode="full",
        force_agentic=args.force_agentic,
    )

    summary = await get_evaluation_summary()
    print_summary_block("Retrieval Summary", summary["retrieval_summary"])
    print_summary_block("Full RAG Summary", summary["full_rag_summary"])

    print(
        "Done:",
        f"retrieval_completed={retrieval_completed}",
        f"retrieval_skipped={retrieval_skipped}",
        f"retrieval_failed={retrieval_failed}",
        f"full_completed={full_completed}",
        f"full_skipped={full_skipped}",
        f"full_failed={full_failed}",
    )


if __name__ == "__main__":
    asyncio.run(main())
