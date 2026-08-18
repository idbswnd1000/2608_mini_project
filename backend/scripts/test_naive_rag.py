import asyncio
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import engine  # noqa: E402
from app.rag.naive import run_naive_rag  # noqa: E402


QUESTIONS = [
    "How can I track my order?",
    "I want my money back. What should I do?",
    "How long will my delivery take?",
]


async def main() -> None:
    engine.echo = False

    for question in QUESTIONS:
        result = await run_naive_rag(question, top_k=5)
        print(f"Question: {question}")
        print("Top 5:")
        for chunk in result["retrieved_chunks"]:
            preview = chunk["content"][:160].replace("\n", " ")
            print(
                f"- chunk_id={chunk['chunk_id']} "
                f"document_id={chunk['document_id']} "
                f"similarity={chunk['similarity']:.6f} "
                f"preview={preview!r}"
            )
        print(f"Answer: {result['answer']}")
        print(f"Metrics: {result['metrics']}")
        print(f"LLM configured: {result['llm']['configured']}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
