import asyncio
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import engine  # noqa: E402
from app.rag.advanced import run_advanced_rag  # noqa: E402
from app.rag.agentic import run_agentic_rag  # noqa: E402
from app.rag.naive import run_naive_rag  # noqa: E402


QUESTIONS = [
    "How can I track my order?",
    "I want my money back. What should I do?",
    "How long will my delivery take?",
    "My order still has not arrived and I want to know whether I can cancel it.",
    "I want to return my order and also know when I will get my refund.",
    "I changed my shipping address after placing the order. How can I check whether the order is going to the new address?",
]


COMPARE_QUESTION = (
    "My order still has not arrived and I want to know whether I can cancel it."
)


def chunk_ids(result):
    return [chunk["chunk_id"] for chunk in result["retrieved_chunks"]]


async def main() -> None:
    engine.echo = False
    agentic_results = []

    for index, question in enumerate(QUESTIONS, start=1):
        result = await run_agentic_rag(question, top_k=5)
        agentic_results.append(result)
        decision = result["agent_decision"]
        first_round = result["search_history"][0]
        last_round = result["search_history"][-1]

        print(f"QUESTION {index}: {question}")
        print(f"decision={decision}")
        print(f"first_query={first_round['query']}")
        print(f"final_sufficient={last_round['sufficient']}")
        print(f"second_query={result['search_history'][1]['query'] if result['search_rounds'] > 1 else None}")
        print(f"search_rounds={result['search_rounds']}")
        print(f"search_history={result['search_history']}")
        print(f"answer={result['answer'].replace(chr(10), ' ')}")
        print(f"metrics={result['metrics']}")
        print(f"top5={chunk_ids(result)}")
        print(f"steps={[(step['step'], step['status']) for step in result['steps']]}")
        print()

    naive = await run_naive_rag(COMPARE_QUESTION, top_k=5)
    advanced = await run_advanced_rag(COMPARE_QUESTION, top_k=5)
    agentic = next(
        result for result in agentic_results if result["question"] == COMPARE_QUESTION
    )

    print("NAIVE VS ADVANCED VS AGENTIC")
    print(f"question={COMPARE_QUESTION}")
    print(f"naive_total_ms={naive['metrics']['total_ms']}")
    print(f"advanced_total_ms={advanced['metrics']['total_ms']}")
    print(f"agentic_total_ms={agentic['metrics']['total_ms']}")
    print(f"naive_total_tokens={naive['llm']['total_tokens']}")
    print(f"advanced_total_tokens={advanced['metrics']['total_tokens']}")
    print(f"agentic_total_tokens={agentic['metrics']['total_tokens']}")
    print(f"agentic_search_rounds={agentic['search_rounds']}")
    print(f"naive_top5={chunk_ids(naive)}")
    print(f"advanced_top5={chunk_ids(advanced)}")
    print(f"agentic_top5={chunk_ids(agentic)}")
    print(f"naive_answer={naive['answer'][:180].replace(chr(10), ' ')}")
    print(f"advanced_answer={advanced['answer'][:180].replace(chr(10), ' ')}")
    print(f"agentic_answer={agentic['answer'][:180].replace(chr(10), ' ')}")
    print(f"naive_step_count={len(naive['steps'])}")
    print(f"advanced_step_count={len(advanced['steps'])}")
    print(f"agentic_step_count={len(agentic['steps'])}")


if __name__ == "__main__":
    asyncio.run(main())
