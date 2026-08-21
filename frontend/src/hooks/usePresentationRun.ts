import { useEffect, useMemo, useRef, useState } from "react";
import { RagType } from "../services/api";

export type PipelineStatus = "idle" | "running" | "completed" | "failed" | "retry" | "insufficient";

export interface PipelineStep {
  id: string;
  label: string;
  detail?: string;
  sourceIds?: string[];
  variant?: "advanced" | "agentic";
  branchDetail?: string;
}

export interface PresentationEvent {
  event: string;
  rag_type: RagType;
  step: string;
  status: string;
  actual_elapsed_ms?: number;
  round?: number;
  retry_count?: number;
  intermediate_result?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  reason?: string;
  query?: string;
  timestamp: number;
  question?: string;
}

export interface StepState {
  status: PipelineStatus;
  elapsedMs?: number;
  round?: number;
}

const defaultQuestion = "My order still has not arrived. Can I cancel it, and can I get a refund?";

export const pipelineSteps: Record<RagType, PipelineStep[]> = {
  naive: [
    { id: "question_received", label: "Question", detail: "사용자가 입력한 질문" },
    { id: "embedding", label: "Embedding", detail: "질문의 의미를 벡터로 변환" },
    { id: "vector_search", label: "Vector Search", detail: "질문과 가까운 문서를 검색" },
    { id: "context_build", label: "Top-K Context", detail: "관련도가 높은 문서를 선택" },
    { id: "llm_generation", label: "LLM", detail: "검색한 정보를 바탕으로 답변 생성" }
  ],
  advanced: [
    { id: "question_received", label: "Question", detail: "사용자가 입력한 질문" },
    { id: "query_rewrite", label: "Query Rewrite", detail: "검색하기 좋은 질문으로 다시 작성", variant: "advanced" },
    { id: "embedding", label: "Embedding", detail: "질문의 의미를 벡터로 변환" },
    { id: "vector_search", label: "Vector Search", detail: "관련 문서 후보를 검색" },
    { id: "reranking", label: "Reranking", detail: "검색 결과를 관련도 순으로 다시 정렬", variant: "advanced" },
    { id: "context_build", label: "Top-K Context", detail: "가장 관련 있는 문서를 선택" },
    { id: "llm_generation", label: "LLM", detail: "선택한 정보를 바탕으로 답변 생성" }
  ],
  agentic: [
    { id: "question_received", label: "Question", detail: "사용자가 입력한 질문" },
    { id: "agent_decision", label: "Agent Decision", detail: "검색이 필요한지 판단", variant: "agentic" },
    { id: "vector_search", label: "Search", detail: "관련 정보를 검색", sourceIds: ["vector_search", "retry_search"] },
    { id: "reranking", label: "Reranking", detail: "검색 결과를 관련도 순으로 정렬", variant: "advanced" },
    {
      id: "context_evaluation",
      label: "Context Evaluation",
      detail: "찾은 정보가 답변하기에 충분한지 판단",
      branchDetail: "정보가 충분한가?",
      variant: "agentic"
    },
    { id: "query_refinement", label: "Query Refinement", detail: "부족하면 검색 질문을 개선", variant: "agentic" },
    { id: "context_build", label: "Context", detail: "답변에 사용할 정보를 구성" },
    { id: "llm_generation", label: "LLM", detail: "검색한 정보를 이용해 답변 생성" }
  ]
};

function initialStepStates(steps: PipelineStep[]) {
  return Object.fromEntries(steps.map((step) => [step.id, { status: "idle" as PipelineStatus }]));
}

function mapEventToStatus(event: PresentationEvent): PipelineStatus {
  if (event.event === "error" || event.status === "failed") return "failed";
  if (event.event === "retry") return "retry";
  if (event.step === "context_evaluation" && event.status === "completed") {
    const sufficient = event.intermediate_result?.sufficient;
    return sufficient === false ? "insufficient" : "completed";
  }
  if (event.status === "running") return "running";
  if (event.status === "completed") return "completed";
  return "idle";
}

export function usePresentationRun(ragType: RagType, enabled = true, question = defaultQuestion) {
  const steps = useMemo(() => pipelineSteps[ragType], [ragType]);
  const [status, setStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [stepStates, setStepStates] = useState<Record<string, StepState>>(() => initialStepStates(steps));
  const [events, setEvents] = useState<PresentationEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<PresentationEvent | null>(null);
  const [latestStepEvent, setLatestStepEvent] = useState<PresentationEvent | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    setStatus("running");
    setStepStates(initialStepStates(steps));
    setEvents([]);
    setLatestEvent(null);
    setLatestStepEvent(null);
    setResult(null);
    setError(null);
    completedRef.current = false;

    const params = new URLSearchParams({
      question,
      top_k: "5",
      candidate_k: "10",
      max_search_rounds: "3"
    });
    const source = new EventSource(`/presentation/${ragType}/stream?${params.toString()}`);

    function handleMessage(message: MessageEvent) {
      let event: PresentationEvent;
      try {
        event = JSON.parse(message.data) as PresentationEvent;
      } catch {
        setStatus("error");
        setError("Invalid SSE payload");
        source.close();
        return;
      }

      setEvents((current) => [...current, event]);
      setLatestEvent(event);
      if (event.step && event.step !== "run" && event.step !== "round") {
        setLatestStepEvent(event);
      }

      if (event.event === "run_start") {
        setStatus("running");
        return;
      }

      if (event.event === "run_complete") {
        completedRef.current = true;
        setStatus("complete");
        setResult(event.result ?? null);
        setError(null);
        source.close();
        return;
      }

      if (event.event === "error") {
        setStatus("error");
        setError(event.error ?? "Presentation stream failed");
      }

      if (event.step && event.step !== "run" && event.step !== "round") {
        setStepStates((current) => ({
          ...current,
          [event.step]: {
            status: mapEventToStatus(event),
            elapsedMs: event.actual_elapsed_ms,
            round: event.round
          }
        }));
      }
    }

    const eventNames = [
      "run_start",
      "step_start",
      "step_complete",
      "round_start",
      "decision",
      "retry",
      "run_complete",
      "error"
    ];
    eventNames.forEach((eventName) => source.addEventListener(eventName, handleMessage as EventListener));
    source.onerror = () => {
      if (completedRef.current) {
        source.close();
        return;
      }
      setStatus("error");
      setError("SSE connection failed");
      source.close();
    };

    return () => {
      source.close();
    };
  }, [enabled, question, ragType, steps]);

  return {
    question,
    ragType,
    status,
    steps,
    stepStates,
    events,
    latestEvent,
    latestStepEvent,
    result,
    error
  };
}
