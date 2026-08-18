import asyncio
from dataclasses import dataclass

from openai import OpenAI
from openai import OpenAIError

from app.core.config import settings


SYSTEM_PROMPT = """
You are a customer support assistant.
Answer using only the provided Context.
Do not present information outside the Context as fact.
If the Context is insufficient, say that the available information is insufficient.
Answer the user's question directly and concisely.
""".strip()


@dataclass
class LLMResult:
    answer: str
    provider: str
    model: str
    configured: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


def _generate_answer_sync(question: str, context: str) -> LLMResult:
    if not settings.openai_api_key:
        return LLMResult(
            answer=(
                "LLM is not configured. Set OPENAI_API_KEY and OPENAI_MODEL "
                "to generate an answer from the retrieved context."
            ),
            provider="openai",
            model=settings.openai_model,
            configured=False,
            error="OPENAI_API_KEY is not set",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM_PROMPT,
        input=(
            "Context:\n"
            f"{context}\n\n"
            "Question:\n"
            f"{question}"
        ),
    )
    usage = response.usage

    return LLMResult(
        answer=response.output_text,
        provider="openai",
        model=settings.openai_model,
        configured=True,
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
        total_tokens=getattr(usage, "total_tokens", None),
    )


async def generate_answer(question: str, context: str) -> LLMResult:
    try:
        return await asyncio.to_thread(_generate_answer_sync, question, context)
    except OpenAIError as exc:
        return LLMResult(
            answer="LLM generation failed. Retrieved context is available.",
            provider="openai",
            model=settings.openai_model,
            configured=True,
            error=str(exc),
        )
