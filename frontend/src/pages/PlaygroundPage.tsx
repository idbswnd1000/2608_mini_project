import { useState } from "react";
import { RagResponse, RagType, runRagDemo } from "../services/api";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

export function PlaygroundPage() {
  const [question, setQuestion] = useState("My order still has not arrived. Can I cancel it, and can I get a refund?");
  const [ragType, setRagType] = useState<RagType>("naive");
  const [result, setResult] = useState<RagResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setIsRunning(true);
    setResult(null);
    setError(null);
    try {
      setResult(await runRagDemo(ragType, question));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="tool-page">
      <div className="page-heading">
        <span>실습</span>
        <h1>RAG Playground</h1>
        <p>질문을 입력하고 원하는 RAG 구조를 선택해 기존 API로 직접 실행합니다.</p>
      </div>

      <div className="playground-grid">
        <div className="playground-form">
          <label>
            질문
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <div className="segmented">
            {ragTypes.map((type) => (
              <button className={ragType === type ? "active" : ""} key={type} type="button" onClick={() => setRagType(type)}>
                {type}
              </button>
            ))}
          </div>
          <button className="run-button" type="button" onClick={run} disabled={isRunning || !question.trim()}>
            {isRunning ? "실행 중" : "실행"}
          </button>
        </div>

        <div className="playground-result">
          <h2>Result</h2>
          {error && <p className="status-line error">{error}</p>}
          {!result && !error && <p className="status-line">사용자가 실행할 때만 RAG API를 호출합니다.</p>}
          {result && (
            <>
              <dl>
                <div>
                  <dt>Actual Time</dt>
                  <dd>{result.metrics.total_ms}ms</dd>
                </div>
                <div>
                  <dt>Chunks</dt>
                  <dd>{result.retrieved_chunks.length}</dd>
                </div>
                {result.search_rounds && (
                  <div>
                    <dt>Rounds</dt>
                    <dd>{result.search_rounds}</dd>
                  </div>
                )}
              </dl>
              <p>{result.answer}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
