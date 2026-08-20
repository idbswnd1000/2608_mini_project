import { RagFlow } from "../rag/RagFlow";

const graphNodes = [
  { id: "question", title: "Question" },
  { id: "entity", title: "Entity / Relation" },
  { id: "graph", title: "Graph" },
  { id: "retrieval", title: "Retrieval" },
  { id: "llm", title: "LLM" }
];

const multimodalNodes = [
  { id: "question", title: "Question" },
  { id: "media", title: "Text / Image / Audio" },
  { id: "retrieval", title: "Retrieval" },
  { id: "llm", title: "LLM" }
];

export function ConclusionSection() {
  return (
    <section className="lecture-section conclusion-section">
      <div className="section-kicker">SECTION 4 - CONCLUSION / EXTENSION</div>
      <h1>더 복잡한 RAG가 항상 최적인 것은 아니다</h1>
      <div className="summary-grid">
        <article>
          <h3>Naive</h3>
          <p>단순한 구조, 빠른 처리, 낮은 복잡도</p>
        </article>
        <article>
          <h3>Advanced</h3>
          <p>Query Rewrite와 Reranking으로 검색 품질 개선</p>
        </article>
        <article>
          <h3>Agentic</h3>
          <p>Agent 판단, Context 평가, 필요 시 재검색. 유연하지만 비용과 시간이 늘 수 있다</p>
        </article>
      </div>
      <div className="extension-grid">
        <article>
          <h3>GraphRAG</h3>
          <RagFlow nodes={graphNodes} />
        </article>
        <article>
          <h3>Multimodal RAG</h3>
          <RagFlow nodes={multimodalNodes} />
        </article>
      </div>
    </section>
  );
}
