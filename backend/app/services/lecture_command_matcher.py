import re
from typing import Literal


LectureAction = Literal[
    "GO_NAIVE",
    "GO_ADVANCED",
    "GO_AGENTIC",
    "GO_COMPARISON",
    "GO_MULTIMODAL",
    "GO_AGENTIC_MULTIMODAL",
]

TRANSITION_PHRASE = "넘어가겠습니다"
SENTENCE_BOUNDARY_PATTERN = re.compile(r"[.!?。．！？\r\n]+")
SHORT_PRECEDING_CHARS = 24
SHORT_FOLLOWING_CHARS = 32
MAX_PREVIOUS_SEGMENT_CHARS = 12
NAIVE_KEYWORDS = ("naive", "네이브", "네이블", "네이브렉")
PAGE_KEYWORDS = (
    "비교",
    "어드밴스드",
    "에이전틱",
    "멀티모달",
    *NAIVE_KEYWORDS,
)


def normalize_transcript(transcript: str) -> str:
    lowered = transcript.lower().strip()
    remove_chars = " \t\r\n.,!?。，！？\"'“”‘’()[]{}"
    return "".join(char for char in lowered if char not in remove_chars)


def has_transition_intent(normalized: str) -> bool:
    return TRANSITION_PHRASE in normalized


def extract_command_segment(transcript: str) -> str:
    sentences = [
        sentence.strip()
        for sentence in SENTENCE_BOUNDARY_PATTERN.split(transcript)
        if sentence.strip()
    ]
    for index, sentence in enumerate(sentences):
        normalized_sentence = normalize_transcript(sentence)
        if not has_transition_intent(normalized_sentence):
            continue

        transition_index = normalized_sentence.find(TRANSITION_PHRASE)
        start = max(0, transition_index - SHORT_PRECEDING_CHARS)
        end = transition_index + len(TRANSITION_PHRASE) + SHORT_FOLLOWING_CHARS
        normalized_sentence = normalized_sentence[start:end]

        previous = ""
        if index > 0 and not has_any_keyword(normalized_sentence, PAGE_KEYWORDS):
            normalized_previous = normalize_transcript(sentences[index - 1])
            if len(normalized_previous) <= MAX_PREVIOUS_SEGMENT_CHARS:
                previous = normalized_previous

        return previous + normalized_sentence

    return ""


def has_any_keyword(normalized: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in normalized for keyword in keywords)


def match_lecture_command(transcript: str) -> LectureAction | None:
    normalized = normalize_transcript(transcript)
    if not normalized or not has_transition_intent(normalized):
        return None

    command_segment = extract_command_segment(transcript)
    if not command_segment:
        return None

    has_agentic = "에이전틱" in command_segment
    has_multimodal = "멀티모달" in command_segment

    if has_agentic and has_multimodal:
        return "GO_AGENTIC_MULTIMODAL"
    if has_multimodal:
        return "GO_MULTIMODAL"
    if "비교" in command_segment:
        return "GO_COMPARISON"
    if "어드밴스드" in command_segment:
        return "GO_ADVANCED"
    if has_agentic:
        return "GO_AGENTIC"
    if has_any_keyword(command_segment, NAIVE_KEYWORDS):
        return "GO_NAIVE"

    return None
