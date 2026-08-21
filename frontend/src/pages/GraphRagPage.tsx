export function GraphRagPage() {
  return (
    <section className="extension-page agentic-multimodal-page">
      <div className="page-heading">
        <span>AGENTIC + MULTIMODAL / 확장 방향</span>
        <h1>판단 능력과 다양한 데이터 검색을 결합하면?</h1>
        <p>Agentic은 무엇을 해야 하는지 판단하고, Multimodal은 다양한 형태의 정보를 검색합니다. 이 페이지는 구현 완료 기능이 아니라 확장 방향입니다.</p>
      </div>

      <div className="fusion-principle">
        <div>
          <span>Agentic</span>
          <strong>무엇을 해야 하는지 판단</strong>
        </div>
        <b>+</b>
        <div>
          <span>Multimodal</span>
          <strong>다양한 형태의 정보를 검색</strong>
        </div>
        <b>↓</b>
        <div>
          <span>Extension</span>
          <strong>필요한 정보 유형을 판단하고 활용</strong>
        </div>
      </div>

      <div className="agentic-multimodal-diagram" aria-label="Agentic multimodal extension flow">
        <div>Question</div>
        <span>↓</span>
        <div className="agent-node">Agent</div>
        <small>필요한 정보 유형 판단</small>
        <div className="modalities">
          <strong>Text</strong>
          <strong>Image</strong>
          <strong>Table</strong>
          <strong>Document</strong>
        </div>
        <span>↓</span>
        <div>Context Evaluation</div>
        <div className="extension-branches">
          <strong>충분 → Answer</strong>
          <strong>부족 → 추가 탐색 / 재검색</strong>
        </div>
      </div>

      <p className="lecture-message">
        <span>KEY POINT</span>
        판단 능력과 다양한 데이터 검색을 결합할 수 있다.
      </p>
    </section>
  );
}
