import time
from dataclasses import asdict, dataclass
from typing import Any

from app.rag.advanced import DEFAULT_CANDIDATE_K, build_context
from app.rag.naive import EventCallback, emit_event, timed_step
from app.services.agent_decision_service import (
    AgentDecisionResult,
    make_agent_decision,
)
from app.services.context_evaluation_service import (
    ContextEvaluationResult,
    evaluate_context,
)
from app.services.embedding_service import EMBEDDING_DIMENSION, embed_texts
from app.services.llm_service import LLMResult, generate_answer
from app.services.reranker_service import RerankedResult, rerank_chunks
from app.services.vector_search_service import (
    SearchResult,
    search_similar_chunks_by_vector,
)


DEFAULT_MAX_SEARCH_ROUNDS = 2
MAX_QUERIES_PER_ROUND = 3
MIN_CONTEXT_SIMILARITY = 0.3


@dataclass
class AgenticMetrics:
    decision_ms: int
    retrieval_ms: int
    rerank_ms: int
    evaluation_ms: int
    generation_ms: int
    total_ms: int
    search_rounds: int
    retrieved_chunk_count: int
    final_chunk_count: int
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    decision_tokens: int | None
    evaluation_tokens: int | None
    generation_tokens: int | None


def sum_optional(*values: int | None) -> int | None:
    present_values = [value for value in values if value is not None]
    if not present_values:
        return None
    return sum(present_values)


def merge_candidates(
    existing: dict[int, SearchResult],
    candidates: list[SearchResult],
) -> None:
    for candidate in candidates:
        previous = existing.get(candidate.chunk_id)
        if previous is None or candidate.distance < previous.distance:
            existing[candidate.chunk_id] = candidate


def select_accumulated_context(
    round_results: list[list[RerankedResult]],
    top_k: int,
) -> list[RerankedResult]:
    selected: list[RerankedResult] = []
    seen_chunk_ids: set[int] = set()
    max_depth = max((len(results) for results in round_results), default=0)

    for index in range(max_depth):
        for results in round_results:
            if index >= len(results):
                continue
            result = results[index]
            if result.chunk_id in seen_chunk_ids:
                continue
            if result.similarity < MIN_CONTEXT_SIMILARITY:
                continue
            selected.append(result)
            seen_chunk_ids.add(result.chunk_id)
            if len(selected) >= top_k:
                return selected

    if selected:
        return selected

    for results in round_results:
        for result in results:
            if result.chunk_id in seen_chunk_ids:
                continue
            selected.append(result)
            seen_chunk_ids.add(result.chunk_id)
            if len(selected) >= top_k:
                return selected

    return selected


def unique_queries(primary_query: str | None, extra_queries: list[str] | None = None) -> list[str]:
    queries: list[str] = []
    seen: set[str] = set()

    for query in [primary_query, *(extra_queries or [])]:
        normalized = str(query or "").strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        queries.append(normalized)
        seen.add(key)
        if len(queries) >= MAX_QUERIES_PER_ROUND:
            break

    return queries


def dedupe_candidates(candidates: list[SearchResult]) -> list[SearchResult]:
    best_by_chunk_id: dict[int, SearchResult] = {}
    for candidate in candidates:
        previous = best_by_chunk_id.get(candidate.chunk_id)
        if previous is None or candidate.distance < previous.distance:
            best_by_chunk_id[candidate.chunk_id] = candidate
    return sorted(best_by_chunk_id.values(), key=lambda result: result.distance)


def build_search_history_entry(
    search_round: int,
    query: str,
    candidates: list[SearchResult],
    results: list[RerankedResult],
    evaluation: ContextEvaluationResult,
    queries: list[str] | None = None,
    query_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    top_similarity = results[0].similarity if results else None
    return {
        "round": search_round,
        "query": query,
        "queries": queries or [query],
        "query_results": query_results or [],
        "candidate_count": len(candidates),
        "retrieved_chunk_ids": [result.chunk_id for result in results],
        "top_similarity": top_similarity,
        "sufficient": evaluation.sufficient,
        "reason": evaluation.reason,
        "next_query": evaluation.next_query,
        "next_queries": evaluation.next_queries,
        "supporting_chunk_ids": evaluation.supporting_chunk_ids,
        "covered_requirements": evaluation.covered_requirements,
        "missing_requirements": evaluation.missing_requirements,
    }


async def run_agentic_rag(
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
    max_search_rounds: int = DEFAULT_MAX_SEARCH_ROUNDS,
    event_callback: EventCallback | None = None,
) -> dict[str, Any]:
    normalized_question = question.strip()
    if not normalized_question:
        raise ValueError("question must not be empty")
    if top_k < 1 or top_k > 20:
        raise ValueError("top_k must be between 1 and 20")
    if candidate_k < top_k or candidate_k > 50:
        raise ValueError("candidate_k must be between top_k and 50")
    if max_search_rounds < 1 or max_search_rounds > 5:
        raise ValueError("max_search_rounds must be between 1 and 5")

    total_started_at = time.perf_counter()
    steps: list[dict[str, Any]] = []
    search_round_details: list[dict[str, Any]] = []

    decision_ms = 0
    retrieval_ms = 0
    rerank_ms = 0
    evaluation_ms = 0
    generation_ms = 0
    evaluation_tokens: list[int | None] = []
    evaluation_input_tokens: list[int | None] = []
    evaluation_output_tokens: list[int | None] = []
    current_query = normalized_question
    round_queries: list[str] = [normalized_question]
    final_results: list[RerankedResult] = []
    evaluations: list[ContextEvaluationResult] = []
    merged_candidates: dict[int, SearchResult] = {}
    round_contexts: list[list[RerankedResult]] = []

    await emit_event(
        steps,
        event_callback,
        "question_received",
        "completed",
        question=normalized_question,
    )

    decision, decision_ms = await agent_decision_step(
        steps,
        event_callback,
        normalized_question,
    )
    if decision.needs_search:
        current_query = decision.query
        round_queries = unique_queries(decision.query, decision.sub_queries)
    else:
        round_queries = [current_query]

    completed_rounds = 0
    for search_round in range(1, max_search_rounds + 1):
        completed_rounds = search_round
        round_candidates: list[SearchResult] = []
        query_result_details: list[dict[str, Any]] = []

        for query_index, query in enumerate(round_queries, start=1):
            candidates, round_retrieval_ms = await search_round_step(
                steps,
                event_callback,
                query,
                candidate_k,
                search_round,
                query_index=query_index,
            )
            retrieval_ms += round_retrieval_ms
            merge_candidates(merged_candidates, candidates)
            round_candidates.extend(candidates)

            query_results, round_rerank_ms = await rerank_round_step(
                steps,
                event_callback,
                query,
                candidates,
                top_k,
                search_round,
                query_index=query_index,
            )
            rerank_ms += round_rerank_ms
            round_contexts.append(query_results)
            query_result_details.append(
                {
                    "query": query,
                    "candidate_count": len(candidates),
                    "retrieved_chunk_ids": [result.chunk_id for result in query_results],
                }
            )

        final_results = select_accumulated_context(round_contexts, top_k)
        deduped_round_candidates = dedupe_candidates(round_candidates)

        evaluation, round_evaluation_ms = await context_evaluation_step(
            steps,
            event_callback,
            normalized_question,
            final_results,
            search_round,
            current_query,
        )
        evaluations.append(evaluation)
        evaluation_ms += round_evaluation_ms
        evaluation_tokens.append(evaluation.total_tokens)
        evaluation_input_tokens.append(evaluation.input_tokens)
        evaluation_output_tokens.append(evaluation.output_tokens)

        search_round_details.append(
            build_search_history_entry(
                search_round=search_round,
                query=current_query,
                candidates=deduped_round_candidates,
                results=final_results,
                evaluation=evaluation,
                queries=round_queries,
                query_results=query_result_details,
            )
        )

        if evaluation.sufficient:
            break
        round_queries = unique_queries(evaluation.next_query, evaluation.next_queries)
        if not round_queries:
            break
        if search_round == max_search_rounds:
            break
        await query_refinement_step(
            steps,
            event_callback,
            evaluation.next_query,
            evaluation.reason,
            evaluation.missing_requirements,
            search_round,
            next_queries=round_queries,
        )
        current_query = round_queries[0]

    if evaluations and not evaluations[-1].sufficient and completed_rounds == max_search_rounds:
        await retry_limit_step(steps, event_callback, completed_rounds, max_search_rounds)

    context, context_build_ms = await timed_step(
        steps,
        event_callback,
        "context_build",
        lambda: _build_context_async(final_results),
    )
    retrieval_ms += context_build_ms

    llm_result, generation_ms = await timed_step(
        steps,
        event_callback,
        "llm_generation",
        lambda: generate_answer(normalized_question, context),
    )

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = AgenticMetrics(
        decision_ms=decision_ms,
        retrieval_ms=retrieval_ms,
        rerank_ms=rerank_ms,
        evaluation_ms=evaluation_ms,
        generation_ms=generation_ms,
        total_ms=total_ms,
        search_rounds=completed_rounds,
        retrieved_chunk_count=len(merged_candidates),
        final_chunk_count=len(final_results),
        input_tokens=sum_optional(
            decision.input_tokens,
            *evaluation_input_tokens,
            llm_result.input_tokens,
        ),
        output_tokens=sum_optional(
            decision.output_tokens,
            *evaluation_output_tokens,
            llm_result.output_tokens,
        ),
        total_tokens=sum_optional(
            decision.total_tokens,
            *evaluation_tokens,
            llm_result.total_tokens,
        ),
        decision_tokens=decision.total_tokens,
        evaluation_tokens=sum_optional(*evaluation_tokens),
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
        "rag_type": "agentic",
        "question": normalized_question,
        "answer": llm_result.answer,
        "agent_decision": asdict(decision),
        "search_rounds": completed_rounds,
        "retrieved_chunks": [asdict(result) for result in final_results],
        "search_history": search_round_details,
        "search_round_details": search_round_details,
        "context_evaluations": [asdict(evaluation) for evaluation in evaluations],
        "metrics": asdict(metrics),
        "steps": steps,
        "llm": asdict(llm_result),
    }


async def agent_decision_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    question: str,
) -> tuple[AgentDecisionResult, int]:
    await emit_event(steps, callback, "agent_decision", "started")
    started_at = time.perf_counter()
    result = await make_agent_decision(question)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "agent_decision",
        "completed",
        elapsed_ms=elapsed_ms,
        query=result.query,
        sub_queries=result.sub_queries,
        reason=result.reason,
        needs_search=result.needs_search,
    )
    return result, elapsed_ms


async def search_round_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    query: str,
    candidate_k: int,
    search_round: int,
    query_index: int = 1,
) -> tuple[list[SearchResult], int]:
    step_name = "vector_search" if search_round == 1 else "retry_search"
    await emit_event(
        steps,
        callback,
        step_name,
        "started",
        search_round=search_round,
        query_index=query_index,
        query=query,
    )
    started_at = time.perf_counter()
    vector = embed_texts([query])[0]
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(f"query embedding dimension must be {EMBEDDING_DIMENSION}")
    candidates = await search_similar_chunks_by_vector(vector, top_k=candidate_k)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        step_name,
        "completed",
        elapsed_ms=elapsed_ms,
        search_round=search_round,
        query_index=query_index,
        query=query,
        candidate_count=len(candidates),
    )
    return candidates, elapsed_ms


async def rerank_round_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    query: str,
    candidates: list[SearchResult],
    top_k: int,
    search_round: int,
    query_index: int = 1,
) -> tuple[list[RerankedResult], int]:
    await emit_event(
        steps,
        callback,
        "reranking",
        "started",
        search_round=search_round,
        query_index=query_index,
    )
    started_at = time.perf_counter()
    results = rerank_chunks(query, candidates, top_k=top_k)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "reranking",
        "completed",
        elapsed_ms=elapsed_ms,
        search_round=search_round,
        query_index=query_index,
        result_count=len(results),
    )
    return results, elapsed_ms


async def context_evaluation_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    question: str,
    chunks: list[RerankedResult],
    search_round: int,
    search_query: str | None = None,
) -> tuple[ContextEvaluationResult, int]:
    await emit_event(
        steps,
        callback,
        "context_evaluation",
        "started",
        search_round=search_round,
    )
    started_at = time.perf_counter()
    result = await evaluate_context(question, chunks, search_query)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "context_evaluation",
        "completed",
        elapsed_ms=elapsed_ms,
        search_round=search_round,
        sufficient=result.sufficient,
        reason=result.reason,
        next_query=result.next_query,
        next_queries=result.next_queries,
        covered_requirements=result.covered_requirements,
        missing_requirements=result.missing_requirements,
    )
    return result, elapsed_ms


async def _build_context_async(results: list[RerankedResult]) -> str:
    return build_context(results)


async def query_refinement_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    next_query: str,
    reason: str,
    missing_requirements: list[str],
    search_round: int,
    next_queries: list[str] | None = None,
) -> None:
    started_at = time.perf_counter()
    await emit_event(
        steps,
        callback,
        "query_refinement",
        "started",
        search_round=search_round,
        reason=reason,
        missing_requirements=missing_requirements,
        next_queries=next_queries or [next_query],
    )
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    await emit_event(
        steps,
        callback,
        "query_refinement",
        "completed",
        elapsed_ms=elapsed_ms,
        search_round=search_round,
        query=next_query,
        queries=next_queries or [next_query],
        reason=reason,
        missing_requirements=missing_requirements,
    )


async def retry_limit_step(
    steps: list[dict[str, Any]],
    callback: EventCallback | None,
    completed_rounds: int,
    max_search_rounds: int,
) -> None:
    await emit_event(
        steps,
        callback,
        "retry_limit",
        "completed",
        search_round=completed_rounds,
        max_search_rounds=max_search_rounds,
        reason="Max search rounds reached. Use best available context.",
    )
