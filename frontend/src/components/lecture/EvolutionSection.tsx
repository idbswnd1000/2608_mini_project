import { RagStage } from "../../state/lectureState";
import { FlowNode, RagFlow } from "../rag/RagFlow";
import { RagNode } from "../rag/RagNode";

interface EvolutionSectionProps {
  ragStage: RagStage;
}

function getEvolutionNodes(stage: RagStage): FlowNode[] {
  if (stage === "advanced") {
    return [
      { id: "question", title: "Question" },
      { id: "rewrite", title: "Query Rewrite", description: "질문 재작성", highlight: true },
      { id: "embedding", title: "Embedding" },
      { id: "search", title: "Vector Search" },
      { id: "rerank", title: "Reranking", description: "후보 재정렬", highlight: true },
      { id: "context", title: "Top-K Context" },
      { id: "llm", title: "LLM" },
      { id: "answer", title: "Answer" }
    ];
  }

  if (stage === "agentic") {
    return [
      { id: "question", title: "Question" },
      { id: "decision", title: "Agent Decision", description: "검색 전략 판단", highlight: true },
      { id: "rewrite", title: "Query Rewrite" },
      { id: "embedding", title: "Embedding" },
      { id: "search", title: "Vector Search" },
      { id: "rerank", title: "Reranking" },
      { id: "context", title: "Top-K Context" }
    ];
  }

  return [
    { id: "question", title: "Question" },
    { id: "embedding", title: "Embedding" },
    { id: "search", title: "Vector Search" },
    { id: "context", title: "Top-K Context" },
    { id: "llm", title: "LLM" },
    { id: "answer", title: "Answer" }
  ];
}

export function EvolutionSection({ ragStage }: EvolutionSectionProps) {
  const stageLabel = ragStage === "basic" ? "NAIVE" : ragStage.toUpperCase();
  const isAgentic = ragStage === "agentic";

  return (
    <section className="lecture-section evolution-section">
      <div className="section-kicker">SECTION 2 - RAG EVOLUTION</div>
      <div className="stage-header">
        <h1>{stageLabel}</h1>
        <p>기본 검색 구조에 필요한 기능을 단계적으로 추가한다</p>
      </div>
      <RagFlow nodes={getEvolutionNodes(ragStage)} direction={isAgentic ? "vertical" : "horizontal"} />
      {isAgentic && (
        <div className="agentic-loop">
          <RagNode title="Context Evaluation" description="충분한가?" highlight />
          <div className="loop-branches">
            <div className="loop-yes">YES → LLM → Answer</div>
            <div className="loop-no">NO → Query Refinement → Retry Search ↺</div>
          </div>
        </div>
      )}
    </section>
  );
}
