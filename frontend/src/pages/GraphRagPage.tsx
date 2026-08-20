import { RagFlow } from "../components/rag/RagFlow";

const graphNodes = [
  { id: "question", title: "Question" },
  { id: "entity", title: "Entity / Relation" },
  { id: "graph", title: "Knowledge Graph" },
  { id: "retrieval", title: "Retrieval" },
  { id: "llm", title: "LLM" }
];

export function GraphRagPage() {
  return (
    <section className="extension-page">
      <div className="page-heading">
        <span>확장 RAG</span>
        <h1>GraphRAG</h1>
        <p>문서 간 관계를 그래프로 구성하고 관계 정보를 검색에 활용하는 RAG 확장 방식입니다.</p>
      </div>
      <RagFlow nodes={graphNodes} />
    </section>
  );
}
