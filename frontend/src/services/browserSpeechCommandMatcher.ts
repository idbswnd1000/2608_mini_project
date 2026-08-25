import type { LectureAction } from "./lectureControl";

const TRANSITION_PHRASE = "넘어가겠습니다";
const SENTENCE_BOUNDARY_PATTERN = /[.!?。．！？\r\n]+/;
const COMMAND_WINDOW_BEFORE = 48;
const COMMAND_WINDOW_AFTER = 20;

const COMMAND_DESTINATIONS: Array<{
  action: LectureAction;
  keywords: string[];
}> = [
  {
    action: "GO_RAG_COMPARISON",
    keywords: [
      "답변비교",
      "질문답변비교",
      "세가지질문답변비교",
      "세가지답변비교",
      "세가지질문비교",
      "세가지질문답변",
    ],
  },

  {
    action: "GO_AGENTIC_MULTIMODAL",
    keywords: ["결합모델"],
  },

  {
    action: "GO_MULTIMODAL",
    keywords: [
      "멀티모달",

      // STT 오인식 대응
      "멀티모델",
    ],
  },

  {
    action: "GO_COMPARISON",
    keywords: [
      "래그비교",
      "레그비교",
      "rag비교",
      "구조비교",
    ],
  },

  {
    action: "GO_ADVANCED",
    keywords: [
      "어드밴스드",

      // STT 오인식 대응
      "어드밴스",
      "어드벤스드",
      "어드벤스",
    ],
  },

  {
    action: "GO_AGENTIC",
    keywords: [
      "에이전틱",

      // STT 오인식 대응
      "에이전트",
      "에이전티",
    ],
  },

  {
    action: "GO_NAIVE",
    keywords: [
      "naive",
      "네이브",
      "네이블",
      "네이브렉",
      "네이브래그",
      "네이브레그",
      "네이블래그",

      // STT 오인식 대응
      "네이버",
    ],
  },
];

export function normalizeSpeechText(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[ \t\r\n.,!?。，！？"'“”‘’()[\]{}]/g, "");
}

export function extractBrowserCommandSegment(transcript: string) {
  const sentences = transcript
    .split(SENTENCE_BOUNDARY_PATTERN)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const normalizedSentence = normalizeSpeechText(sentences[index]);
    const transitionIndex =
      normalizedSentence.indexOf(TRANSITION_PHRASE);

    if (transitionIndex < 0) {
      continue;
    }

    const start = Math.max(
      0,
      transitionIndex - COMMAND_WINDOW_BEFORE,
    );

    const end =
      transitionIndex +
      TRANSITION_PHRASE.length +
      COMMAND_WINDOW_AFTER;

    return normalizedSentence.slice(start, end);
  }

  return "";
}

export function matchBrowserLectureCommand(
  transcript: string,
): LectureAction | null {
  const commandSegment =
    extractBrowserCommandSegment(transcript);

  if (
    !commandSegment ||
    !commandSegment.includes(TRANSITION_PHRASE)
  ) {
    return null;
  }

  const transitionIndex =
    commandSegment.indexOf(TRANSITION_PHRASE);

  const beforeTransition =
    commandSegment.slice(0, transitionIndex);

  let closestAction: LectureAction | null = null;
  let closestIndex = -1;
  let closestOrder = Number.POSITIVE_INFINITY;

  COMMAND_DESTINATIONS.forEach((destination, order) => {
    destination.keywords.forEach((keyword) => {
      const index = beforeTransition.lastIndexOf(keyword);

      if (index < 0) {
        return;
      }

      if (
        index > closestIndex ||
        (index === closestIndex && order < closestOrder)
      ) {
        closestAction = destination.action;
        closestIndex = index;
        closestOrder = order;
      }
    });
  });

  return closestAction;
}
