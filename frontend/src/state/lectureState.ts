export type LectureSection = "basic" | "evolution" | "comparison" | "conclusion";
export type RagStage = "basic" | "naive" | "advanced" | "agentic";

export type LectureAction =
  | "SHOW_BASIC"
  | "SHOW_NAIVE"
  | "EVOLVE_ADVANCED"
  | "EVOLVE_AGENTIC"
  | "SHOW_COMPARISON"
  | "SHOW_CONCLUSION"
  | "RESET";

export interface LectureState {
  lectureSection: LectureSection;
  ragStage: RagStage;
  action: LectureAction;
  stepIndex: number;
}

export interface LectureStep {
  action: LectureAction;
  label: string;
  section: LectureSection;
  ragStage: RagStage;
}

export const lectureSteps: LectureStep[] = [
  { action: "SHOW_BASIC", label: "Basic RAG", section: "basic", ragStage: "basic" },
  { action: "SHOW_NAIVE", label: "Naive", section: "evolution", ragStage: "naive" },
  { action: "EVOLVE_ADVANCED", label: "Advanced", section: "evolution", ragStage: "advanced" },
  { action: "EVOLVE_AGENTIC", label: "Agentic", section: "evolution", ragStage: "agentic" },
  { action: "SHOW_COMPARISON", label: "Live / Comparison", section: "comparison", ragStage: "agentic" },
  { action: "SHOW_CONCLUSION", label: "Conclusion", section: "conclusion", ragStage: "agentic" }
];

export const initialLectureState: LectureState = {
  lectureSection: "basic",
  ragStage: "basic",
  action: "SHOW_BASIC",
  stepIndex: 0
};

export function stateFromStepIndex(stepIndex: number): LectureState {
  const boundedIndex = Math.max(0, Math.min(stepIndex, lectureSteps.length - 1));
  const step = lectureSteps[boundedIndex];

  return {
    lectureSection: step.section,
    ragStage: step.ragStage,
    action: step.action,
    stepIndex: boundedIndex
  };
}

export function reduceLectureState(
  state: LectureState,
  action: LectureAction | "NEXT" | "PREVIOUS"
): LectureState {
  if (action === "NEXT") {
    return stateFromStepIndex(state.stepIndex + 1);
  }

  if (action === "PREVIOUS") {
    return stateFromStepIndex(state.stepIndex - 1);
  }

  if (action === "RESET") {
    return initialLectureState;
  }

  const index = lectureSteps.findIndex((step) => step.action === action);
  return index >= 0 ? stateFromStepIndex(index) : state;
}
