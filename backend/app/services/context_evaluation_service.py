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
  "reason": "short reason",
  "next_query": null,
  "supporting_chunk_ids": [1, 2]
}
Set sufficient=true when the retrieved context gives enough grounded information to create a useful answer to the user's question.
Do not require perfect or complete policy coverage.
Set sufficient=false only when a core part of the question is missing and answering would require guessing facts not present in the context.
For multi-part or conditional questions, every important part must be supported.
Do not mark context sufficient only because it is generally related.
The context must support the condition or limitation in the user's question, not just the broad topic.
Example: if the user asks whether they can cancel an order that has not arrived, general cancellation steps alone are not sufficient unless the context supports the late/not-arrived condition or clearly says the condition is irrelevant.
When sufficient=true, supporting_chunk_ids must list the chunk numbers that support every important part.
If insufficient, provide one concise next_query for another search.
Do not add facts.
""".strip()


@dataclass
class ContextEvaluationResult:
    sufficient: bool
    reason: str
    next_query: str | None
    supporting_chunk_ids: list[int]
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
) -> str:
    context = "\n\n".join(
        f"[Chunk {index}]\n{chunk.content}"
        for index, chunk in enumerate(chunks, start=1)
    )
    return f"Question:\n{question}\n\nRetrieved context:\n{context}"


def fallback_evaluation(
    question: str,
    error: str | None = None,
) -> ContextEvaluationResult:
    return ContextEvaluationResult(
        sufficient=True,
        reason="Fallback evaluation: use currently retrieved context.",
        next_query=None,
        supporting_chunk_ids=[],
        provider="openai",
        model=settings.openai_model,
        configured=bool(settings.openai_api_key),
        error=error,
    )


def _evaluate_context_sync(
    question: str,
    chunks: list[RerankedResult],
) -> ContextEvaluationResult:
    if not settings.openai_api_key:
        return fallback_evaluation(question, "OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        instructions=CONTEXT_EVALUATION_PROMPT,
        input=build_evaluation_input(question, chunks),
        max_output_tokens=180,
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

    return ContextEvaluationResult(
        sufficient=sufficient,
        reason=str(payload.get("reason") or "Context evaluation completed."),
        next_query=next_query,
        supporting_chunk_ids=supporting_chunk_ids,
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
) -> ContextEvaluationResult:
    try:
        return await asyncio.to_thread(_evaluate_context_sync, question, chunks)
    except OpenAIError as exc:
        return fallback_evaluation(question, str(exc))
