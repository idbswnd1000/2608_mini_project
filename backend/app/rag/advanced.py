import time
from dataclasses import asdict, dataclass
from typing import Any

from app.rag.naive import EventCallback, emit_event, timed_step
from app.services.embedding_service import EMBEDDING_DIMENSION, embed_texts
from app.services.llm_service import LLMResult, generate_answer
from app.services.query_rewrite_service import QueryRewriteResult, rewrite_query
from app.services.reranker_service import RerankedResult, rerank_chunks
from app.services.vector_search_service import search_similar_chunks_by_vector


DEFAULT_CANDIDATE_K = 15


@dataclass
class AdvancedMetrics:
    rewrite_ms: int
    retrieval_ms: int
    rerank_ms: int
    generation_ms: int
    total_ms: int
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    rewrite_tokens: int | None
    generation_tokens: int | None


def build_context(results: list[RerankedResult]) -> str:
    return "\n\n".join(
        f"[Document {index}]\n{result.content}"
        for index, result in enumerate(results, start=1)
    )


def sum_optional(*values: int | None) -> int | None:
    present_values = [value for value in values if value is not None]
    if not present_values:
        return None
    return sum(present_values)


async def run_advanced_rag(
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
    event_callback: EventCallback | None = None,
) -> dict[str, Any]:
    normalized_question = question.strip()
    if not normalized_question:
        raise ValueError("question must not be empty")
    if top_k < 1 or top_k > 20:
        raise ValueError("top_k must be between 1 and 20")
    if candidate_k < top_k or candidate_k > 50:
        raise ValueError("candidate_k must be between top_k and 50")

    total_started_at = time.perf_counter()
    steps: list[dict[str, Any]] = []

    await emit_event(
        steps,
        event_callback,
        "question_received",
        "completed",
        question=normalized_question,
    )

    rewrite_result, rewrite_ms = await query_rewrite_step(
        steps,
        event_callback,
        normalized_question,
    )
    rewritten_query = rewrite_result.rewritten_query

    query_vector, embedding_ms = await embedding_step(
        steps,
        event_callback,
        rewritten_query,
    )

    candidates, vector_search_ms = await vector_search_step(
        steps,
        event_callback,
        query_vector,
        candidate_k,
    )

    reranked_results, rerank_ms = await reranking_step(
        steps,
        event_callback,
        rewritten_query,
        candidates,
        top_k,
    )

    context, context_build_ms = await timed_step(
        steps,
        event_callback,
        "context_build",
        lambda: _build_context_async(reranked_results),
    )

    llm_result, generation_ms = await timed_step(
        steps,
        event_callback,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
    )

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = AdvancedMetrics(
        rewrite_ms=rewrite_ms,
        retrieval_ms=embedding_ms + vector_search_ms + context_build_ms,
        rerank_ms=rerank_ms,
        generation_ms=generation_ms,
        total_ms=total_ms,
        input_tokens=sum_optional(
            rewrite_result.input_tokens,
            llm_result.input_tokens,
        ),
        output_tokens=sum_optional(
            rewrite_result.output_tokens,
            llm_result.output_tokens,
        ),
        total_tokens=sum_optional(
            rewrite_result.total_tokens,
            llm_result.total_tokens,
        ),
        rewrite_tokens=rewrite_result.total_tokens,
        generation_tokens=llm_result.total_tokens,
    )

    await emit_event(
        steps,
        event_callback,
        "completed",
        "completed",
        elapsed_ms=total_ms,
    )

    return {
        "rag_type": "advanced",
        "question": normalized_question,
        "rewritten_query": rewritten_query,
        "answer": llm_result.answer,
        "retrieved_chunks": [asdict(result) for result in reranked_results],
        "candidate_count": len(candidates),
        "vector_candidates": [
            asdict(candidate) | {"vector_rank": index}
            for index, candidate in enumerate(candidates, start=1)
        ],
        "metrics": asdict(metrics),
        "steps": steps,
        "llm": asdict(llm_result),
        "query_rewrite": asdict(rewrite_result),
    }


async def query_rewrite_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    question: str,
) -> tuple[QueryRewriteResult, int]:
    await emit_event(steps, callback, "query_rewrite", "started")
    started_at = time.perf_counter()
    result = await rewrite_query(question)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "query_rewrite",
        "completed",
        elapsed_ms=elapsed_ms,
        rewritten_query=result.rewritten_query,
        error=result.error,
    )
    return result, elapsed_ms


async def embedding_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    query: str,
) -> tuple[list[float], int]:
    await emit_event(steps, callback, "embedding", "started")
    started_at = time.perf_counter()
    vector = embed_texts([query])[0]
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(f"query embedding dimension must be {EMBEDDING_DIMENSION}")
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


async def vector_search_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    query_vector: list[float],
    candidate_k: int,
):
    await emit_event(steps, callback, "vector_search", "started")
    started_at = time.perf_counter()
    candidates = await search_similar_chunks_by_vector(query_vector, top_k=candidate_k)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "vector_search",
        "completed",
        elapsed_ms=elapsed_ms,
        candidate_count=len(candidates),
    )
    return candidates, elapsed_ms


async def reranking_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    query: str,
    candidates,
    top_k: int,
) -> tuple[list[RerankedResult], int]:
    await emit_event(steps, callback, "reranking", "started")
    started_at = time.perf_counter()
    results = rerank_chunks(query, candidates, top_k=top_k)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "reranking",
        "completed",
        elapsed_ms=elapsed_ms,
        result_count=len(results),
    )
    return results, elapsed_ms


async def _build_context_async(results: list[RerankedResult]) -> str:
    return build_context(results)
