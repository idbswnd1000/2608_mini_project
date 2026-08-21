export function MultimodalRagPage() {
  return (
    <section className="extension-page multimodal-page">
      <div className="page-heading">
        <span>MULTIMODAL RAG</span>
        <h1>검색해야 할 정보가 텍스트가 아니라면?</h1>
        <p>지금까지의 Text Retrieval을 이미지, 표, 문서 등 다양한 형태의 Context 검색으로 확장합니다.</p>
      </div>

      <div className="extension-teaching-layout">
        <div className="extension-contrast">
          <div>
            <span>지금까지의 RAG</span>
            <strong>Question → Text Retrieval → Text Context</strong>
          </div>
          <b>→</b>
          <div>
            <span>Multimodal RAG</span>
            <strong>Question → Multimodal Retrieval → Mixed Context</strong>
          </div>
        </div>

        <div className="multimodal-diagram" aria-label="Multimodal RAG flow">
          <div>Question</div>
          <span>↓</span>
          <div>Multimodal Retrieval</div>
          <span>↓</span>
          <div className="modalities">
            <strong>Text</strong>
            <strong>Image</strong>
            <strong>Table</strong>
            <strong>Document</strong>
          </div>
          <span>↓</span>
          <div>Multimodal Model / LLM</div>
          <span>↓</span>
          <div>Answer</div>
        </div>
      </div>

      <p className="lecture-message">
        <span>KEY POINT</span>
        RAG의 검색 대상은 텍스트를 넘어 다양한 데이터로 확장될 수 있다.
      </p>
    </section>
  );
}
