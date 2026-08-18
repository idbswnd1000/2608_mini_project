import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import text


BACKEND_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = Path(__file__).resolve().parent / "evaluation_questions.json"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import engine  # noqa: E402


EXPECTED_COUNTS = {
    "simple": 10,
    "ambiguous": 10,
    "complex": 10,
}


def load_questions() -> list[dict]:
    with QUESTIONS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


async def fetch_existing_intents() -> set[str]:
    engine.echo = False
    async with engine.connect() as connection:
        rows = await connection.execute(
            text("SELECT DISTINCT intent FROM customer_support ORDER BY intent")
        )
        return {row.intent for row in rows}


async def fetch_instruction_matches(questions: list[str]) -> set[str]:
    engine.echo = False
    async with engine.connect() as connection:
        rows = await connection.execute(
            text(
                """
                SELECT instruction
                FROM customer_support
                WHERE instruction = ANY(:questions)
                """
            ),
            {"questions": questions},
        )
        return {row.instruction for row in rows}


async def main() -> None:
    questions = load_questions()
    ids = [item["id"] for item in questions]
    question_texts = [item["question"] for item in questions]
    difficulties = Counter(item["difficulty"] for item in questions)
    intent_distribution = Counter(
        intent
        for item in questions
        for intent in item["expected_intents"]
    )

    existing_intents = await fetch_existing_intents()
    used_intents = set(intent_distribution)
    invalid_intents = sorted(used_intents - existing_intents)
    exact_instruction_matches = await fetch_instruction_matches(question_texts)

    simple_or_ambiguous_errors = [
        item["id"]
        for item in questions
        if item["difficulty"] in {"simple", "ambiguous"}
        and len(item["expected_intents"]) != 1
    ]
    complex_errors = [
        item["id"]
        for item in questions
        if item["difficulty"] == "complex"
        and len(item["expected_intents"]) < 2
    ]

    print(f"json_valid=True")
    print(f"total_count={len(questions)}")
    print(f"id_unique={len(ids) == len(set(ids))}")
    print(f"question_unique={len(question_texts) == len(set(question_texts))}")
    for difficulty, expected_count in EXPECTED_COUNTS.items():
        print(f"{difficulty}_count={difficulties[difficulty]}")
        print(f"{difficulty}_count_ok={difficulties[difficulty] == expected_count}")
    print(f"existing_intents={sorted(existing_intents)}")
    print(f"invalid_intents={invalid_intents}")
    print(f"intent_distribution={dict(sorted(intent_distribution.items()))}")
    print(f"simple_or_ambiguous_expected_intent_errors={simple_or_ambiguous_errors}")
    print(f"complex_expected_intent_errors={complex_errors}")
    print(f"exact_instruction_match_count={len(exact_instruction_matches)}")
    print(f"exact_instruction_matches={sorted(exact_instruction_matches)}")

    failed = (
        len(questions) != 30
        or len(ids) != len(set(ids))
        or len(question_texts) != len(set(question_texts))
        or any(difficulties[key] != value for key, value in EXPECTED_COUNTS.items())
        or invalid_intents
        or simple_or_ambiguous_errors
        or complex_errors
        or exact_instruction_matches
    )
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
