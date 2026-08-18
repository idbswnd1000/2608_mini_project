import asyncio
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import engine  # noqa: E402
from app.rag.advanced import run_advanced_rag  # noqa: E402
from app.rag.naive import run_naive_rag  # noqa: E402


QUESTIONS = [
    "How can I track my order?",
    "I want my money back. What should I do?",
    "How long will my delivery take?",
    "I bought something a few days ago but I have no idea where it is.",
    "The thing I ordered still hasn't shown up. How do I find out what's happening?",
]


def ids(chunks):
    return [chunk["chunk_id"] for chunk in chunks]


async def main() -> None:
    engine.echo = False

    advanced_results = []
    for index, question in enumerate(QUESTIONS, start=1):
        result = await run_advanced_rag(question, top_k=5, candidate_k=15)
        advanced_results.append(result)

        print(f"QUESTION {index}: {question}")
        print(f"rewritten={result['rewritten_query']}")
        print(f"answer={result['answer'].replace(chr(10), ' ')}")
        print(f"candidate_count={result['candidate_count']}")
        print(f"before_reranking={ids(result['vector_candidates'][:5])}")
        print(f"after_reranking={ids(result['retrieved_chunks'])}")
        print(f"metrics={result['metrics']}")
        print("top5=")
        for chunk in result["retrieved_chunks"]:
            preview = chunk["content"][:160].replace("\n", " ")
            print(
                f"  chunk_id={chunk['chunk_id']} "
                f"document_id={chunk['document_id']} "
                f"similarity={chunk['similarity']:.6f} "
                f"rerank_score={chunk['rerank_score']:.6f} "
                f"preview={preview!r}"
            )
        print()

    compare_question = QUESTIONS[0]
    naive = await run_naive_rag(compare_question, top_k=5)
    advanced = advanced_results[0]
    print("NAIVE VS ADVANCED")
    print(f"question={compare_question}")
    print(f"naive_top5={ids(naive['retrieved_chunks'])}")
    print(f"advanced_rewritten={advanced['rewritten_query']}")
    print(f"advanced_vector_top5={ids(advanced['vector_candidates'][:5])}")
    print(f"advanced_top5={ids(advanced['retrieved_chunks'])}")
    print(f"naive_total_ms={naive['metrics']['total_ms']}")
    print(f"advanced_total_ms={advanced['metrics']['total_ms']}")
    print(f"naive_total_tokens={naive['llm']['total_tokens']}")
    print(f"advanced_total_tokens={advanced['metrics']['total_tokens']}")


if __name__ == "__main__":
    asyncio.run(main())
