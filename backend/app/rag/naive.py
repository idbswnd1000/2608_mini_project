import inspect
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from typing import Any

from app.services.embedding_service import EMBEDDING_DIMENSION, embed_texts_async
from app.services.llm_service import generate_answer
from app.services.vector_search_service import (
    SearchResult,
    search_similar_chunks_by_vector,
)


EventCallback = Callable[[dict[str, Any]], None | Awaitable[None]]


@dataclass
class Metrics:
    retrieval_ms: int
    generation_ms: int
    total_ms: int


def build_context(results: list[SearchResult]) -> str:
    return "\n\n".join(
        f"[Document {index}]\n{result.content}"
        for index, result in enumerate(results, start=1)
    )


async def emit_event(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    step: str,
    status: str,
    elapsed_ms: int | None = None,
    **extra: Any,
) -> None:
    event: dict[str, Any] = {
        "step": step,
        "status": status,
    }
    if elapsed_ms is not None:
        event["elapsed_ms"] = elapsed_ms
    event.update(extra)
    steps.append(event)

    if callback is None:
        return

    result = callback(event)
    if inspect.isawaitable(result):
        await result


async def timed_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    step: str,
    action: Callable[[], Awaitable[Any]],
) -> tuple[Any, int]:
    await emit_event(steps, callback, step, "started")
    started_at = time.perf_counter()
    try:
        result = await action()
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        await emit_event(
            steps,
            callback,
            step,
            "failed",
            elapsed_ms=elapsed_ms,
            error=str(exc),
        )
        raise

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        step,
        "completed",
        elapsed_ms=elapsed_ms,
    )
    return result, elapsed_ms


async def run_naive_rag(
    question: str,
    top_k: int = 5,
    event_callback: EventCallback | None = None,
) -> dict[str, Any]:
    normalized_question = question.strip()
    if not normalized_question:
        raise ValueError("question must not be empty")
    if top_k < 1 or top_k > 20:
        raise ValueError("top_k must be between 1 and 20")

    total_started_at = time.perf_counter()
    steps: list[dict[str, Any]] = []

    await emit_event(
        steps,
        event_callback,
        "question_received",
        "completed",
        question=normalized_question,
    )

    query_vector, embedding_ms = await embedding_step(
        steps,
        event_callback,
        normalized_question,
    )

    results, vector_search_ms = await timed_step(
        steps,
        event_callback,
        "vector_search",
        lambda: search_similar_chunks_by_vector(query_vector, top_k=top_k),
    )

    context, context_build_ms = await timed_step(
        steps,
        event_callback,
        "context_build",
        lambda: _build_context_async(results),
    )

    llm_result, generation_ms = await timed_step(
        steps,
        event_callback,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
    )

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = Metrics(
        retrieval_ms=embedding_ms + vector_search_ms + context_build_ms,
        generation_ms=generation_ms,
        total_ms=total_ms,
    )

    await emit_event(
        steps,
        event_callback,
        "completed",
        "completed",
        elapsed_ms=total_ms,
    )

    return {
        "rag_type": "naive",
        "question": normalized_question,
        "answer": llm_result.answer,
        "retrieved_chunks": [asdict(result) for result in results],
        "metrics": asdict(metrics),
        "steps": steps,
        "llm": asdict(llm_result),
    }


async def _build_context_async(results: list[SearchResult]) -> str:
    return build_context(results)


async def _embed_query_async(question: str) -> list[float]:
    vector = (await embed_texts_async([question]))[0]
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(f"query embedding dimension must be {EMBEDDING_DIMENSION}")
    return vector


async def embedding_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    question: str,
) -> tuple[list[float], int]:
    await emit_event(steps, callback, "embedding", "started")
    started_at = time.perf_counter()
    try:
        vector = await _embed_query_async(question)
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        await emit_event(
            steps,
            callback,
            "embedding",
            "failed",
            elapsed_ms=elapsed_ms,
            error=str(exc),
        )
        raise

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "embedding",
        "completed",
        elapsed_ms=elapsed_ms,
        dimension=len(vector),
    )
    return vector, elapsed_ms
