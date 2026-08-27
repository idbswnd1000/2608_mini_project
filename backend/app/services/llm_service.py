import asyncio
from dataclasses import dataclass

from openai import OpenAI
from openai import OpenAIError

from app.core.config import settings
from app.services.customer_answer_formatter import clean_customer_answer
from app.services.openai_response_options import deterministic_response_options


SYSTEM_PROMPT = """
You are a customer support assistant.
Use the provided support information only as private reference material.
Do not present information outside the reference material as fact.
If the reference material supports only part of the answer, answer the supported part first and naturally explain what cannot be confirmed.
Do not reject the whole question only because one condition is missing.
If the reference material is entirely insufficient, politely ask for the missing information or say that it is hard to confirm from the available guidance.
Answer the user's question directly and concisely.
Answer in the same order as the requirements in the Question.
Use only information explicitly stated in the reference material.
If the same information appears more than once, mention it only once.
Do not expose internal template names, placeholders, or strings such as {{...}}.
Do not mention internal terms such as Context, retrieval, chunk, embedding, vector, rerank, top-k, LLM, or RAG in the final answer.
When a needed concrete value is represented only as a placeholder, naturally ask the customer for that information.
Return only the customer-facing answer text. Do not return JSON, markdown code fences, or template braces.
Always answer in Korean, even when the Question or reference material is written in another language.
Write the final answer in natural Korean for a customer.
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
            answer=clean_customer_answer(
                "답변 생성 설정이 완료되지 않았습니다. 관리자에게 설정 확인을 요청해주세요."
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
            "Reference material:\n"
            f"{context}\n\n"
            "Question:\n"
            f"{question}"
        ),
        **deterministic_response_options(settings.openai_model),
    )
    usage = response.usage

    return LLMResult(
        answer=clean_customer_answer(response.output_text),
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
            answer=clean_customer_answer("답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요."),
            provider="openai",
            model=settings.openai_model,
            configured=True,
            error=str(exc),
        )
