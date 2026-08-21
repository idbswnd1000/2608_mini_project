import asyncio
import json
from dataclasses import dataclass

from openai import OpenAI, OpenAIError

from app.core.config import settings
from app.services.agent_decision_service import parse_json_object
from app.services.reranker_service import RerankedResult


CONTEXT_EVALUATION_PROMPT = """
You evaluate whether retrieved customer support context is sufficient.
Return only valid JSON with these fields:
{
  "sufficient": true,
  "covered_requirements": ["requirement supported by context"],
  "missing_requirements": [],
  "reason": "short reason",
  "next_query": null,
  "supporting_chunk_ids": [1, 2]
}
First identify the user's main requirements. A requirement is a distinct question part, condition, eligibility, limitation, or requested procedure.
Set sufficient=true only when the retrieved context gives explicit grounded support for all main requirements, or clearly states that a requested condition is irrelevant.
Set sufficient=false when one or more main requirements lack substantive support and answering would require guessing facts not present in the context.
For multi-part or conditional questions, each important part and condition must be supported.
Do not mark context sufficient only because it is generally related.
The context must support the condition or limitation in the user's question, not just the broad topic.
Do not treat implied, adjacent, or likely policy details as covered. If cancellation, refund, delivery delay, tracking, payment, or modification conditions are asked separately, evaluate each separately.
Example: if the user asks whether an undelivered order can be cancelled and refunded, context about late-delivery refund eligibility alone is insufficient unless it also explicitly supports cancellation eligibility or cancellation conditions.
Example: general cancellation steps alone are insufficient for an undelivered-order question unless the context explicitly supports the late/not-arrived condition or clearly says the condition is irrelevant.
When sufficient=true, supporting_chunk_ids must list the chunk numbers that support every important part.
When sufficient=false, covered_requirements must list what is supported, missing_requirements must list what is not supported, and next_query must search specifically for the missing requirements.
When sufficient=false, next_query must be different from the current search query and must target the missing requirements with more specific terms.
If there is no useful different query to try, set next_query to null.
Do not add facts.
""".strip()


@dataclass
class ContextEvaluationResult:
    sufficient: bool
    reason: str
    next_query: str | None
    supporting_chunk_ids: list[int]
    covered_requirements: list[str]
    missing_requirements: list[str]
    provider: str
    model: str
    configured: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


def build_evaluation_input(
    question: str,
    chunks: list[RerankedResult],
    search_query: str | None = None,
) -> str:
    context = "\n\n".join(
        f"[Chunk {index}]\n{chunk.content}"
        for index, chunk in enumerate(chunks, start=1)
    )
    query_section = f"\n\nCurrent search query:\n{search_query}" if search_query else ""
    return f"Question:\n{question}{query_section}\n\nRetrieved context:\n{context}"


def fallback_evaluation(
    question: str,
    error: str | None = None,
) -> ContextEvaluationResult:
    return ContextEvaluationResult(
        sufficient=True,
        reason="Fallback evaluation: use currently retrieved context.",
        next_query=None,
        supporting_chunk_ids=[],
        covered_requirements=[],
        missing_requirements=[],
        provider="openai",
        model=settings.openai_model,
        configured=bool(settings.openai_api_key),
        error=error,
    )


def _evaluate_context_sync(
    question: str,
    chunks: list[RerankedResult],
    search_query: str | None = None,
) -> ContextEvaluationResult:
    if not settings.openai_api_key:
        return fallback_evaluation(question, "OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        instructions=CONTEXT_EVALUATION_PROMPT,
        input=build_evaluation_input(question, chunks, search_query),
        max_output_tokens=360,
        temperature=0,
    )
    usage = response.usage

    try:
        payload = parse_json_object(response.output_text)
    except (json.JSONDecodeError, TypeError) as exc:
        result = fallback_evaluation(question, f"JSON parse failed: {exc}")
        result.input_tokens = getattr(usage, "input_tokens", None)
        result.output_tokens = getattr(usage, "output_tokens", None)
        result.total_tokens = getattr(usage, "total_tokens", None)
        return result

    next_query = payload.get("next_query")
    if next_query is not None:
        next_query = str(next_query).strip() or None

    sufficient_value = payload.get("sufficient", True)
    if isinstance(sufficient_value, str):
        sufficient = sufficient_value.strip().lower() == "true"
    else:
        sufficient = bool(sufficient_value)

    supporting_chunk_ids = payload.get("supporting_chunk_ids") or []
    if not isinstance(supporting_chunk_ids, list):
        supporting_chunk_ids = []
    supporting_chunk_ids = [
        int(chunk_id)
        for chunk_id in supporting_chunk_ids
        if isinstance(chunk_id, int) or str(chunk_id).isdigit()
    ]
    covered_requirements = normalize_string_list(payload.get("covered_requirements"))
    missing_requirements = normalize_string_list(payload.get("missing_requirements"))

    return ContextEvaluationResult(
        sufficient=sufficient,
        reason=str(payload.get("reason") or "Context evaluation completed."),
        next_query=next_query,
        supporting_chunk_ids=supporting_chunk_ids,
        covered_requirements=covered_requirements,
        missing_requirements=missing_requirements,
        provider="openai",
        model=settings.openai_model,
        configured=True,
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
        total_tokens=getattr(usage, "total_tokens", None),
    )


async def evaluate_context(
    question: str,
    chunks: list[RerankedResult],
    search_query: str | None = None,
) -> ContextEvaluationResult:
    try:
        return await asyncio.to_thread(_evaluate_context_sync, question, chunks, search_query)
    except OpenAIError as exc:
        return fallback_evaluation(question, str(exc))


def normalize_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
