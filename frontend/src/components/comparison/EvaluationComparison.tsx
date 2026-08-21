import { useEffect, useMemo, useState } from "react";
import { EvaluationSummary, RagType, SummaryRow, fetchEvaluationSummary } from "../../services/api";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

interface MetricRow {
  key: keyof SummaryRow;
  label: string;
  description: string;
  group: "quality" | "efficiency";
  format: (value: number | null) => string;
  highlight?: "higher" | "lower";
}

const metrics: MetricRow[] = [
  { key: "avg_hit_at_k", label: "Hit@K", description: "정답 문서를 찾았는가", group: "quality", format: formatRatio, highlight: "higher" },
  { key: "avg_precision_at_k", label: "Precision@K", description: "검색 결과가 얼마나 정확한가", group: "quality", format: formatRatio, highlight: "higher" },
  { key: "avg_mrr", label: "MRR", description: "정답이 얼마나 앞에 나왔는가", group: "quality", format: formatRatio, highlight: "higher" },
  {
    key: "avg_intent_coverage_at_k",
    label: "Coverage@K",
    description: "필요한 정보를 얼마나 찾았는가",
    group: "quality",
    format: formatRatio,
    highlight: "higher"
  },
  { key: "avg_total_ms", label: "Time", description: "처리에 걸린 시간", group: "efficiency", format: formatMs, highlight: "lower" },
  { key: "avg_total_tokens", label: "Tokens", description: "사용한 LLM 토큰 수", group: "efficiency", format: formatNumber }
];

const metricGroups = [
  { id: "quality", title: "검색 품질" },
  { id: "efficiency", title: "효율성" }
] as const;

function formatRatio(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function formatMs(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}ms`;
}

function formatNumber(value: number | null) {
  return value === null ? "-" : String(Math.round(value));
}

function getHighlightedRag(rows: Record<RagType, SummaryRow>, metric: MetricRow) {
  if (!metric.highlight) return null;
  const values = ragTypes
    .map((ragType) => ({ ragType, value: rows[ragType][metric.key] as number | null }))
    .filter((item): item is { ragType: RagType; value: number } => item.value !== null);
  if (!values.length) return null;

  const target =
    metric.highlight === "higher"
      ? Math.max(...values.map((item) => item.value))
      : Math.min(...values.map((item) => item.value));
  return values.find((item) => item.value === target)?.ragType ?? null;
}

export function EvaluationComparison() {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
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

  const rows = useMemo(() => summary?.retrieval_summary.overall ?? null, [summary]);
  const questionCount = rows?.naive.question_count ?? rows?.advanced.question_count ?? rows?.agentic.question_count ?? null;

  return (
    <div className="comparison-panel evaluation-table-panel">
      <div className="evaluation-title">
        <span>검색이 실제로 좋아졌다는 것을 어떻게 측정할까?</span>
        <strong>전체 {questionCount ?? "-"}문제</strong>
      </div>

      {isLoading && <div className="status-line">evaluation summary 불러오는 중</div>}
      {error && <div className="status-line error">API 연결 실패: {error}</div>}

      {rows && (
        <>
          <div className="evaluation-principle">
            <div>
              <span>먼저 측정할 것</span>
              <strong>검색 품질</strong>
              <em>필요한 근거를 찾았는가?</em>
            </div>
            <div>
              <span>함께 볼 것</span>
              <strong>효율성</strong>
              <em>시간과 토큰 비용은 어떤가?</em>
            </div>
          </div>
          <div className="evaluation-groups" aria-label="Overall evaluation comparison">
            {metricGroups.map((group) => (
              <section className="metric-group" key={group.id}>
                <h3>{group.title}</h3>
                <div className="evaluation-table compact" role="table">
                  <div className="evaluation-row evaluation-head" role="row">
                    <span>Metric</span>
                    {ragTypes.map((ragType) => (
                      <strong key={ragType}>{ragType.toUpperCase()}</strong>
                    ))}
                  </div>
                  {metrics
                    .filter((metric) => metric.group === group.id)
                    .map((metric) => {
                      const highlighted = getHighlightedRag(rows, metric);
                      return (
                        <div className="evaluation-row" role="row" key={metric.key}>
                          <span className="metric-name">
                            <strong>{metric.label}</strong>
                            <em>{metric.description}</em>
                          </span>
                          {ragTypes.map((ragType) => (
                            <strong className={highlighted === ragType ? "metric-highlight" : ""} key={ragType}>
                              {metric.format(rows[ragType][metric.key] as number | null)}
                            </strong>
                          ))}
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
