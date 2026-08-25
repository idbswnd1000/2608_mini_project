import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RagResponse, RagType, runRagDemo } from "../services/api";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];
const DEFAULT_QUESTION =
  "주문한 상품의 배송이 예상보다 늦어지고 있어요. 현재 주문 상태를 확인하고, 주문을 취소할 수 있는지와 환불이 가능한 경우 환불 진행 상황은 어떻게 확인할 수 있나요?";
const MIN_ANSWER_FONT_SIZE = 18;
let inFlightAutoRun:
  | {
      question: string;
      promise: Promise<PromiseSettledResult<RagResponse>[]>;
    }
  | null = null;

const titles: Record<RagType, string> = {
  naive: "Naive RAG",
  advanced: "Advanced RAG",
  agentic: "Agentic RAG"
};

type ResultState = Partial<Record<RagType, RagResponse>>;
type ErrorState = Partial<Record<RagType, string>>;

export function RagComparisonPage() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [results, setResults] = useState<ResultState>({});
  const [errors, setErrors] = useState<ErrorState>({});
  const [isRunning, setIsRunning] = useState(false);
  const runIdRef = useRef(0);

  const runComparison = useCallback(async (targetQuestion: string, options?: { dedupeAutoRun?: boolean }) => {
    const trimmedQuestion = targetQuestion.trim();
    if (!trimmedQuestion) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setResults({});
    setErrors({});
    setIsRunning(true);

    const requestPromise = getComparisonPromise(trimmedQuestion, Boolean(options?.dedupeAutoRun));
    const settled = await requestPromise;
    if (runIdRef.current !== runId) return;

    const nextResults: ResultState = {};
    const nextErrors: ErrorState = {};

    settled.forEach((item, index) => {
      const type = ragTypes[index];
      if (item.status === "fulfilled") {
        nextResults[type] = item.value;
      } else {
        nextErrors[type] = item.reason instanceof Error ? item.reason.message : "Unknown error";
      }
    });

    setResults(nextResults);
    setErrors(nextErrors);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    void runComparison(DEFAULT_QUESTION, { dedupeAutoRun: true });
  }, [runComparison]);

  return (
    <section className="tool-page rag-compare-page">
      <div className="page-heading">
        <span>RAG 비교</span>
        <h1>동일 질문 답변 비교</h1>
      </div>

      <div className="rag-compare-workspace">
        <div className="rag-compare-input">
          <label>
            공통 질문
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <button className="run-button" type="button" onClick={() => runComparison(question)} disabled={isRunning || !question.trim()}>
            {isRunning ? "비교 실행 중" : "비교 실행"}
          </button>
        </div>

        <div className="rag-compare-grid">
          {ragTypes.map((type) => (
            <RagResultCard
              error={errors[type]}
              isRunning={isRunning}
              key={type}
              result={results[type]}
              type={type}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function getComparisonPromise(question: string, dedupeAutoRun: boolean) {
  if (dedupeAutoRun) {
    if (inFlightAutoRun?.question === question) {
      return inFlightAutoRun.promise;
    }

    const promise = requestComparison(question).finally(() => {
      if (inFlightAutoRun?.question === question) {
        inFlightAutoRun = null;
      }
    });
    inFlightAutoRun = { question, promise };
    return promise;
  }

  return requestComparison(question);
}

function requestComparison(question: string) {
  return Promise.allSettled(ragTypes.map((type) => runRagDemo(type, question)));
}

function RagResultCard({
  error,
  isRunning,
  result,
  type
}: {
  error?: string;
  isRunning: boolean;
  result?: RagResponse;
  type: RagType;
}) {
  const answerRef = useAutoFitAnswer(result?.answer);

  return (
    <article className={`rag-result-card ${type}`}>
      <header>
        <span>{type}</span>
        <h2>{titles[type]}</h2>
        {result && <time>{formatSeconds(result.metrics.total_ms)}</time>}
      </header>
      {error && <p className="status-line error">{error}</p>}
      {!result && !error && <p className="rag-answer-placeholder">{isRunning ? "답변 생성 중입니다." : "비교 실행 후 답변이 표시됩니다."}</p>}
      {result && (
        <p className="rag-answer-text" ref={answerRef.ref} style={answerRef.style}>
          {result.answer}
        </p>
      )}
    </article>
  );
}

function useAutoFitAnswer(answer?: string) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [allowScroll, setAllowScroll] = useState(false);

  const fit = useCallback(() => {
    const element = ref.current;
    if (!element || !answer) return;

    element.style.overflowY = "hidden";
    element.style.fontSize = "";
    const baseFontSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
    const maxFontSize = Number.isFinite(baseFontSize) ? Math.round(baseFontSize) : 25;

    let nextFontSize = maxFontSize;
    for (; nextFontSize >= MIN_ANSWER_FONT_SIZE; nextFontSize -= 1) {
      element.style.fontSize = `${nextFontSize}px`;
      if (element.scrollHeight <= element.clientHeight + 1) {
        break;
      }
    }

    const nextAllowScroll = nextFontSize < MIN_ANSWER_FONT_SIZE;
    if (nextAllowScroll) {
      nextFontSize = MIN_ANSWER_FONT_SIZE;
      element.style.fontSize = `${nextFontSize}px`;
    }
    setFontSize(nextFontSize);
    setAllowScroll(nextAllowScroll || element.scrollHeight > element.clientHeight + 1);
  }, [answer]);

  useLayoutEffect(() => {
    setFontSize(null);
    setAllowScroll(false);
    if (!answer) return;
    const frameId = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(frameId);
  }, [answer, fit]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !answer) return;

    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        fit();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [answer, fit]);

  const style: CSSProperties = {
    fontSize: fontSize ? `${fontSize}px` : undefined,
    overflowY: allowScroll ? "auto" : "hidden",
  };

  return { ref, style };
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}초`;
}
