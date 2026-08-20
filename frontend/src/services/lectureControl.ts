import { PageId } from "../navigation/navigation";

export type LectureAction =
  | "GO_NAIVE"
  | "GO_ADVANCED"
  | "GO_AGENTIC"
  | "GO_COMPARISON"
  | "GO_MULTIMODAL"
  | "GO_AGENTIC_MULTIMODAL";

export interface LectureCommandMessage {
  type: "lecture_command";
  action: LectureAction;
  transcript: string;
}

export interface LectureCommandResult {
  type: "lecture_command_result";
  transcript: string;
  action: LectureAction | null;
  matched: boolean;
  broadcast: boolean;
  duplicate: boolean;
  delivered?: number;
}

export const actionToPageId: Record<LectureAction, PageId> = {
  GO_NAIVE: "naive",
  GO_ADVANCED: "advanced",
  GO_AGENTIC: "agentic",
  GO_COMPARISON: "comparison",
  GO_MULTIMODAL: "multimodal",
  GO_AGENTIC_MULTIMODAL: "graphrag"
};

export function lectureControlWsUrl() {
  const configuredUrl = import.meta.env.VITE_LECTURE_CONTROL_WS_URL;
  if (typeof configuredUrl === "string" && configuredUrl.length > 0) {
    return configuredUrl;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8000/lecture-control/ws`;
}

export async function sendLectureAudio(audioBlob: Blob): Promise<LectureCommandResult> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "lecture-command.webm");
  const response = await fetch("/lecture-control/audio", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Audio command failed: ${response.status}`);
  }

  return response.json() as Promise<LectureCommandResult>;
}

export async function sendLectureCommand(action: LectureAction, transcript = "") {
  const response = await fetch("/lecture-control/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, transcript })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Command failed: ${response.status}`);
  }

  return response.json() as Promise<LectureCommandResult>;
}
