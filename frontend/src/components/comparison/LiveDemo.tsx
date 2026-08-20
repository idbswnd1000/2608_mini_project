import { useState } from "react";
import { RagResponse, RagType, runRagDemo } from "../../services/api";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

export function LiveDemo() {
  const [question, setQuestion] = useState("How can I track my order?");
  const [selectedRag, setSelectedRag] = useState<RagType>("naive");
  const [result, setResult] = useState<RagResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunDemo() {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await runRagDemo(selectedRag, question);
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="live-demo">
      <div className="live-form">
        <input value={question} onChange={(event) => setQuestion(event.target.value)} />
        <div className="segmented">
          {ragTypes.map((ragType) => (
            <button key={ragType} className={selectedRag === ragType ? "active" : ""} onClick={() => setSelectedRag(ragType)}>
              {ragType}
            </button>
          ))}
        </div>
        <button className="run-button" type="button" onClick={handleRunDemo} disabled={isRunning || !question.trim()}>
          {isRunning ? "실행 중" : "RUN DEMO"}
        </button>
      </div>

      {error && <div className="status-line error">Demo API 실패: {error}</div>}
      {result && (
        <div className="demo-result">
          <div>
            <span>Answer</span>
            <p>{result.answer}</p>
          </div>
          <div className="demo-metrics">
            <strong>{result.metrics.total_ms}ms</strong>
            <strong>{result.retrieved_chunks.length} chunks</strong>
            {result.metrics.total_tokens != null && <strong>{result.metrics.total_tokens} tokens</strong>}
            {result.search_rounds != null && <strong>{result.search_rounds} rounds</strong>}
          </div>
        </div>
      )}
    </div>
  );
}
