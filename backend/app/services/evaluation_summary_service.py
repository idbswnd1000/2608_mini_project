from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.evaluation import EvaluationQuestion, EvaluationResult
from app.services.evaluation_service import REPRESENTATIVE_FULL_QUESTION_KEYS


DIFFICULTY_ORDER = ["simple", "ambiguous", "complex", "overall"]
RAG_TYPE_ORDER = ["naive", "advanced", "agentic"]


def empty_summary_row() -> dict:
    return {
        "question_count": 0,
        "avg_hit_at_k": None,
        "avg_precision_at_k": None,
        "avg_mrr": None,
        "avg_intent_coverage_at_k": None,
        "avg_total_ms": None,
        "avg_input_tokens": None,
        "avg_output_tokens": None,
        "avg_total_tokens": None,
        "avg_search_rounds": None,
        "avg_step_count": None,
    }


def build_empty_summary() -> dict:
    return {
        difficulty: {
            rag_type: empty_summary_row()
            for rag_type in RAG_TYPE_ORDER
        }
        for difficulty in DIFFICULTY_ORDER
    }


def row_to_summary(row) -> dict:
    return {
        "question_count": int(row.question_count),
        "avg_hit_at_k": float(row.avg_hit_at_k) if row.avg_hit_at_k is not None else None,
        "avg_precision_at_k": (
            float(row.avg_precision_at_k)
            if row.avg_precision_at_k is not None
            else None
        ),
        "avg_mrr": float(row.avg_mrr) if row.avg_mrr is not None else None,
        "avg_intent_coverage_at_k": (
            float(row.avg_intent_coverage_at_k)
            if row.avg_intent_coverage_at_k is not None
            else None
        ),
        "avg_total_ms": float(row.avg_total_ms) if row.avg_total_ms is not None else None,
        "avg_input_tokens": (
            float(row.avg_input_tokens)
            if row.avg_input_tokens is not None
            else None
        ),
        "avg_output_tokens": (
            float(row.avg_output_tokens)
            if row.avg_output_tokens is not None
            else None
        ),
        "avg_total_tokens": (
            float(row.avg_total_tokens)
            if row.avg_total_tokens is not None
            else None
        ),
        "avg_search_rounds": (
            float(row.avg_search_rounds)
            if row.avg_search_rounds is not None
            else None
        ),
        "avg_step_count": (
            float(row.avg_step_count)
            if row.avg_step_count is not None
            else None
        ),
    }


async def get_summary_for_mode(
    evaluation_mode: str,
    question_keys: list[str] | None = None,
) -> dict:
    summary = build_empty_summary()

    async with AsyncSessionLocal() as session:
        difficulty_query = (
            select(
                EvaluationQuestion.difficulty.label("difficulty"),
                EvaluationResult.rag_type.label("rag_type"),
                func.count(EvaluationResult.id).label("question_count"),
                func.avg(EvaluationResult.hit_at_k).label("avg_hit_at_k"),
                func.avg(EvaluationResult.precision_at_k).label("avg_precision_at_k"),
                func.avg(EvaluationResult.mrr).label("avg_mrr"),
                func.avg(EvaluationResult.intent_coverage_at_k).label(
                    "avg_intent_coverage_at_k"
                ),
                func.avg(EvaluationResult.total_ms).label("avg_total_ms"),
                func.avg(EvaluationResult.input_tokens).label("avg_input_tokens"),
                func.avg(EvaluationResult.output_tokens).label("avg_output_tokens"),
                func.avg(EvaluationResult.total_tokens).label("avg_total_tokens"),
                func.avg(EvaluationResult.search_rounds).label("avg_search_rounds"),
                func.avg(EvaluationResult.step_count).label("avg_step_count"),
            )
            .join(
                EvaluationQuestion,
                EvaluationQuestion.id == EvaluationResult.evaluation_question_id,
            )
            .where(EvaluationResult.evaluation_mode == evaluation_mode)
        )
        overall_query = (
            select(
                EvaluationResult.rag_type.label("rag_type"),
                func.count(EvaluationResult.id).label("question_count"),
                func.avg(EvaluationResult.hit_at_k).label("avg_hit_at_k"),
                func.avg(EvaluationResult.precision_at_k).label("avg_precision_at_k"),
                func.avg(EvaluationResult.mrr).label("avg_mrr"),
                func.avg(EvaluationResult.intent_coverage_at_k).label(
                    "avg_intent_coverage_at_k"
                ),
                func.avg(EvaluationResult.total_ms).label("avg_total_ms"),
                func.avg(EvaluationResult.input_tokens).label("avg_input_tokens"),
                func.avg(EvaluationResult.output_tokens).label("avg_output_tokens"),
                func.avg(EvaluationResult.total_tokens).label("avg_total_tokens"),
                func.avg(EvaluationResult.search_rounds).label("avg_search_rounds"),
                func.avg(EvaluationResult.step_count).label("avg_step_count"),
            )
            .join(
                EvaluationQuestion,
                EvaluationQuestion.id == EvaluationResult.evaluation_question_id,
            )
            .where(EvaluationResult.evaluation_mode == evaluation_mode)
        )

        if question_keys is not None:
            difficulty_query = difficulty_query.where(
                EvaluationQuestion.question_key.in_(question_keys)
            )
            overall_query = overall_query.where(
                EvaluationQuestion.question_key.in_(question_keys)
            )

        difficulty_rows = await session.execute(
            difficulty_query
            .group_by(EvaluationQuestion.difficulty, EvaluationResult.rag_type)
        )

        overall_rows = await session.execute(
            overall_query.group_by(EvaluationResult.rag_type)
        )

    for row in difficulty_rows:
        summary[row.difficulty][row.rag_type] = row_to_summary(row)

    for row in overall_rows:
        summary["overall"][row.rag_type] = row_to_summary(row)

    return summary


async def get_evaluation_summary() -> dict:
    retrieval_summary = await get_summary_for_mode("retrieval")
    full_rag_summary = await get_summary_for_mode(
        "full",
        question_keys=REPRESENTATIVE_FULL_QUESTION_KEYS,
    )
    return {
        "retrieval_summary": retrieval_summary,
        "full_rag_summary": full_rag_summary,
        "representative_full_question_keys": REPRESENTATIVE_FULL_QUESTION_KEYS,
    }
