import { useMemo } from "react";
import { RagType } from "../../services/api";
import { RagStage } from "../../state/lectureState";
import { AgenticControlDiagram } from "../rag/AgenticControlDiagram";
import { ExecutablePipeline } from "../rag/ExecutablePipeline";
import { ExecutionTrace, TeachingGuide } from "../rag/ExecutionTrace";
import { PipelineStep, StepState, usePresentationRun } from "../../hooks/usePresentationRun";

interface EvolutionSectionProps {
  ragStage: RagStage;
}

function toRagType(stage: RagStage): RagType {
  return stage === "basic" ? "naive" : stage;
}

const stageCopies: Record<RagType, { label: string; question: string; description: string; guide: TeachingGuide }> = {
  naive: {
    label: "NAIVE RAG",
    question: "가장 기본적인 RAG는 어떻게 검색할까?",
    description: "검색한 결과를 바로 Context로 사용합니다.",
    guide: {
      why: "LLM이 답변하기 전에 질문과 관련된 외부 근거를 찾아야 합니다.",
      principle: "질문과 문서를 같은 벡터 공간에 놓고, 의미적으로 가까운 문서를 검색합니다.",
      keyPoint: "질문과 문서를 벡터 공간에서 비교해 관련 정보를 찾는다.",
      concepts: [
        { label: "EMBEDDING", title: "의미를 숫자 벡터로 표현", description: "의미가 비슷한 문장은 벡터 공간에서도 가깝습니다." },
        { label: "VECTOR SEARCH", title: "질문 벡터와 문서 벡터 비교", description: "유사도를 기준으로 가까운 문서를 찾습니다." },
        { label: "TOP-K", title: "Context 후보 선택", description: "상위 K개 검색 결과를 LLM 근거로 전달합니다." }
      ],
      bridge: "LIMITATION · 검색된 Top-K의 품질에 답변 품질이 크게 영향을 받습니다."
    }
  },
  advanced: {
    label: "ADVANCED RAG",
    question: "검색 품질을 어떻게 개선할까?",
    description: "검색 전 질문을 개선하고, 검색 후 후보 문서의 순위를 다시 평가합니다.",
    guide: {
      why: "Naive는 처음 검색된 Top-K 품질에 크게 의존합니다.",
      principle: "검색 전에는 질문을 개선하고, 검색 후에는 후보 순위를 다시 평가합니다.",
      keyPoint: "검색 전 질문과 검색 후 후보를 개선해 Retrieval 품질을 높인다.",
      concepts: [
        { label: "QUERY REWRITE", title: "BEFORE RETRIEVAL", description: "사용자 질문을 검색에 더 적합한 표현으로 개선합니다." },
        { label: "VECTOR SEARCH", title: "빠르게 후보군 추출", description: "전체 문서에서 Candidate K개를 먼저 좁힙니다." },
        { label: "RERANKING", title: "AFTER RETRIEVAL", description: "후보군 안에서 더 정밀하게 다시 순위화합니다." }
      ],
      bridge: "LIMITATION · 검색 품질은 개선했지만, 정해진 파이프라인을 한 번 수행합니다. 검색한 정보가 부족하다면?"
    }
  },
  agentic: {
    label: "AGENTIC RAG",
    question: "검색한 정보가 부족하다면?",
    description: "검색 결과를 판단하고 필요하면 다시 검색합니다.",
    guide: {
      why: "검색 결과가 답변하기 부족한데도 고정 파이프라인은 그대로 끝날 수 있습니다.",
      principle: "현재 결과를 평가하고 다음 검색 행동을 동적으로 결정하는 제어 구조입니다.",
      keyPoint: "검색 결과를 평가하고 다음 검색 행동을 동적으로 결정한다.",
      concepts: [
        { label: "AGENT DECISION", title: "무엇을 해야 하는지 결정", description: "현재 상태에서 필요한 행동을 선택합니다." },
        { label: "CONTEXT EVALUATION", title: "정보 충분성 판단", description: "현재 정보가 답변하기 충분한지 평가합니다." },
        { label: "REFINEMENT / RETRY", title: "부족한 정보 보완", description: "평가 후 부족한 정보를 찾도록 질문을 수정합니다." }
      ],
      bridge: "TRADE-OFF · 판단과 재검색이 가능하지만 처리 시간, 토큰, 시스템 복잡성이 증가할 수 있습니다."
    }
  }
};

function withAnswerStep(steps: PipelineStep[], status: ReturnType<typeof usePresentationRun>["status"]) {
  const answerStep = { id: "answer", label: "Answer", detail: "최종 답변" };
  const displaySteps = steps.some((step) => step.id === "answer") ? steps : [...steps, answerStep];
  const answerState: StepState = { status: status === "complete" ? "completed" : "idle" };
  return { displaySteps, answerState };
}

function eventNumber(event: ReturnType<typeof usePresentationRun>["latestStepEvent"], key: "round" | "retry_count") {
  if (!event) return 0;
  if (typeof event[key] === "number") return event[key];
  const data = event.intermediate_result;
  const value = data && typeof data === "object" ? data[key] : undefined;
  return typeof value === "number" ? value : 0;
}

function latestEventNumber(events: ReturnType<typeof usePresentationRun>["events"], key: "round" | "retry_count") {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = eventNumber(events[index], key);
    if (value) return value;
  }
  return 0;
}

export function EvolutionSection({ ragStage }: EvolutionSectionProps) {
  const ragType = toRagType(ragStage);
  const copy = useMemo(() => stageCopies[ragType], [ragType]);
  const run = usePresentationRun(ragType, true);
  const { displaySteps, answerState } = withAnswerStep(run.steps, run.status);
  const displayStates = { ...run.stepStates, answer: answerState };
  const round = Number(
    eventNumber(run.latestStepEvent, "round") || latestEventNumber(run.events, "round") || run.result?.search_rounds || 0
  );
  const retry = Number(
    eventNumber(run.latestStepEvent, "retry_count") ||
      latestEventNumber(run.events, "retry_count") ||
      run.result?.retry_count ||
      0
  );

  return (
    <section className="lecture-section evolution-section">
      <header className="evolution-header lecture-page-header">
        <div className="section-kicker">{copy.label}</div>
        <h1>{copy.question}</h1>
        <p>{copy.description}</p>
      </header>
      <div className="evolution-layout">
        <div className="structure-panel">
          <div className="panel-label">RAG STRUCTURE</div>
          {ragType === "agentic" ? (
            <>
              <div className="principle-map agentic-principle-map" aria-label="Agentic principle">
                <div>
                  <span>Advanced</span>
                  <strong>Input → Fixed Pipeline → Output</strong>
                </div>
                <div>
                  <span>Agentic</span>
                  <strong>Decision → Action → Result → Evaluation ↺</strong>
                </div>
              </div>
              <AgenticControlDiagram stepStates={run.stepStates} round={round} retry={retry} />
            </>
          ) : (
            <>
              {ragType === "advanced" && (
                <div className="principle-map advanced-principle-map" aria-label="Advanced RAG principle">
                  <div>
                    <span>BEFORE RETRIEVAL</span>
                    <strong>Query Rewrite</strong>
                    <em>검색 전 질문 개선</em>
                  </div>
                  <div>
                    <span>RETRIEVAL</span>
                    <strong>Vector Search</strong>
                    <em>빠르게 Candidate K개 추출</em>
                  </div>
                  <div>
                    <span>AFTER RETRIEVAL</span>
                    <strong>Reranking</strong>
                    <em>후보를 정밀 재순위화</em>
                  </div>
                </div>
              )}
              <ExecutablePipeline steps={displaySteps} stepStates={displayStates} density={ragType} />
            </>
          )}
        </div>
        <ExecutionTrace run={run} guide={copy.guide} />
      </div>
      <div className="stage-tabs" aria-label="RAG stage indicator">
        <span className={ragType === "naive" ? "active naive-accent" : ""}>Naive</span>
        <span className={ragType === "advanced" ? "active advanced-accent" : ""}>Advanced</span>
        <span className={ragType === "agentic" ? "active agentic-accent" : ""}>Agentic</span>
      </div>
    </section>
  );
}
