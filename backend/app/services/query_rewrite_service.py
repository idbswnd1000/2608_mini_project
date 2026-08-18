import asyncio
from dataclasses import dataclass

from openai import OpenAI, OpenAIError

from app.core.config import settings


REWRITE_PROMPT = """
Rewrite the user's customer support question into one concise search query.
Keep the original meaning.
Do not add new facts.
Return only one search query.
Make it useful for searching customer support documents.
""".strip()


@dataclass
class QueryRewriteResult:
    original_question: str
    rewritten_query: str
    provider: str
    model: str
    configured: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


def _clean_rewritten_query(text: str, fallback: str) -> str:
    rewritten = text.strip().strip('"').strip("'").strip()
    return rewritten or fallback


def _rewrite_query_sync(question: str) -> QueryRewriteResult:
    if not settings.openai_api_key:
        return QueryRewriteResult(
            original_question=question,
            rewritten_query=question,
            provider="openai",
            model=settings.openai_model,
            configured=False,
            error="OPENAI_API_KEY is not set",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        instructions=REWRITE_PROMPT,
        input=question,
        max_output_tokens=80,
    )
    usage = response.usage

    return QueryRewriteResult(
        original_question=question,
        rewritten_query=_clean_rewritten_query(response.output_text, question),
        provider="openai",
        model=settings.openai_model,
        configured=True,
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
        total_tokens=getattr(usage, "total_tokens", None),
    )


async def rewrite_query(question: str) -> QueryRewriteResult:
    try:
        return await asyncio.to_thread(_rewrite_query_sync, question)
    except OpenAIError as exc:
        return QueryRewriteResult(
            original_question=question,
            rewritten_query=question,
            provider="openai",
            model=settings.openai_model,
            configured=True,
            error=str(exc),
        )
