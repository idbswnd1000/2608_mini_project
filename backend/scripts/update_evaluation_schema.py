import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import engine


async def main() -> None:
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

    print("evaluation_results.evaluation_mode is ready")


if __name__ == "__main__":
    asyncio.run(main())
