import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert


BACKEND_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = BACKEND_ROOT / "evaluation" / "evaluation_questions.json"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, create_tables, engine  # noqa: E402
from app.models.evaluation import EvaluationQuestion  # noqa: E402


def load_questions() -> list[dict]:
    with QUESTIONS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


async def load_evaluation_questions() -> dict:
    engine.echo = False
    questions = load_questions()
    inserted = 0
    skipped = 0

    await create_tables()

    async with AsyncSessionLocal() as session:
        async with session.begin():
            for item in questions:
                stmt = (
                    insert(EvaluationQuestion)
                    .values(
                        question_key=item["id"],
                        difficulty=item["difficulty"],
                        question=item["question"],
                        expected_intents=item["expected_intents"],
                    )
                    .on_conflict_do_nothing(
                        index_elements=["question_key"],
                    )
                )
                result = await session.execute(stmt)
                if result.rowcount == 1:
                    inserted += 1
                else:
                    skipped += 1

        total = await session.scalar(
            select(func.count()).select_from(EvaluationQuestion)
        )
        rows = await session.execute(
            select(
                EvaluationQuestion.difficulty,
                func.count(),
            )
            .group_by(EvaluationQuestion.difficulty)
            .order_by(EvaluationQuestion.difficulty)
        )
        difficulty_counts = {
            difficulty: count
            for difficulty, count in rows
        }

    return {
        "json_count": len(questions),
        "inserted": inserted,
        "skipped": skipped,
        "total": total or 0,
        "difficulty_counts": difficulty_counts,
    }


async def main() -> None:
    result = await load_evaluation_questions()
    print("Load Evaluation Questions")
    print("=========================")
    print(f"JSON questions: {result['json_count']}")
    print(f"New rows: {result['inserted']}")
    print(f"Skipped rows: {result['skipped']}")
    print(f"Final DB questions: {result['total']}")
    for difficulty, count in result["difficulty_counts"].items():
        print(f"{difficulty}: {count}")


if __name__ == "__main__":
    asyncio.run(main())
