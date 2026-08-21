const ragFeatures = [
  {
    type: "naive",
    title: "NAIVE",
    core: "Semantic Retrieval",
    additions: "없음",
    feature: "검색 결과를 바로 Context로 사용",
    tradeoff: "단순 / 빠름 · 초기 검색 품질 의존"
  },
  {
    type: "advanced",
    title: "ADVANCED",
    core: "Retrieval Quality Improvement",
    additions: "Query Rewrite / Reranking",
    feature: "검색 전 + 검색 후 개선",
    tradeoff: "검색 품질 향상 가능 / 처리 증가"
  },
  {
    type: "agentic",
    title: "AGENTIC",
    core: "Decision + Iterative Retrieval",
    additions: "Evaluation / Refinement / Retry",
    feature: "결과를 판단하고 필요하면 재검색",
    tradeoff: "유연함 · 시간 / 토큰 / 복잡성 증가 가능"
  }
];

export function ParallelComparisonDemo() {
  return (
    <div className="feature-comparison">
      {ragFeatures.map((rag) => (
        <article className={`feature-card ${rag.type}-accent`} key={rag.type}>
          <header>
            <h3>{rag.title}</h3>
            <strong>{rag.core}</strong>
          </header>
          <dl>
            <div>
              <dt>핵심 원리</dt>
              <dd>{rag.core}</dd>
            </div>
            <div>
              <dt>추가 처리</dt>
              <dd>{rag.additions}</dd>
            </div>
            <div>
              <dt>특징</dt>
              <dd>{rag.feature}</dd>
            </div>
            <div>
              <dt>Trade-off</dt>
              <dd>{rag.tradeoff}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
