import { RagFlow } from "../rag/RagFlow";

const basicNodes = [
  { id: "question", title: "Question", description: "사용자 질문" },
  { id: "retrieval", title: "Retrieval", description: "관련 정보 검색" },
  { id: "llm", title: "LLM", description: "검색 정보를 이용한 답변 생성" },
  { id: "answer", title: "Answer", description: "최종 답변" }
];

export function BasicSection() {
  return (
    <section className="lecture-section basic-section">
      <div className="section-kicker">SECTION 1 - BASIC RAG</div>
      <h1>질문에 필요한 지식을 먼저 찾고, 그 지식으로 답한다</h1>
      <RagFlow nodes={basicNodes} />
    </section>
  );
}
