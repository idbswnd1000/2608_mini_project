export function MultimodalRagPage() {
  return (
    <section className="extension-page">
      <div className="page-heading">
        <span>확장 RAG</span>
        <h1>Multimodal RAG</h1>
        <p>텍스트뿐 아니라 이미지와 오디오 같은 입력을 함께 검색 대상으로 사용하는 RAG 확장 방식입니다.</p>
      </div>
      <div className="multimodal-diagram">
        <div>Question</div>
        <span>↓</span>
        <div className="modalities">
          <strong>Text</strong>
          <strong>Image</strong>
          <strong>Audio</strong>
        </div>
        <span>↓</span>
        <div>Retrieval</div>
        <span>↓</span>
        <div>LLM</div>
      </div>
    </section>
  );
}
