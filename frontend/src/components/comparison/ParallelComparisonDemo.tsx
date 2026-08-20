import { useRagRun } from "../../hooks/useRagRun";
import { RagType } from "../../services/api";
import { ExecutablePipeline } from "../rag/ExecutablePipeline";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

function RunSummary({ ragType }: { ragType: RagType }) {
  const run = useRagRun(ragType, true);
  const result = run.result;

  return (
    <article className={`parallel-run-card ${ragType}-accent`}>
      <div className="parallel-head">
        <h3>{ragType.toUpperCase()}</h3>
        <span>{run.status}</span>
      </div>
      <ExecutablePipeline steps={run.steps} activeStepIndex={run.activeStepIndex} />
      <div className="parallel-metrics">
        <strong>{result ? `${result.metrics.total_ms}ms` : "-"}</strong>
        <span>{result ? `${result.retrieved_chunks.length} chunks` : "running"}</span>
        {ragType === "agentic" && <span>Round {result?.search_rounds ?? result?.metrics.search_rounds ?? "-"}</span>}
      </div>
      {run.error && <div className="status-line error">{run.error}</div>}
    </article>
  );
}

export function ParallelComparisonDemo() {
  return (
    <div className="parallel-comparison">
      <div className="panel-label">SAME QUESTION / PARALLEL RUN</div>
      <div className="parallel-grid">
        {ragTypes.map((ragType) => (
          <RunSummary ragType={ragType} key={ragType} />
        ))}
      </div>
    </div>
  );
}
