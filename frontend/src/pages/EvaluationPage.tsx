import { useEffect, useMemo, useState } from "react";
import { Difficulty, EvaluationSummary, RagType, fetchEvaluationSummary } from "../services/api";

const difficulties: Difficulty[] = ["overall", "simple", "ambiguous", "complex"];
const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

export function EvaluationPage() {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("overall");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvaluationSummary()
      .then((data) => {
        setSummary(data);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const rows = useMemo(() => summary?.retrieval_summary[difficulty] ?? null, [difficulty, summary]);

  return (
    <section className="tool-page">
      <div className="page-heading">
        <span>평가</span>
        <h1>성능 비교</h1>
        <p>저장된 evaluation 결과만 조회합니다. 새 평가 실행은 하지 않습니다.</p>
      </div>

      <div className="segmented evaluation-tabs">
        {difficulties.map((item) => (
          <button className={difficulty === item ? "active" : ""} key={item} type="button" onClick={() => setDifficulty(item)}>
            {item}
          </button>
        ))}
      </div>

      {error && <p className="status-line error">{error}</p>}
      {rows && (
        <div className="detail-evaluation-grid">
          {ragTypes.map((ragType) => {
            const row = rows[ragType];
            return (
              <article key={ragType}>
                <h2>{ragType.toUpperCase()}</h2>
                <dl>
                  <div><dt>Questions</dt><dd>{row.question_count}</dd></div>
                  <div><dt>Hit@K</dt><dd>{format(row.avg_hit_at_k)}</dd></div>
                  <div><dt>Precision</dt><dd>{format(row.avg_precision_at_k)}</dd></div>
                  <div><dt>MRR</dt><dd>{format(row.avg_mrr)}</dd></div>
                  <div><dt>Coverage</dt><dd>{format(row.avg_intent_coverage_at_k)}</dd></div>
                  <div><dt>Time</dt><dd>{row.avg_total_ms === null ? "-" : `${Math.round(row.avg_total_ms)}ms`}</dd></div>
                  <div><dt>Tokens</dt><dd>{row.avg_total_tokens === null ? "-" : Math.round(row.avg_total_tokens)}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function format(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}
