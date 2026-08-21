import type { LectureAction } from "./lectureControl";

const TRANSITION_PHRASE = "넘어가겠습니다";
const SENTENCE_BOUNDARY_PATTERN = /[.!?。．！？\r\n]+/;
const COMMAND_WINDOW_BEFORE = 48;
const COMMAND_WINDOW_AFTER = 20;

const COMMAND_DESTINATIONS: Array<{ action: LectureAction; keywords: string[] }> = [
  {
    action: "GO_AGENTIC_MULTIMODAL",
    keywords: ["에이전틱이결합된멀티모달", "에이전틱멀티모달", "에이전틱과멀티모달"]
  },
  {
    action: "GO_MULTIMODAL",
    keywords: ["멀티모달"]
  },
  {
    action: "GO_COMPARISON",
    keywords: ["래그비교", "레그비교", "rag비교"]
  },
  {
    action: "GO_ADVANCED",
    keywords: ["어드밴스드"]
  },
  {
    action: "GO_AGENTIC",
    keywords: ["에이전틱"]
  },
  {
    action: "GO_NAIVE",
    keywords: ["naive", "네이브", "네이블", "네이브렉", "네이브래그", "네이브레그", "네이블래그"]
  }
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
    const transitionIndex = normalizedSentence.indexOf(TRANSITION_PHRASE);
    if (transitionIndex < 0) continue;

    const start = Math.max(0, transitionIndex - COMMAND_WINDOW_BEFORE);
    const end = transitionIndex + TRANSITION_PHRASE.length + COMMAND_WINDOW_AFTER;
    const currentSegment = normalizedSentence.slice(start, end);
    return currentSegment;
  }

  return "";
}

export function matchBrowserLectureCommand(transcript: string): LectureAction | null {
  const commandSegment = extractBrowserCommandSegment(transcript);
  if (!commandSegment || !commandSegment.includes(TRANSITION_PHRASE)) {
    return null;
  }

  const transitionIndex = commandSegment.indexOf(TRANSITION_PHRASE);
  const beforeTransition = commandSegment.slice(0, transitionIndex);
  if (beforeTransition.includes("에이전틱") && beforeTransition.includes("멀티모달")) {
    return "GO_AGENTIC_MULTIMODAL";
  }

  let closestAction: LectureAction | null = null;
  let closestIndex = -1;
  let closestOrder = Number.POSITIVE_INFINITY;

  COMMAND_DESTINATIONS.forEach((destination, order) => {
    destination.keywords.forEach((keyword) => {
      const index = beforeTransition.lastIndexOf(keyword);
      if (index < 0) return;
      if (index > closestIndex || (index === closestIndex && order < closestOrder)) {
        closestAction = destination.action;
        closestIndex = index;
        closestOrder = order;
      }
    });
  });

  return closestAction;
}
