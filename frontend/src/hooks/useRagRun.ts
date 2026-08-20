import { useEffect, useMemo, useState } from "react";
import { RagResponse, RagType, runRagDemo } from "../services/api";

export interface PipelineStep {
  id: string;
  label: string;
  detail?: string;
}

export interface RagRunState {
  status: "idle" | "running" | "complete" | "error";
  activeStepIndex: number;
  result: RagResponse | null;
  error: string | null;
}

const defaultQuestion = "How can I track my order?";

export const pipelineSteps: Record<RagType, PipelineStep[]> = {
  naive: [
    { id: "question", label: "Question", detail: "사용자 질문" },
    { id: "embedding", label: "Embedding" },
    { id: "search", label: "Vector Search" },
    { id: "context", label: "Top-K Context" },
    { id: "llm", label: "LLM" },
    { id: "answer", label: "Answer" }
  ],
  advanced: [
    { id: "question", label: "Question" },
    { id: "rewrite", label: "Query Rewrite", detail: "질문 재작성" },
    { id: "embedding", label: "Embedding" },
    { id: "search", label: "Vector Search" },
    { id: "rerank", label: "Reranking", detail: "후보 재정렬" },
    { id: "context", label: "Top-K Context" },
    { id: "llm", label: "LLM" },
    { id: "answer", label: "Answer" }
  ],
  agentic: [
    { id: "decision", label: "Agent Decision", detail: "검색 전략 판단" },
    { id: "search", label: "Search" },
    { id: "evaluation", label: "Context Evaluation", detail: "충분한가?" },
    { id: "retry", label: "Retry Search", detail: "필요 시 재검색" },
    { id: "llm", label: "LLM" },
    { id: "answer", label: "Answer" }
  ]
};

export function useRagRun(ragType: RagType, enabled = true, question = defaultQuestion) {
  const steps = useMemo(() => pipelineSteps[ragType], [ragType]);
  const [runState, setRunState] = useState<RagRunState>({
    status: "idle",
    activeStepIndex: -1,
    result: null,
    error: null
  });

  useEffect(() => {
    if (!enabled) return;

    let isCancelled = false;
    let intervalId: number | undefined;

    setRunState({
      status: "running",
      activeStepIndex: 0,
      result: null,
      error: null
    });

    intervalId = window.setInterval(() => {
      setRunState((current) => {
        if (current.status !== "running") return current;
        return {
          ...current,
          activeStepIndex: Math.min(current.activeStepIndex + 1, steps.length - 1)
        };
      });
    }, 620);

    runRagDemo(ragType, question)
      .then((result) => {
        if (isCancelled) return;
        window.clearInterval(intervalId);
        setRunState({
          status: "complete",
          activeStepIndex: steps.length - 1,
          result,
          error: null
        });
      })
      .catch((error: Error) => {
        if (isCancelled) return;
        window.clearInterval(intervalId);
        setRunState({
          status: "error",
          activeStepIndex: -1,
          result: null,
          error: error.message
        });
      });

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, question, ragType, steps.length]);

  return {
    question,
    steps,
    ...runState
  };
}
