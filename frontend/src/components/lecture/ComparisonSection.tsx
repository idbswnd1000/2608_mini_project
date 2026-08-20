import { EvaluationComparison } from "../comparison/EvaluationComparison";
import { LiveDemo } from "../comparison/LiveDemo";

export function ComparisonSection() {
  return (
    <section className="lecture-section comparison-section">
      <div className="section-kicker">SECTION 3 - LIVE / COMPARISON</div>
      <h1>같은 질문도 구조에 따라 검색 품질과 비용이 달라진다</h1>
      <LiveDemo />
      <EvaluationComparison />
    </section>
  );
}
