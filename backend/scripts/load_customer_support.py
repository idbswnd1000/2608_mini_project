import asyncio
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
CSV_PATH = PROJECT_ROOT / "data" / "customer_support_3000.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import AsyncSessionLocal, create_tables, engine  # noqa: E402
from app.models.customer_support import CustomerSupport  # noqa: E402
from app.models.document import Document  # noqa: E402


REQUIRED_COLUMNS = ["category", "intent", "instruction", "response"]
SOURCE_TYPE = "customer_support"


def normalize_label(value: object) -> str:
    return str(value).strip().lower()


def clean_text(value: object) -> str:
    return str(value).strip()


def load_and_clean_csv() -> tuple[pd.DataFrame, int, int, int]:
    df = pd.read_csv(CSV_PATH, usecols=REQUIRED_COLUMNS, dtype=str)
    raw_count = len(df)

    for column in REQUIRED_COLUMNS:
        df[column] = df[column].fillna("").map(clean_text)

    df = df[(df["instruction"] != "") & (df["response"] != "")]
    before_dedup_count = len(df)
    df = df.drop_duplicates(subset=["instruction"], keep="first")
    dedup_removed_count = before_dedup_count - len(df)

    df["category"] = df["category"].map(normalize_label)
    df["intent"] = df["intent"].map(normalize_label)
    cleaned_count = len(df)

    return df.reset_index(drop=True), raw_count, cleaned_count, dedup_removed_count


def document_title(row: pd.Series) -> str:
    return f"{row['category']} - {row['intent']}"


def document_content(row: pd.Series) -> str:
    return (
        f"Category: {row['category']}\n"
        f"Intent: {row['intent']}\n"
        f"Question: {row['instruction']}\n"
        f"Answer: {row['response']}"
    )


async def ensure_indexes() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_customer_support_instruction "
                    "ON customer_support (instruction)"
                )
            )
            await session.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_documents_source_type_source_id "
                    "ON documents (source_type, source_id) "
                    "WHERE source_type IS NOT NULL AND source_id IS NOT NULL"
                )
            )


async def load_customer_support() -> dict[str, int]:
    engine.echo = False

    df, raw_count, cleaned_count, dedup_removed_count = load_and_clean_csv()
    skipped_customer_support = 0
    inserted_customer_support = 0
    inserted_documents = 0
    skipped_documents = 0

    await create_tables()
    await ensure_indexes()

    async with AsyncSessionLocal() as session:
        try:
            async with session.begin():
                for row in df.to_dict(orient="records"):
                    customer_stmt = (
                        insert(CustomerSupport)
                        .values(
                            category=row["category"],
                            intent=row["intent"],
                            instruction=row["instruction"],
                            response=row["response"],
                        )
                        .on_conflict_do_nothing(
                            constraint="uq_customer_support_instruction"
                        )
                        .returning(CustomerSupport.id)
                    )
                    customer_id = await session.scalar(customer_stmt)

                    if customer_id is None:
                        skipped_customer_support += 1
                        customer_id = await session.scalar(
                            select(CustomerSupport.id).where(
                                CustomerSupport.instruction == row["instruction"]
                            )
                        )
                    else:
                        inserted_customer_support += 1

                    document_exists = await session.scalar(
                        select(Document.id).where(
                            Document.source_type == SOURCE_TYPE,
                            Document.source_id == customer_id,
                        )
                    )

                    if document_exists is not None:
                        skipped_documents += 1
                        continue

                    document_stmt = (
                        insert(Document)
                        .values(
                            title=document_title(pd.Series(row)),
                            filename=f"{SOURCE_TYPE}:{customer_id}",
                            source_type=SOURCE_TYPE,
                            source_id=customer_id,
                            content=document_content(pd.Series(row)),
                        )
                        .on_conflict_do_nothing(
                            index_elements=["source_type", "source_id"],
                            index_where=text(
                                "source_type IS NOT NULL AND source_id IS NOT NULL"
                            ),
                        )
                    )
                    result = await session.execute(document_stmt)
                    if result.rowcount == 1:
                        inserted_documents += 1
                    else:
                        skipped_documents += 1

            total_customer_support = await session.scalar(
                select(func.count()).select_from(CustomerSupport)
            )
            total_documents = await session.scalar(
                select(func.count()).select_from(Document)
            )
        except Exception:
            await session.rollback()
            raise

    return {
        "raw_count": raw_count,
        "cleaned_count": cleaned_count,
        "dedup_removed_count": dedup_removed_count,
        "inserted_customer_support": inserted_customer_support,
        "inserted_documents": inserted_documents,
        "skipped_customer_support": skipped_customer_support,
        "skipped_documents": skipped_documents,
        "total_customer_support": total_customer_support or 0,
        "total_documents": total_documents or 0,
    }


async def main() -> None:
    result = await load_customer_support()
    total_skipped = (
        result["skipped_customer_support"] + result["skipped_documents"]
    )

    print("Customer Support CSV Load")
    print("=========================")
    print(f"CSV path: {CSV_PATH}")
    print(f"Raw CSV rows: {result['raw_count']}")
    print(f"Cleaned rows: {result['cleaned_count']}")
    print(f"Duplicate instructions removed during cleaning: {result['dedup_removed_count']}")
    print(
        "New customer_support rows: "
        f"{result['inserted_customer_support']}"
    )
    print(f"New documents rows: {result['inserted_documents']}")
    print(
        "Skipped as duplicates: "
        f"{total_skipped} "
        f"(customer_support={result['skipped_customer_support']}, "
        f"documents={result['skipped_documents']})"
    )
    print(
        "Final customer_support total rows: "
        f"{result['total_customer_support']}"
    )
    print(f"Final documents total rows: {result['total_documents']}")


if __name__ == "__main__":
    asyncio.run(main())
