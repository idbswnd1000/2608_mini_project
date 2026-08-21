import { EvaluationComparison } from "../comparison/EvaluationComparison";
import { ParallelComparisonDemo } from "../comparison/ParallelComparisonDemo";

export function ComparisonSection() {
  return (
    <section className="lecture-section comparison-section">
      <div className="section-kicker">COMPARISON</div>
      <div className="comparison-heading">
        <h1>더 복잡한 RAG가 항상 더 좋은가?</h1>
        <p>무엇을 측정하는지 먼저 정리한 뒤, 실제 결과로 품질 / 속도 / 비용의 trade-off를 확인합니다.</p>
      </div>
      <div className="comparison-stack">
        <ParallelComparisonDemo />
        <EvaluationComparison />
      </div>
      <p className="lecture-message comparison-takeaway">
        <span>KEY POINT</span>
        검색 품질뿐 아니라 시간과 비용도 함께 평가해야 한다.
      </p>
    </section>
  );
}
