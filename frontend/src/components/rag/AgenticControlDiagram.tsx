import { PipelineStatus, StepState } from "../../hooks/usePresentationRun";

interface AgenticControlDiagramProps {
  stepStates: Record<string, StepState>;
  round: number;
  retry: number;
}

const statusLabel: Record<PipelineStatus, string> = {
  idle: "",
  running: "RUN",
  completed: "DONE",
  failed: "!",
  retry: "RETRY",
  insufficient: "NO"
};

function mergeStatus(ids: string[], stepStates: Record<string, StepState>): PipelineStatus {
  const statuses = ids.map((id) => stepStates[id]?.status).filter(Boolean) as PipelineStatus[];
  if (statuses.includes("running")) return "running";
  if (statuses.includes("retry")) return "retry";
  if (statuses.includes("insufficient")) return "insufficient";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("completed")) return "completed";
  return "idle";
}

function AgenticNode({
  ids,
  title,
  detail,
  variant = "base",
  stepStates
}: {
  ids: string[];
  title: string;
  detail: string;
  variant?: "base" | "advanced" | "agentic";
  stepStates: Record<string, StepState>;
}) {
  const status = mergeStatus(ids, stepStates);
  return (
    <div className={`agentic-map-node ${status} ${variant}-node`}>
      <strong>
        {title}
        {statusLabel[status] && <span>{statusLabel[status]}</span>}
      </strong>
      <p>{detail}</p>
    </div>
  );
}

export function AgenticControlDiagram({ stepStates, round, retry }: AgenticControlDiagramProps) {
  return (
    <div className="agentic-control-map" aria-label="Agentic RAG control flow">
      <div className="agentic-map-meta">
        <span>Current Round</span>
        <strong>{round || "-"}</strong>
        <span>Retry Count</span>
        <strong>{retry}</strong>
      </div>

      <div className="agentic-start-row">
        <AgenticNode ids={["question_received"]} title="Question" detail="사용자가 입력한 질문" stepStates={stepStates} />
        <div className="map-arrow">→</div>
        <AgenticNode
          ids={["agent_decision"]}
          title="Agent Decision"
          detail="검색이 필요한지 판단"
          variant="agentic"
          stepStates={stepStates}
        />
      </div>

      <div className="agentic-loop-zone">
        <div className="agentic-search-row">
          <AgenticNode ids={["vector_search", "retry_search"]} title="Search" detail="관련 정보를 검색" stepStates={stepStates} />
          <div className="map-arrow">→</div>
          <AgenticNode
            ids={["reranking"]}
            title="Reranking"
            detail="검색 결과를 관련도 순으로 정렬"
            variant="advanced"
            stepStates={stepStates}
          />
        </div>
        <AgenticNode
          ids={["context_evaluation"]}
          title="Context Evaluation"
          detail="찾은 정보가 충분한가?"
          variant="agentic"
          stepStates={stepStates}
        />
        <div className="agentic-branch-grid">
          <div className="branch-path yes">
            <b>YES</b>
            <span>LLM → Answer</span>
          </div>
          <div className="branch-path no">
            <b>NO</b>
            <span>Query Refinement → Retry Search ↺</span>
          </div>
        </div>
        <div className="agentic-refine-row">
          <AgenticNode
            ids={["query_refinement"]}
            title="Query Refinement"
            detail="부족하면 검색 질문을 개선"
            variant="agentic"
            stepStates={stepStates}
          />
          <div className="retry-back-label">Retry Search<br />개선한 질문으로 다시 검색 ↺</div>
        </div>
      </div>

      <div className="agentic-answer-row">
        <AgenticNode ids={["context_build"]} title="Context" detail="답변에 사용할 정보를 구성" stepStates={stepStates} />
        <AgenticNode ids={["llm_generation"]} title="LLM / Answer" detail="검색한 정보를 이용해 답변 생성" stepStates={stepStates} />
      </div>
    </div>
  );
}
