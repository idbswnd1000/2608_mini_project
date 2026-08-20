import { useEffect, useMemo, useState } from "react";
import {
  Difficulty,
  EvaluationSummary,
  RagType,
  SummaryMode,
  fetchEvaluationSummary
} from "../../services/api";
import { MetricBar } from "./MetricBar";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];
const difficulties: Difficulty[] = ["simple", "ambiguous", "complex", "overall"];

const difficultyLabels: Record<Difficulty, string> = {
  simple: "Simple",
  ambiguous: "Ambiguous",
  complex: "Complex",
  overall: "Overall"
};

export function EvaluationComparison() {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("overall");
  const [mode, setMode] = useState<SummaryMode>("retrieval_summary");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetchEvaluationSummary()
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setIsLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!summary) return null;
    return summary[mode][difficulty];
  }, [difficulty, mode, summary]);

  return (
    <div className="comparison-panel">
      <div className="panel-toolbar">
        <div className="segmented">
          <button className={mode === "retrieval_summary" ? "active" : ""} onClick={() => setMode("retrieval_summary")}>
            Retrieval
          </button>
          <button className={mode === "full_rag_summary" ? "active" : ""} onClick={() => setMode("full_rag_summary")}>
            Full RAG
          </button>
        </div>
        <div className="segmented">
          {difficulties.map((item) => (
            <button key={item} className={difficulty === item ? "active" : ""} onClick={() => setDifficulty(item)}>
              {difficultyLabels[item]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="status-line">evaluation summary 불러오는 중</div>}
      {error && <div className="status-line error">API 연결 실패: {error}</div>}

      {rows && (
        <div className="rag-score-grid">
          {ragTypes.map((ragType) => {
            const row = rows[ragType];
            return (
              <article className="score-card" key={ragType}>
                <div className="score-card-head">
                  <h3>{ragType.toUpperCase()}</h3>
                  <span>{row.question_count} questions</span>
                </div>
                <MetricBar label="Hit@K" value={row.avg_hit_at_k} />
                <MetricBar label="Precision@K" value={row.avg_precision_at_k} />
                <MetricBar label="MRR" value={row.avg_mrr} />
                <MetricBar label="Coverage@K" value={row.avg_intent_coverage_at_k} />
                <MetricBar label="Total time" value={row.avg_total_ms} max={60000} suffix="ms" />
                <MetricBar label="Tokens" value={row.avg_total_tokens} max={5000} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
