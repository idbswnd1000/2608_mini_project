import time
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.rag.advanced import (
    DEFAULT_CANDIDATE_K,
    AdvancedMetrics,
    embedding_step as advanced_embedding_step,
    query_rewrite_step,
    reranking_step,
    sum_optional,
    vector_search_step,
)
from app.rag.agentic import (
    DEFAULT_MAX_SEARCH_ROUNDS,
    AgenticMetrics,
    agent_decision_step,
    build_search_history_entry,
    context_evaluation_step,
    merge_candidates,
    query_refinement_step,
    rerank_round_step,
    search_round_step,
)
from app.rag.naive import (
    Metrics,
    emit_event,
    embedding_step as naive_embedding_step,
    timed_step,
)
from app.models.evaluation import EvaluationQuestion, EvaluationResult
from app.rag.advanced import run_advanced_rag
from app.rag.agentic import run_agentic_rag
from app.rag.naive import run_naive_rag
from app.services.retrieval_evaluation_service import (
    calculate_retrieval_metrics,
    get_chunk_intents,
)
from app.services.vector_search_service import search_similar_chunks_by_vector


SUPPORTED_RAG_TYPES = {"naive", "advanced", "agentic"}
SUPPORTED_EVALUATION_MODES = {"full", "retrieval"}
REPRESENTATIVE_FULL_QUESTION_KEYS = [
    "simple_01",
    "simple_02",
    "simple_03",
    "ambiguous_01",
    "ambiguous_02",
    "ambiguous_03",
    "complex_01",
    "complex_02",
    "complex_03",
]


@dataclass
class EvaluationRunResult:
    question_key: str
    difficulty: str
    rag_type: str
    evaluation_mode: str
    chunk_ids: list[int]
    retrieved_intents: list[str | None]
    hit_at_k: float
    precision_at_k: float
    mrr: float
    intent_coverage_at_k: float
    total_ms: float | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    search_rounds: int | None
    step_count: int
    saved_result_id: int
    saved_action: str


async def run_rag_for_evaluation(
    rag_type: str,
    question: str,
    top_k: int = 5,
) -> dict:
    if rag_type == "naive":
        return await run_naive_rag(question, top_k=top_k)
    if rag_type == "advanced":
        return await run_advanced_rag(question, top_k=top_k)
    if rag_type == "agentic":
        return await run_agentic_rag(question, top_k=top_k)
    raise ValueError(f"unsupported rag_type: {rag_type}")


async def run_retrieval_only_for_evaluation(
    rag_type: str,
    question: str,
    top_k: int = 5,
) -> dict[str, Any]:
    if rag_type == "naive":
        return await run_naive_retrieval_only(question, top_k=top_k)
    if rag_type == "advanced":
        return await run_advanced_retrieval_only(question, top_k=top_k)
    if rag_type == "agentic":
        return await run_agentic_retrieval_only(question, top_k=top_k)
    raise ValueError(f"unsupported rag_type: {rag_type}")


async def run_naive_retrieval_only(question: str, top_k: int = 5) -> dict[str, Any]:
    normalized_question = question.strip()
    if not normalized_question:
        raise ValueError("question must not be empty")
    if top_k < 1 or top_k > 20:
        raise ValueError("top_k must be between 1 and 20")

    total_started_at = time.perf_counter()
    steps: list[dict[str, Any]] = []

    await emit_event(
        steps,
        None,
        "question_received",
        "completed",
        question=normalized_question,
    )
    query_vector, embedding_ms = await naive_embedding_step(
        steps,
        None,
        normalized_question,
    )
    results, vector_search_ms = await timed_step(
        steps,
        None,
        "vector_search",
        lambda: search_similar_chunks_by_vector(query_vector, top_k=top_k),
    )

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = Metrics(
        retrieval_ms=embedding_ms + vector_search_ms,
        generation_ms=0,
        total_ms=total_ms,
    )
    await emit_event(steps, None, "completed", "completed", elapsed_ms=total_ms)

    return {
        "rag_type": "naive",
        "evaluation_mode": "retrieval",
        "question": normalized_question,
        "answer": None,
        "retrieved_chunks": [asdict(result) for result in results],
        "metrics": asdict(metrics),
        "steps": steps,
        "llm": {
            "input_tokens": None,
            "output_tokens": None,
            "total_tokens": None,
        },
    }


async def run_advanced_retrieval_only(
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
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
        None,
        "question_received",
        "completed",
        question=normalized_question,
    )
    rewrite_result, rewrite_ms = await query_rewrite_step(
        steps,
        None,
        normalized_question,
    )
    rewritten_query = rewrite_result.rewritten_query
    query_vector, embedding_ms = await advanced_embedding_step(
        steps,
        None,
        rewritten_query,
    )
    candidates, vector_search_ms = await vector_search_step(
        steps,
        None,
        query_vector,
        candidate_k,
    )
    reranked_results, rerank_ms = await reranking_step(
        steps,
        None,
        rewritten_query,
        candidates,
        top_k,
    )

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = AdvancedMetrics(
        rewrite_ms=rewrite_ms,
        retrieval_ms=embedding_ms + vector_search_ms,
        rerank_ms=rerank_ms,
        generation_ms=0,
        total_ms=total_ms,
        input_tokens=rewrite_result.input_tokens,
        output_tokens=rewrite_result.output_tokens,
        total_tokens=rewrite_result.total_tokens,
        rewrite_tokens=rewrite_result.total_tokens,
        generation_tokens=None,
    )
    await emit_event(steps, None, "completed", "completed", elapsed_ms=total_ms)

    return {
        "rag_type": "advanced",
        "evaluation_mode": "retrieval",
        "question": normalized_question,
        "rewritten_query": rewritten_query,
        "answer": None,
        "retrieved_chunks": [asdict(result) for result in reranked_results],
        "candidate_count": len(candidates),
        "metrics": asdict(metrics),
        "steps": steps,
        "query_rewrite": asdict(rewrite_result),
    }


async def run_agentic_retrieval_only(
    question: str,
    top_k: int = 5,
    candidate_k: int = DEFAULT_CANDIDATE_K,
    max_search_rounds: int = DEFAULT_MAX_SEARCH_ROUNDS,
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
    retrieval_ms = 0
    rerank_ms = 0
    evaluation_ms = 0
    evaluation_tokens: list[int | None] = []
    evaluation_input_tokens: list[int | None] = []
    evaluation_output_tokens: list[int | None] = []
    current_query = normalized_question
    final_results = []
    evaluations = []
    merged_candidates = {}

    await emit_event(
        steps,
        None,
        "question_received",
        "completed",
        question=normalized_question,
    )

    decision, decision_ms = await agent_decision_step(
        steps,
        None,
        normalized_question,
    )
    if decision.needs_search:
        current_query = decision.query

    completed_rounds = 0
    for search_round in range(1, max_search_rounds + 1):
        completed_rounds = search_round
        candidates, round_retrieval_ms = await search_round_step(
            steps,
            None,
            current_query,
            candidate_k,
            search_round,
        )
        retrieval_ms += round_retrieval_ms
        merge_candidates(merged_candidates, candidates)

        final_results, round_rerank_ms = await rerank_round_step(
            steps,
            None,
            normalized_question,
            list(merged_candidates.values()),
            top_k,
            search_round,
        )
        rerank_ms += round_rerank_ms

        evaluation, round_evaluation_ms = await context_evaluation_step(
            steps,
            None,
            normalized_question,
            final_results,
            search_round,
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
                candidates=candidates,
                results=final_results,
                evaluation=evaluation,
            )
        )

        if evaluation.sufficient:
            break
        if not evaluation.next_query:
            break
        if search_round == max_search_rounds:
            break
        await query_refinement_step(
            steps,
            None,
            evaluation.next_query,
            evaluation.reason,
            search_round,
        )
        current_query = evaluation.next_query

    total_ms = int((time.perf_counter() - total_started_at) * 1000)
    metrics = AgenticMetrics(
        decision_ms=decision_ms,
        retrieval_ms=retrieval_ms,
        rerank_ms=rerank_ms,
        evaluation_ms=evaluation_ms,
        generation_ms=0,
        total_ms=total_ms,
        search_rounds=completed_rounds,
        retrieved_chunk_count=len(merged_candidates),
        final_chunk_count=len(final_results),
        input_tokens=sum_optional(decision.input_tokens, *evaluation_input_tokens),
        output_tokens=sum_optional(decision.output_tokens, *evaluation_output_tokens),
        total_tokens=sum_optional(decision.total_tokens, *evaluation_tokens),
        decision_tokens=decision.total_tokens,
        evaluation_tokens=sum_optional(*evaluation_tokens),
        generation_tokens=None,
    )
    await emit_event(steps, None, "completed", "completed", elapsed_ms=total_ms)

    return {
        "rag_type": "agentic",
        "evaluation_mode": "retrieval",
        "question": normalized_question,
        "answer": None,
        "agent_decision": asdict(decision),
        "search_rounds": completed_rounds,
        "retrieved_chunks": [asdict(result) for result in final_results],
        "search_history": search_round_details,
        "search_round_details": search_round_details,
        "context_evaluations": [asdict(evaluation) for evaluation in evaluations],
        "metrics": asdict(metrics),
        "steps": steps,
    }


def extract_token_usage(rag_type: str, rag_result: dict) -> tuple[int | None, int | None, int | None]:
    if rag_type == "naive":
        llm = rag_result.get("llm", {})
        return (
            llm.get("input_tokens"),
            llm.get("output_tokens"),
            llm.get("total_tokens"),
        )

    metrics = rag_result.get("metrics", {})
    return (
        metrics.get("input_tokens"),
        metrics.get("output_tokens"),
        metrics.get("total_tokens"),
    )


def extract_search_rounds(rag_type: str, rag_result: dict) -> int | None:
    if rag_type in {"naive", "advanced"}:
        return 1
    return rag_result.get("search_rounds")


async def load_evaluation_question(question_key: str) -> EvaluationQuestion:
    async with AsyncSessionLocal() as session:
        question = await session.scalar(
            select(EvaluationQuestion).where(
                EvaluationQuestion.question_key == question_key
            )
        )
        if question is None:
            raise ValueError(f"evaluation question not found: {question_key}")
        return question


async def upsert_evaluation_result(
    question: EvaluationQuestion,
    rag_type: str,
    evaluation_mode: str,
    rag_result: dict,
    metrics,
) -> tuple[EvaluationResult, str]:
    input_tokens, output_tokens, total_tokens = extract_token_usage(
        rag_type,
        rag_result,
    )
    values = {
        "hit_at_k": metrics.hit_at_k,
        "precision_at_k": metrics.precision_at_k,
        "mrr": metrics.mrr,
        "intent_coverage_at_k": metrics.intent_coverage_at_k,
        "total_ms": rag_result.get("metrics", {}).get("total_ms"),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "search_rounds": extract_search_rounds(rag_type, rag_result),
        "step_count": len(rag_result.get("steps", [])),
        "answer": rag_result.get("answer"),
    }

    async with AsyncSessionLocal() as session:
        async with session.begin():
            existing = await session.scalar(
                select(EvaluationResult).where(
                    EvaluationResult.evaluation_question_id == question.id,
                    EvaluationResult.rag_type == rag_type,
                    EvaluationResult.evaluation_mode == evaluation_mode,
                )
            )
            if existing is None:
                existing = EvaluationResult(
                    evaluation_question_id=question.id,
                    rag_type=rag_type,
                    evaluation_mode=evaluation_mode,
                    **values,
                )
                session.add(existing)
                await session.flush()
                action = "inserted"
            else:
                for key, value in values.items():
                    setattr(existing, key, value)
                await session.flush()
                action = "updated"

        await session.refresh(existing)
        return existing, action


async def run_and_store_evaluation(
    question_key: str,
    rag_type: str,
    top_k: int = 5,
    evaluation_mode: str = "full",
) -> EvaluationRunResult:
    if rag_type not in SUPPORTED_RAG_TYPES:
        raise ValueError(f"unsupported rag_type: {rag_type}")
    if evaluation_mode not in SUPPORTED_EVALUATION_MODES:
        raise ValueError(f"unsupported evaluation_mode: {evaluation_mode}")

    question = await load_evaluation_question(question_key)
    if evaluation_mode == "retrieval":
        rag_result = await run_retrieval_only_for_evaluation(
            rag_type=rag_type,
            question=question.question,
            top_k=top_k,
        )
    else:
        rag_result = await run_rag_for_evaluation(
            rag_type=rag_type,
            question=question.question,
            top_k=top_k,
        )

    chunk_ids = [
        chunk["chunk_id"]
        for chunk in rag_result.get("retrieved_chunks", [])
    ]
    retrieved_intents = await get_chunk_intents(chunk_ids)
    retrieval_metrics = calculate_retrieval_metrics(
        expected_intents=question.expected_intents,
        retrieved_intents=retrieved_intents,
    )
    saved_result, action = await upsert_evaluation_result(
        question=question,
        rag_type=rag_type,
        evaluation_mode=evaluation_mode,
        rag_result=rag_result,
        metrics=retrieval_metrics,
    )

    return EvaluationRunResult(
        question_key=question.question_key,
        difficulty=question.difficulty,
        rag_type=rag_type,
        evaluation_mode=evaluation_mode,
        chunk_ids=chunk_ids,
        retrieved_intents=retrieved_intents,
        saved_result_id=saved_result.id,
        saved_action=action,
        **asdict(retrieval_metrics),
        total_ms=saved_result.total_ms,
        input_tokens=saved_result.input_tokens,
        output_tokens=saved_result.output_tokens,
        total_tokens=saved_result.total_tokens,
        search_rounds=saved_result.search_rounds,
        step_count=saved_result.step_count or 0,
    )
