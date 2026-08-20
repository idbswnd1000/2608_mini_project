from typing import Literal


LectureAction = Literal[
    "GO_NAIVE",
    "GO_ADVANCED",
    "GO_AGENTIC",
    "GO_COMPARISON",
    "GO_MULTIMODAL",
    "GO_AGENTIC_MULTIMODAL",
]


def normalize_transcript(transcript: str) -> str:
    lowered = transcript.lower().strip()
    remove_chars = " \t\r\n.,!?。，！？\"'“”‘’()[]{}"
    return "".join(char for char in lowered if char not in remove_chars)


def has_transition_intent(normalized: str) -> bool:
    return "넘어가겠습니다" in normalized


def match_lecture_command(transcript: str) -> LectureAction | None:
    normalized = normalize_transcript(transcript)
    if not normalized or not has_transition_intent(normalized):
        return None

    has_agentic = "에이전틱" in normalized
    has_multimodal = "멀티모달" in normalized

    if has_agentic and has_multimodal:
        return "GO_AGENTIC_MULTIMODAL"
    if has_multimodal:
        return "GO_MULTIMODAL"
    if "비교" in normalized:
        return "GO_COMPARISON"
    if "어드밴스드" in normalized:
        return "GO_ADVANCED"
    if has_agentic:
        return "GO_AGENTIC"
    if "네이브" in normalized:
        return "GO_NAIVE"

    return None
