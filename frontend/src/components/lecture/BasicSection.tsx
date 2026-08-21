const indexingSteps = [
  { title: "Documents", role: "외부 지식 원본" },
  { title: "Chunking", role: "긴 문서를 작은 검색 단위로 분할" },
  { title: "Embedding", role: "문장의 의미를 벡터로 표현" },
  { title: "Vector DB", role: "벡터 저장과 유사도 검색" }
];

const runtimeSteps = [
  { title: "Question", role: "사용자 질문" },
  { title: "Retrieval", role: "관련 정보 검색" },
  { title: "Context", role: "LLM에 전달할 근거" },
  { title: "LLM", role: "질문과 근거를 함께 읽음" },
  { title: "Answer", role: "근거 기반 답변 생성" }
];

function MiniFlow({ title, subtitle, steps }: { title: string; subtitle: string; steps: typeof indexingSteps }) {
  return (
    <section className="basic-flow-group">
      <header>
        <span>{title}</span>
        <strong>{subtitle}</strong>
      </header>
      <div className="basic-flow-line">
        {steps.map((step, index) => (
          <div className="basic-flow-item" key={step.title}>
            <div className="knowledge-node">
              <strong>{step.title}</strong>
              <span>{step.role}</span>
            </div>
            {index < steps.length - 1 && <div className="knowledge-arrow">→</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function BasicSection() {
  return (
    <section className="lecture-section basic-lecture">
      <div className="section-kicker">RAG 기본</div>
      <div className="basic-lecture-heading">
        <span>RAG BASIC</span>
        <h1>왜 LLM에게 검색이 필요할까?</h1>
        <p>LLM 내부 지식만으로 부족할 때, 외부 지식을 검색해 Context로 제공합니다.</p>
      </div>

      <div className="basic-teaching-canvas" aria-label="RAG basic flow">
        <div className="basic-principle-strip">
          <div>
            <span>WHY</span>
            <strong>LLM 내부 지식만으로는 최신/개별 정보를 모를 수 있음</strong>
          </div>
          <b>→</b>
          <div>
            <span>PRINCIPLE</span>
            <strong>외부 정보를 검색해 Retrieved Context로 제공</strong>
          </div>
        </div>
        <MiniFlow title="INDEXING" subtitle="검색 전에 미리 준비" steps={indexingSteps} />
        <div className="chunking-example" aria-label="Chunking concept example">
          <span>CHUNKING</span>
          <strong>긴 Document</strong>
          <b>↓</b>
          <div>
            <em>Chunk 1</em>
            <em>Chunk 2</em>
            <em>Chunk 3</em>
          </div>
        </div>
        <MiniFlow title="RETRIEVAL + GENERATION" subtitle="질문이 들어온 뒤 실행" steps={runtimeSteps} />
      </div>

      <p className="lecture-message">
        <span>KEY POINT</span>
        외부 지식을 검색해 LLM의 Context로 사용한다.
      </p>
    </section>
  );
}
