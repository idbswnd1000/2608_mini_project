import asyncio
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import asdict
from typing import Any

from app.rag.advanced import DEFAULT_CANDIDATE_K, build_context
from app.rag.agentic import DEFAULT_MAX_SEARCH_ROUNDS, build_search_history_entry, select_accumulated_context
from app.rag.agentic import merge_candidates as merge_agentic_candidates
from app.rag.naive import build_context as build_naive_context
from app.services.agent_decision_service import make_agent_decision
from app.services.context_evaluation_service import evaluate_context
from app.services.embedding_service import EMBEDDING_DIMENSION, embed_texts
from app.services.llm_service import generate_answer
from app.services.query_rewrite_service import rewrite_query
from app.services.reranker_service import RerankedResult, rerank_chunks
from app.services.vector_search_service import SearchResult, search_similar_chunks_by_vector


PRESENTATION_PAUSE_SECONDS = 2.0
EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


def now_ms() -> int:
    return int(time.time() * 1000)


def preview_text(text: str, limit: int = 140) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "..."


def search_preview(results: list[SearchResult] | list[RerankedResult], limit: int = 3) -> list[dict[str, Any]]:
    return [
        {
            "rank": index,
            "chunk_id": result.chunk_id,
            "document_id": result.document_id,
            "similarity": round(result.similarity, 4),
            "distance": round(result.distance, 4),
            "rerank_score": round(result.rerank_score, 4) if isinstance(result, RerankedResult) else None,
            "vector_rank": result.vector_rank if isinstance(result, RerankedResult) else index,
            "content_preview": preview_text(result.content),
        }
        for index, result in enumerate(results[:limit], start=1)
    ]


async def emit(
    emitter: EventEmitter,
    event_type: str,
    rag_type: str,
    step: str,
    status: str,
    **payload: Any,
) -> None:
    await emitter(
        event_type,
        {
            "event": event_type,
            "rag_type": rag_type,
            "step": step,
            "status": status,
            "timestamp": now_ms(),
            **payload,
        },
    )


async def pause_after_result() -> None:
    await asyncio.sleep(PRESENTATION_PAUSE_SECONDS)


async def timed_action(
    emitter: EventEmitter,
    rag_type: str,
    step: str,
    action,
    start_payload: dict[str, Any] | None = None,
    complete_payload_builder=None,
    pause: bool = True,
):
    await emit(emitter, "step_start", rag_type, step, "running", **(start_payload or {}))
    started_at = time.perf_counter()
    try:
        result = await action()
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        await emit(
            emitter,
            "error",
            rag_type,
            step,
            "failed",
            actual_elapsed_ms=elapsed_ms,
            error=str(exc),
        )
        raise

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    extra = complete_payload_builder(result) if complete_payload_builder else {}
    await emit(
        emitter,
        "step_complete",
        rag_type,
        step,
        "completed",
        actual_elapsed_ms=elapsed_ms,
        intermediate_result=extra,
    )
    if pause:
        await pause_after_result()
    return result, elapsed_ms


async def async_value(value):
    return value


async def run_presentation_naive(
    emitter: EventEmitter,
    question: str,
    top_k: int = 5,
) -> dict[str, Any]:
    rag_type = "naive"
    normalized_question = question.strip()
    actual_total_ms = 0
    await emit(emitter, "run_start", rag_type, "run", "running", question=normalized_question)

    await emit(
        emitter,
        "step_complete",
        rag_type,
        "question_received",
        "completed",
        actual_elapsed_ms=0,
        intermediate_result={"question": normalized_question},
    )
    await pause_after_result()

    vector, elapsed = await timed_action(
        emitter,
        rag_type,
        "embedding",
        lambda: async_value(embed_texts([normalized_question])[0]),
        complete_payload_builder=lambda result: {"dimension": len(result), "dimension_expected": EMBEDDING_DIMENSION},
    )
    actual_total_ms += elapsed

    candidates, elapsed = await timed_action(
        emitter,
        rag_type,
        "vector_search",
        lambda: search_similar_chunks_by_vector(vector, top_k=top_k),
        complete_payload_builder=lambda result: {
            "candidate_count": len(result),
            "top_candidates": search_preview(result),
        },
    )
    actual_total_ms += elapsed

    context, elapsed = await timed_action(
        emitter,
        rag_type,
        "context_build",
        lambda: async_value(build_naive_context(candidates)),
        complete_payload_builder=lambda _: {
            "chunk_count": len(candidates),
            "selected_context": search_preview(candidates),
        },
    )
    actual_total_ms += elapsed

    llm_result, elapsed = await timed_action(
        emitter,
        rag_type,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
        complete_payload_builder=lambda result: {
            "answer": result.answer,
            "llm": asdict(result),
        },
        pause=False,
    )
    actual_total_ms += elapsed

    result = {
        "rag_type": rag_type,
        "question": normalized_question,
        "answer": llm_result.answer,
        "actual_total_ms": actual_total_ms,
        "retrieved_chunks": [asdict(candidate) for candidate in candidates],
    }
    await emit(emitter, "run_complete", rag_type, "run", "completed", actual_elapsed_ms=actual_total_ms, result=result)
    return result


async def run_presentation_advanced(
    emitter: EventEmitter,
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
) -> dict[str, Any]:
    rag_type = "advanced"
    normalized_question = question.strip()
    actual_total_ms = 0
    await emit(emitter, "run_start", rag_type, "run", "running", question=normalized_question)

    rewrite_result, elapsed = await timed_action(
        emitter,
        rag_type,
        "query_rewrite",
        lambda: rewrite_query(normalized_question),
        start_payload={"original_query": normalized_question},
        complete_payload_builder=lambda result: {
            "original_query": result.original_question,
            "rewritten_query": result.rewritten_query,
            "error": result.error,
            "tokens": result.total_tokens,
        },
    )
    actual_total_ms += elapsed

    rewritten_query = rewrite_result.rewritten_query
    vector, elapsed = await timed_action(
        emitter,
        rag_type,
        "embedding",
        lambda: async_value(embed_texts([rewritten_query])[0]),
        start_payload={"query": rewritten_query},
        complete_payload_builder=lambda result: {"dimension": len(result), "dimension_expected": EMBEDDING_DIMENSION},
    )
    actual_total_ms += elapsed

    candidates, elapsed = await timed_action(
        emitter,
        rag_type,
        "vector_search",
        lambda: search_similar_chunks_by_vector(vector, top_k=candidate_k),
        complete_payload_builder=lambda result: {
            "candidate_count": len(result),
            "top_candidates": search_preview(result),
        },
    )
    actual_total_ms += elapsed

    reranked, elapsed = await timed_action(
        emitter,
        rag_type,
        "reranking",
        lambda: async_value(rerank_chunks(rewritten_query, candidates, top_k=top_k)),
        complete_payload_builder=lambda result: {
            "before": search_preview(candidates),
            "after": search_preview(result),
            "result_count": len(result),
        },
    )
    actual_total_ms += elapsed

    context, elapsed = await timed_action(
        emitter,
        rag_type,
        "context_build",
        lambda: async_value(build_context(reranked)),
        complete_payload_builder=lambda _: {
            "chunk_count": len(reranked),
            "selected_context": search_preview(reranked),
        },
    )
    actual_total_ms += elapsed

    llm_result, elapsed = await timed_action(
        emitter,
        rag_type,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
        complete_payload_builder=lambda result: {
            "answer": result.answer,
            "llm": asdict(result),
        },
        pause=False,
    )
    actual_total_ms += elapsed

    result = {
        "rag_type": rag_type,
        "question": normalized_question,
        "rewritten_query": rewritten_query,
        "answer": llm_result.answer,
        "actual_total_ms": actual_total_ms,
        "retrieved_chunks": [asdict(item) for item in reranked],
    }
    await emit(emitter, "run_complete", rag_type, "run", "completed", actual_elapsed_ms=actual_total_ms, result=result)
    return result


async def run_presentation_agentic(
    emitter: EventEmitter,
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
    max_search_rounds: int = DEFAULT_MAX_SEARCH_ROUNDS,
) -> dict[str, Any]:
    rag_type = "agentic"
    normalized_question = question.strip()
    actual_total_ms = 0
    current_query = normalized_question
    final_results: list[RerankedResult] = []
    merged_candidates: dict[int, SearchResult] = {}
    round_contexts: list[list[RerankedResult]] = []
    search_history: list[dict[str, Any]] = []

    await emit(emitter, "run_start", rag_type, "run", "running", question=normalized_question)

    decision, elapsed = await timed_action(
        emitter,
        rag_type,
        "agent_decision",
        lambda: make_agent_decision(normalized_question),
        complete_payload_builder=lambda result: {
            "needs_search": result.needs_search,
            "query": result.query,
            "reason": result.reason,
            "expected_intent": result.expected_intent,
            "search_strategy": result.search_strategy,
            "tokens": result.total_tokens,
        },
    )
    actual_total_ms += elapsed
    await emit(
        emitter,
        "decision",
        rag_type,
        "agent_decision",
        "completed",
        actual_elapsed_ms=elapsed,
        intermediate_result={
            "needs_search": decision.needs_search,
            "query": decision.query,
            "reason": decision.reason,
            "expected_intent": decision.expected_intent,
            "search_strategy": decision.search_strategy,
        },
    )
    if decision.needs_search:
        current_query = decision.query

    completed_rounds = 0
    retry_count = 0
    evaluation = None
    for search_round in range(1, max_search_rounds + 1):
        completed_rounds = search_round
        await emit(
            emitter,
            "round_start",
            rag_type,
            "round",
            "running",
            round=search_round,
            retry_count=retry_count,
            query=current_query,
        )

        step_name = "vector_search" if search_round == 1 else "retry_search"
        candidates, elapsed = await timed_action(
            emitter,
            rag_type,
            step_name,
            lambda: _embed_and_search(current_query, candidate_k),
            start_payload={"round": search_round, "query": current_query, "retry_count": retry_count},
            complete_payload_builder=lambda result: {
                "round": search_round,
                "embedding_dimension": result["embedding_dimension"],
                "candidate_count": len(result["candidates"]),
                "top_candidates": search_preview(result["candidates"]),
            },
        )
        actual_total_ms += elapsed
        candidates = candidates["candidates"]
        merge_agentic_candidates(merged_candidates, candidates)

        round_results, elapsed = await timed_action(
            emitter,
            rag_type,
            "reranking",
            lambda: async_value(rerank_chunks(current_query, candidates, top_k=top_k)),
            start_payload={"round": search_round},
            complete_payload_builder=lambda result: {
                "round": search_round,
                "query": current_query,
                "before": search_preview(candidates),
                "after": search_preview(result),
                "result_count": len(result),
            },
        )
        actual_total_ms += elapsed
        round_contexts.append(round_results)
        final_results = select_accumulated_context(round_contexts, top_k)

        evaluation, elapsed = await timed_action(
            emitter,
            rag_type,
            "context_evaluation",
            lambda: evaluate_context(normalized_question, final_results, current_query),
            start_payload={"round": search_round},
            complete_payload_builder=lambda result: {
                "round": search_round,
                "sufficient": result.sufficient,
                "reason": result.reason,
                "next_query": result.next_query,
                "supporting_chunk_ids": result.supporting_chunk_ids,
                "covered_requirements": result.covered_requirements,
                "missing_requirements": result.missing_requirements,
                "tokens": result.total_tokens,
            },
        )
        actual_total_ms += elapsed
        search_history.append(
            build_search_history_entry(search_round, current_query, candidates, final_results, evaluation)
        )

        if evaluation.sufficient or not evaluation.next_query or search_round == max_search_rounds:
            break

        retry_count += 1
        await emit(
            emitter,
            "retry",
            rag_type,
            "query_refinement",
            "running",
            round=search_round,
            retry_count=retry_count,
            reason=evaluation.reason,
        )
        refined_query = evaluation.next_query
        await emit(
            emitter,
            "step_complete",
            rag_type,
            "query_refinement",
            "completed",
            actual_elapsed_ms=0,
            round=search_round,
            retry_count=retry_count,
            intermediate_result={
                "refined_query": refined_query,
                "reason": evaluation.reason,
                "missing_requirements": evaluation.missing_requirements,
                "next_round": search_round + 1,
            },
        )
        await pause_after_result()
        current_query = refined_query

    if evaluation and not evaluation.sufficient and completed_rounds == max_search_rounds:
        await emit(
            emitter,
            "step_complete",
            rag_type,
            "retry_limit",
            "completed",
            actual_elapsed_ms=0,
            round=completed_rounds,
            retry_count=retry_count,
            intermediate_result={
                "max_search_rounds": max_search_rounds,
                "reason": "Max search rounds reached. Use best available context.",
            },
        )
        await pause_after_result()

    context, elapsed = await timed_action(
        emitter,
        rag_type,
        "context_build",
        lambda: async_value(build_context(final_results)),
        complete_payload_builder=lambda _: {
            "chunk_count": len(final_results),
            "selected_context": search_preview(final_results),
        },
    )
    actual_total_ms += elapsed

    llm_result, elapsed = await timed_action(
        emitter,
        rag_type,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
        complete_payload_builder=lambda result: {
            "answer": result.answer,
            "llm": asdict(result),
        },
        pause=False,
    )
    actual_total_ms += elapsed

    result = {
        "rag_type": rag_type,
        "question": normalized_question,
        "answer": llm_result.answer,
        "actual_total_ms": actual_total_ms,
        "search_rounds": completed_rounds,
        "retry_count": retry_count,
        "search_history": search_history,
        "final_sufficient": evaluation.sufficient if evaluation else None,
        "retrieved_chunks": [asdict(item) for item in final_results],
    }
    await emit(emitter, "run_complete", rag_type, "run", "completed", actual_elapsed_ms=actual_total_ms, result=result)
    return result


async def presentation_event_stream(
    rag_type: str,
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
    max_search_rounds: int = DEFAULT_MAX_SEARCH_ROUNDS,
) -> AsyncIterator[str]:
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

    async def queue_emit(event_type: str, payload: dict[str, Any]) -> None:
        await queue.put((event_type, payload))

    async def produce() -> None:
        try:
            if rag_type == "naive":
                await run_presentation_naive(queue_emit, question, top_k=top_k)
            elif rag_type == "advanced":
                await run_presentation_advanced(queue_emit, question, top_k=top_k, candidate_k=candidate_k)
            elif rag_type == "agentic":
                await run_presentation_agentic(
                    queue_emit,
                    question,
                    top_k=top_k,
                    candidate_k=candidate_k,
                    max_search_rounds=max_search_rounds,
                )
            else:
                await emit(queue_emit, "error", rag_type, "run", "failed", error=f"unsupported rag_type: {rag_type}")
        except Exception as exc:
            await emit(queue_emit, "error", rag_type, "run", "failed", error=str(exc))
        finally:
            await queue.put(None)

    producer = asyncio.create_task(produce())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            event_type, payload = item
            yield f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
    finally:
        producer.cancel()


async def _embed_and_search(query: str, candidate_k: int) -> dict[str, Any]:
    vector = embed_texts([query])[0]
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(f"query embedding dimension must be {EMBEDDING_DIMENSION}")
    candidates = await search_similar_chunks_by_vector(vector, top_k=candidate_k)
    return {
        "embedding_dimension": len(vector),
        "candidates": candidates,
    }
