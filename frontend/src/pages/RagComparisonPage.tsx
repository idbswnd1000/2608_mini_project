import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { answerFontSizeHint, cleanCustomerAnswer } from "../services/answerFormatting";
import { RagResponse, RagType, runRagDemo } from "../services/api";

const ragTypes: RagType[] = ["naive", "advanced", "agentic"];

const DEFAULT_QUESTION =
  "주문한 상품의 배송이 예상보다 늦어지고 있어요. 현재 주문 상태를 확인하고, 주문을 취소할 수 있는지와 환불이 가능한 경우 환불 진행 상황은 어떻게 확인할 수 있나요?";

const MIN_ANSWER_FONT_SIZE = 18;

const titles: Record<RagType, string> = {
  naive: "Naive RAG",
  advanced: "Advanced RAG",
  agentic: "Agentic RAG",
};

type ResultState = Partial<Record<RagType, RagResponse>>;
type ErrorState = Partial<Record<RagType, string>>;
type LoadingState = Partial<Record<RagType, boolean>>;

export function RagComparisonPage() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);

  const [results, setResults] = useState<ResultState>({});
  const [errors, setErrors] = useState<ErrorState>({});

  const [loading, setLoading] = useState<LoadingState>({
    naive: false,
    advanced: false,
    agentic: false,
  });

  const [isRunning, setIsRunning] = useState(false);

  const runIdRef = useRef(0);
  const autoRunRef = useRef(false);

  const runComparison = useCallback(async (targetQuestion: string) => {
    const trimmedQuestion = targetQuestion.trim();

    if (!trimmedQuestion) {
      return;
    }

    /*
      실행 ID 증가

      새로운 비교 실행이 시작됐을 때
      이전 요청 결과가 늦게 도착하더라도
      현재 화면을 덮어쓰지 못하도록 방지한다.
    */
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    /*
      이전 결과 초기화
    */
    setResults({});
    setErrors({});

    /*
      세 RAG 모두 실행 중 상태
    */
    setLoading({
      naive: true,
      advanced: true,
      agentic: true,
    });

    setIsRunning(true);

    /*
      여기서 중요한 부분

      map을 돌면서 runRagDemo를 각각 실행하므로
      Naive / Advanced / Agentic 요청이 거의 동시에 시작된다.

      각 요청은 자기 자신이 완료되는 순간
      setResults를 실행한다.

      따라서 Agentic이 끝날 때까지
      Naive와 Advanced가 기다리지 않는다.
    */
    const tasks = ragTypes.map(async (type) => {
      try {
        const result = await runRagDemo(type, trimmedQuestion);

        /*
          새로운 실행이 이미 시작된 경우
          이전 실행 결과는 무시
        */
        if (runIdRef.current !== runId) {
          return;
        }

        /*
          해당 RAG 결과만 즉시 추가

          기존 결과를 유지하면서
          완료된 type의 결과만 업데이트한다.
        */
        setResults((prev) => ({
          ...prev,
          [type]: result,
        }));

        /*
          해당 카드 로딩 종료
        */
        setLoading((prev) => ({
          ...prev,
          [type]: false,
        }));
      } catch (error) {
        if (runIdRef.current !== runId) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";

        /*
          해당 RAG만 오류 표시
        */
        setErrors((prev) => ({
          ...prev,
          [type]: message,
        }));

        /*
          오류가 발생해도 해당 카드의 로딩은 종료
        */
        setLoading((prev) => ({
          ...prev,
          [type]: false,
        }));
      }
    });

    /*
      세 작업 자체는 동시에 진행되고 있다.

      여기의 await는
      모든 결과를 한 번에 화면에 표시하기 위한 것이 아니라
      "전체 비교 실행이 끝났는지"만 확인하기 위해 사용한다.

      결과 화면 업데이트는 위의 각 task 내부에서 이미 이루어진다.
    */
    await Promise.allSettled(tasks);

    /*
      실행 도중 새로운 비교가 시작되지 않았다면
      전체 실행 상태 종료
    */
    if (runIdRef.current === runId) {
      setIsRunning(false);
    }
  }, []);

  /*
    페이지 최초 진입 시
    기본 질문으로 자동 비교 실행

    React StrictMode에서 useEffect가 개발 환경에서
    두 번 호출될 수 있기 때문에 autoRunRef로 방지한다.
  */
  useEffect(() => {
    if (autoRunRef.current) {
      return;
    }

    autoRunRef.current = true;

    void runComparison(DEFAULT_QUESTION);
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

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>

          <button
            className="run-button"
            type="button"
            onClick={() => void runComparison(question)}
            disabled={isRunning || !question.trim()}
          >
            {isRunning ? "비교 실행 중" : "비교 실행"}
          </button>
        </div>

        <div className="rag-compare-grid">
          {ragTypes.map((type) => (
            <RagResultCard
              key={type}
              type={type}
              result={results[type]}
              error={errors[type]}
              isLoading={Boolean(loading[type])}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RagResultCard({
  error,
  isLoading,
  result,
  type,
}: {
  error?: string;
  isLoading: boolean;
  result?: RagResponse;
  type: RagType;
}) {
  const answer = cleanCustomerAnswer(result?.answer);
  const answerRef = useAutoFitAnswer(answer);

  return (
    <article className={`rag-result-card ${type}`}>
      <header>
        <span>{type}</span>

        <h2>{titles[type]}</h2>

        {result && (
          <time>
            {formatSeconds(result.metrics.total_ms)}
          </time>
        )}
      </header>

      {error && (
        <p className="status-line error">
          {error}
        </p>
      )}

      {!result && !error && (
        <p className="rag-answer-placeholder">
          {isLoading
            ? "답변 생성 중입니다."
            : "비교 실행 후 답변이 표시됩니다."}
        </p>
      )}

      {result && answer && (
        <p
          className="rag-answer-text"
          ref={answerRef.ref}
          style={answerRef.style}
        >
          {answer}
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

    if (!element || !answer) {
      return;
    }

    element.style.overflowY = "hidden";
    element.style.fontSize = `${answerFontSizeHint(answer)}px`;

    const computedStyle = window.getComputedStyle(element);

    const baseFontSize = Number.parseFloat(
      computedStyle.fontSize,
    );

    const maxFontSize = Number.isFinite(baseFontSize)
      ? Math.round(baseFontSize)
      : 25;

    let nextFontSize = maxFontSize;

    /*
      카드 높이에 답변이 들어올 때까지
      글자 크기를 1px씩 줄인다.
    */
    for (
      ;
      nextFontSize >= MIN_ANSWER_FONT_SIZE;
      nextFontSize -= 1
    ) {
      element.style.fontSize = `${nextFontSize}px`;

      if (
        element.scrollHeight <=
        element.clientHeight + 1
      ) {
        break;
      }
    }

    /*
      최소 글자 크기로도 들어가지 않으면
      스크롤 허용
    */
    const nextAllowScroll =
      nextFontSize < MIN_ANSWER_FONT_SIZE;

    if (nextAllowScroll) {
      nextFontSize = MIN_ANSWER_FONT_SIZE;

      element.style.fontSize =
        `${nextFontSize}px`;
    }

    setFontSize(nextFontSize);

    setAllowScroll(
      nextAllowScroll ||
        element.scrollHeight >
          element.clientHeight + 1,
    );
  }, [answer]);

  useLayoutEffect(() => {
    setFontSize(null);
    setAllowScroll(false);

    if (!answer) {
      return;
    }

    const frameId =
      window.requestAnimationFrame(fit);

    return () =>
      window.cancelAnimationFrame(frameId);
  }, [answer, fit]);

  useEffect(() => {
    const element = ref.current;

    if (!element || !answer) {
      return;
    }

    let frameId: number | null = null;

    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId =
        window.requestAnimationFrame(() => {
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
    fontSize:
      fontSize !== null
        ? `${fontSize}px`
        : undefined,

    overflowY:
      allowScroll
        ? "auto"
        : "hidden",
  };

  return {
    ref,
    style,
  };
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}초`;
}
