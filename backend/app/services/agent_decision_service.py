import asyncio
import json
from dataclasses import dataclass
from typing import Any

from openai import OpenAI, OpenAIError

from app.core.config import settings


AGENT_DECISION_PROMPT = """
You are a customer support RAG planning agent.
Decide whether the user's question needs document search.
Return only valid JSON with these fields:
{
  "needs_search": true,
  "query": "one concise search query",
  "reason": "short reason",
  "expected_intent": "short intent label",
  "search_strategy": "vector_search"
}
Keep the query faithful to the original question.
Preserve important conditions and constraints from the user's question.
For multi-part questions, include all important intents in the query.
Do not add facts.
""".strip()


@dataclass
class AgentDecisionResult:
    needs_search: bool
    query: str
    reason: str
    expected_intent: str | None
    search_strategy: str
    provider: str
    model: str
    configured: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def fallback_decision(question: str, error: str | None = None) -> AgentDecisionResult:
    return AgentDecisionResult(
        needs_search=True,
        query=question,
        reason="Fallback to searching with the original question.",
        expected_intent=None,
        search_strategy="vector_search",
        provider="openai",
        model=settings.openai_model,
        configured=bool(settings.openai_api_key),
        error=error,
    )


def _make_decision_sync(question: str) -> AgentDecisionResult:
    if not settings.openai_api_key:
        return fallback_decision(question, "OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        instructions=AGENT_DECISION_PROMPT,
        input=question,
        max_output_tokens=160,
        temperature=0,
    )
    usage = response.usage

    try:
        payload = parse_json_object(response.output_text)
    except (json.JSONDecodeError, TypeError) as exc:
        result = fallback_decision(question, f"JSON parse failed: {exc}")
        result.input_tokens = getattr(usage, "input_tokens", None)
        result.output_tokens = getattr(usage, "output_tokens", None)
        result.total_tokens = getattr(usage, "total_tokens", None)
        return result

    query = str(payload.get("query") or question).strip() or question
    return AgentDecisionResult(
        needs_search=bool(payload.get("needs_search", True)),
        query=query,
        reason=str(payload.get("reason") or "Search decision completed."),
        expected_intent=payload.get("expected_intent"),
        search_strategy=str(payload.get("search_strategy") or "vector_search"),
        provider="openai",
        model=settings.openai_model,
        configured=True,
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
        total_tokens=getattr(usage, "total_tokens", None),
    )


async def make_agent_decision(question: str) -> AgentDecisionResult:
    try:
        return await asyncio.to_thread(_make_decision_sync, question)
    except OpenAIError as exc:
        return fallback_decision(question, str(exc))
