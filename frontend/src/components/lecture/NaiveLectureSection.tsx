import { PipelineStep, StepState, usePresentationRun } from "../../hooks/usePresentationRun";
import { ExecutablePipeline } from "../rag/ExecutablePipeline";
import { ExecutionTrace, TeachingGuide } from "../rag/ExecutionTrace";

const naiveGuide: TeachingGuide = {
  why: "LLM이 답변하기 전에 질문과 관련된 외부 근거를 찾아야 합니다.",
  principle: "질문과 문서를 같은 벡터 공간에 놓고, 의미적으로 가까운 문서를 검색합니다.",
  keyPoint: "질문과 문서를 벡터 공간에서 비교해 관련 정보를 찾는다.",
  concepts: [
    {
      label: "EMBEDDING",
      title: "의미를 숫자 벡터로 표현",
      description: "예: 배송 조회와 주문 위치 확인은 벡터 공간에서도 가깝게 표현됩니다."
    },
    {
      label: "VECTOR SEARCH",
      title: "질문 벡터와 문서 벡터 비교",
      description: "키워드가 달라도 의미가 가까운 정보를 찾을 수 있습니다."
    },
    {
      label: "TOP-K",
      title: "상위 K개를 Context 후보로 선택",
      description: "검색 결과 #1, #2, #3처럼 높은 순위의 근거를 LLM에 전달합니다."
    }
  ],
  bridge: "LIMITATION · Poor Retrieval → Poor Context → Poor Answer. 그렇다면 검색 품질 자체를 개선할 수 없을까?"
};

function withAnswerStep(steps: PipelineStep[], status: ReturnType<typeof usePresentationRun>["status"]) {
  const answerStep = { id: "answer", label: "Answer", detail: "최종 답변" };
  const displaySteps = steps.some((step) => step.id === "answer") ? steps : [...steps, answerStep];
  const answerState: StepState = { status: status === "complete" ? "completed" : "idle" };
  return { displaySteps, answerState };
}

export function NaiveLectureSection() {
  const run = usePresentationRun("naive", true);
  const { displaySteps, answerState } = withAnswerStep(run.steps, run.status);
  const displayStates = { ...run.stepStates, answer: answerState };

  return (
    <section className="lecture-section evolution-section naive-lecture">
      <header className="evolution-header lecture-page-header">
        <div className="section-kicker">NAIVE RAG</div>
        <h1>가장 기본적인 RAG는 어떻게 검색할까?</h1>
        <p>검색한 결과를 바로 Context로 사용합니다.</p>
      </header>

      <div className="evolution-layout">
        <div className="structure-panel">
          <div className="panel-label">RAG STRUCTURE</div>
          <div className="principle-map naive-principle-map" aria-label="Naive RAG principle">
            <div className="principle-source">INDEXED DOCUMENTS<br /><span>미리 embedding된 문서</span></div>
            <div className="principle-relation">
              <strong>Question → Embedding</strong>
              <span>Question Vector ↔ Document Vectors</span>
              <em>Similarity → Top-K Context</em>
            </div>
          </div>
          <ExecutablePipeline steps={displaySteps} stepStates={displayStates} density="naive" />
        </div>
        <ExecutionTrace run={run} guide={naiveGuide} />
      </div>

      <div className="stage-tabs" aria-label="RAG stage indicator">
        <span className="active naive-accent">Naive</span>
        <span>Advanced</span>
        <span>Agentic</span>
      </div>
    </section>
  );
}
