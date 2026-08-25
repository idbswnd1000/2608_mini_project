import asyncio
from dataclasses import dataclass

from openai import OpenAI
from openai import OpenAIError

from app.core.config import settings


SYSTEM_PROMPT = """
You are a customer support assistant.
Answer using only the provided Context.
Do not present information outside the Context as fact.
If the Context supports only part of the answer, answer the supported part first and clearly separate what is not confirmed by the Context.
Do not reject the whole question only because one condition is missing.
If the Context is entirely insufficient, say that the available information is insufficient.
Answer the user's question directly and concisely.
Answer in the same order as the requirements in the Question.
Use only information explicitly stated in the Context.
If the same information appears in multiple Context chunks, mention it only once.
Do not expose internal template names, placeholders, or strings such as {{...}}.
When a needed concrete value is represented only as a placeholder, say that the concrete value is not provided in the Context.
Always answer in Korean, even when the Question or Context is written in another language.
최종 답변은 반드시 자연스러운 한국어로 작성한다.
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
                "LLM이 설정되어 있지 않습니다. 검색된 Context를 바탕으로 답변을 생성하려면 "
                "OPENAI_API_KEY와 OPENAI_MODEL을 설정하세요."
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
        temperature=0,
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
            answer="LLM 답변 생성에 실패했습니다. 검색된 Context는 사용할 수 있습니다.",
            provider="openai",
            model=settings.openai_model,
            configured=True,
            error=str(exc),
        )
