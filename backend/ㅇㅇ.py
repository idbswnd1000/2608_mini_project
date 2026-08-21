from pathlib import Path

from openai import OpenAI

from app.core.config import settings


# backend/voice_tests
OUTPUT_DIR = Path(__file__).resolve().parent / "voice_tests"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


VOICE_TESTS = {
    "01_naive.mp3": """
안녕하세요. 지금부터 RAG의 기본적인 동작 과정을 살펴보겠습니다.

RAG는 사용자의 질문과 관련된 자료를 검색하고,
검색된 자료를 LLM에게 전달해서 답변 생성을 도와주는 방식입니다.

여기서 컨텍스트란 데이터베이스의 전체 자료가 아니라,
RAG가 검색하고 선별해서 최종적으로 LLM에게 전달하는 참고자료를 의미합니다.

그러면 가장 기본적인 구조부터 살펴보겠습니다.

네이브 래그로 넘어가겠습니다.

방금 실행된 과정을 보면 먼저 사용자의 질문을 임베딩합니다.
그리고 벡터 서치를 통해 질문과 의미적으로 가까운 자료를 검색합니다.

검색된 자료 중 관련성이 높은 상위 자료를 선택해서
컨텍스트를 구성하고 질문과 함께 LLM에게 전달합니다.

마지막으로 LLM은 전달받은 컨텍스트를 참고해서
사용자의 질문에 대한 최종 답변을 생성합니다.
""",

    "02_advanced.mp3": """
네이브 래그는 검색된 자료를 이용해서
LLM에게 필요한 컨텍스트를 제공하는 가장 기본적인 구조입니다.

하지만 처음 검색된 결과가 항상 가장 좋은 자료라고 할 수는 없습니다.

검색 결과에는 질문과 관련성이 높은 자료도 있지만,
상대적으로 관련성이 떨어지는 자료가 포함될 수도 있습니다.

따라서 검색 결과를 조금 더 정교하게 선별할 필요가 있습니다.

어드밴스드 래그로 넘어가겠습니다.

어드밴스드 래그에서는 검색된 후보들을 다시 평가합니다.

현재 구현에서는 리랭킹을 통해
질문과 관련성이 높은 자료가 위쪽에 위치하도록 검색 결과를 재정렬합니다.

그 결과 네이브 래그보다
LLM에게 더 적절한 컨텍스트를 제공하는 것을 목표로 합니다.
""",

    "03_agentic.mp3": """
어드밴스드 래그에서는 리랭킹을 사용해서
검색된 자료의 순서를 다시 조정할 수 있습니다.

하지만 검색된 자료 자체에
질문에 필요한 정보가 없다면
순서를 아무리 잘 바꾸더라도 충분한 답변을 만들기 어렵습니다.

이런 경우에는 현재 검색 결과가 충분한지 판단하고,
부족하다면 다시 검색할 필요가 있습니다.

에이전틱 래그로 넘어가겠습니다.

에이전틱 래그에서는 검색 결과로 구성한 컨텍스트가
질문에 답하기 충분한지 스스로 평가합니다.

충분하다고 판단하면 해당 컨텍스트를 LLM에게 전달합니다.

반대로 정보가 부족하다고 판단하면
부족한 내용을 기준으로 질문을 개선하고 다시 검색합니다.

이처럼 검색, 판단, 재검색 과정을 반복할 수 있다는 것이
에이전틱 래그의 특징입니다.
""",

    "04_no_command.mp3": """
RAG에서 중요한 부분 중 하나는
어떤 자료를 검색해서 LLM에게 전달하느냐입니다.

데이터베이스에는 다양한 자료가 저장되어 있고,
사용자의 질문을 임베딩하면
각 자료와 의미적인 유사도를 비교할 수 있습니다.

검색된 자료 중 관련성이 높은 자료를 선택하고,
선택된 자료를 컨텍스트로 구성합니다.

네이브 래그와 어드밴스드 래그를 비교하면
검색 결과를 처리하는 방법에 차이가 있습니다.

또한 에이전틱 래그에서는
현재 컨텍스트가 충분한지 판단하는 과정도 추가됩니다.

이처럼 각각의 RAG 구조에는 차이가 있으며,
사용 목적에 따라서 적절한 방식을 선택할 수 있습니다.

지금까지 RAG의 검색 과정과
컨텍스트의 역할에 대해서 살펴보았습니다.
""",
}


def create_tts(client: OpenAI, filename: str, text: str):
    output_path = OUTPUT_DIR / filename

    print(f"[생성 중] {filename}")

    with client.audio.speech.with_streaming_response.create(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input=text.strip(),
        instructions=(
            "한국어 기술 발표를 하는 대학생처럼 자연스럽게 말해주세요. "
            "너무 빠르지 않은 발표 속도로 또렷하게 발음해주세요. "
            "RAG, LLM, Context, Embedding, Vector Search, Reranking 같은 "
            "기술 용어도 자연스럽고 명확하게 발음해주세요. "
            "페이지 전환 문장이 나오더라도 음성을 멈추지 말고 "
            "자연스럽게 다음 설명을 계속 이어가 주세요."
        ),
    ) as response:
        response.stream_to_file(output_path)

    print(f"[완료] {output_path}")


def main():
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY가 설정되어 있지 않습니다.")

    client = OpenAI(api_key=settings.openai_api_key)

    print("=== Voice Test 파일 생성 시작 ===")

    for filename, text in VOICE_TESTS.items():
        create_tts(client, filename, text)

    print()
    print("=== 전체 생성 완료 ===")
    print(f"저장 위치: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()