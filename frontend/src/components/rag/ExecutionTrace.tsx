import { useEffect, useMemo, useRef, useState } from "react";
import { PresentationEvent, usePresentationRun } from "../../hooks/usePresentationRun";

type PresentationRun = ReturnType<typeof usePresentationRun>;

export interface TeachingGuide {
  why: string;
  principle: string;
  keyPoint: string;
  concepts: Array<{ label: string; title: string; description: string }>;
  bridge: string;
}

interface TraceBlock {
  key: string;
  event: PresentationEvent;
  index: number;
}

const stepCopy: Record<string, { title: string; complete: string; running: string }> = {
  question_received: {
    title: "질문 입력",
    running: "질문을 실행 흐름에 전달하고 있습니다.",
    complete: "사용자 질문을 받았습니다."
  },
  query_rewrite: {
    title: "Query Rewrite",
    running: "검색하기 좋은 질문으로 다시 작성하고 있습니다.",
    complete: "검색용 질문으로 다시 작성했습니다."
  },
  embedding: {
    title: "Embedding",
    running: "질문의 의미를 벡터로 변환하고 있습니다.",
    complete: "질문의 의미를 벡터로 변환했습니다."
  },
  vector_search: {
    title: "Vector Search",
    running: "질문과 가까운 문서 후보를 검색하고 있습니다.",
    complete: "관련 문서 후보를 검색했습니다."
  },
  retry_search: {
    title: "Retry Search",
    running: "개선된 질문으로 다시 검색하고 있습니다.",
    complete: "개선된 질문으로 다시 검색했습니다."
  },
  reranking: {
    title: "Reranking",
    running: "검색 후보의 순위를 정밀하게 다시 평가하고 있습니다.",
    complete: "검색 후보의 순위를 다시 조정했습니다."
  },
  agent_decision: {
    title: "Agent Decision",
    running: "현재 질문에서 검색이 필요한지 판단하고 있습니다.",
    complete: "검색 필요 여부를 판단했습니다."
  },
  context_evaluation: {
    title: "Context Evaluation",
    running: "검색 결과가 답변하기 충분한지 평가하고 있습니다.",
    complete: "검색 결과의 충분성을 평가했습니다."
  },
  query_refinement: {
    title: "Query Refinement",
    running: "부족한 정보를 더 잘 찾도록 검색 질문을 개선하고 있습니다.",
    complete: "검색 질문을 개선했습니다."
  },
  retry_limit: {
    title: "Retry Limit Reached",
    running: "최대 재검색 횟수를 확인하고 있습니다.",
    complete: "최대 재검색 횟수에 도달했습니다."
  },
  context_build: {
    title: "Top-K Context",
    running: "답변에 사용할 Context를 구성하고 있습니다.",
    complete: "답변에 사용할 Context를 구성했습니다."
  },
  llm_generation: {
    title: "LLM",
    running: "검색한 정보를 근거로 답변을 생성하고 있습니다.",
    complete: "검색한 정보를 근거로 답변을 생성했습니다."
  }
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function formatMs(value?: number) {
  if (value == null) return null;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function candidateCount(data: Record<string, unknown>) {
  if (typeof data.candidate_count === "number") return data.candidate_count;
  if (Array.isArray(data.top_candidates)) return data.top_candidates.length;
  if (Array.isArray(data.selected_context)) return data.selected_context.length;
  return null;
}

function QueryRewriteDetail({ data }: { data: Record<string, unknown> }) {
  const original = data.original_query;
  const rewritten = data.rewritten_query;
  if (typeof original !== "string" && typeof rewritten !== "string") return null;
  return (
    <div className="trace-pair">
      {typeof original === "string" && (
        <p>
          <span>Original</span>
          {original}
        </p>
      )}
      {typeof rewritten === "string" && (
        <p>
          <span>Rewritten</span>
          {rewritten}
        </p>
      )}
    </div>
  );
}

function RerankDetail({ data }: { data: Record<string, unknown> }) {
  const before = Array.isArray(data.before) ? data.before.slice(0, 2).map(asRecord) : [];
  const after = Array.isArray(data.after) ? data.after.slice(0, 2).map(asRecord) : [];
  if (!before.length || !after.length) return null;
  return (
    <div className="trace-rerank">
      {after.map((row, index) => (
        <span key={`${String(row.chunk_id ?? index)}-${index}`}>
          Before #{String(before[index]?.rank ?? "-")} → After #{String(row.rank ?? index + 1)}
        </span>
      ))}
    </div>
  );
}

function RequirementList({ label, value }: { label: string; value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return (
    <div className="trace-requirements">
      <span>{label}</span>
      <ul>
        {value.slice(0, 4).map((item, index) => (
          <li key={`${label}-${index}`}>{String(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function TraceDetail({ event }: { event: PresentationEvent }) {
  const data = asRecord(event.intermediate_result);
  const elapsed = formatMs(event.actual_elapsed_ms);
  const count = candidateCount(data);

  if (event.status === "running") {
    return elapsed ? <p>Actual · {elapsed}</p> : null;
  }

  if (event.step === "question_received") {
    return <p className="trace-answer">"{String(event.question ?? data.question ?? "")}"</p>;
  }

  if (event.step === "query_rewrite") {
    return (
      <>
        <QueryRewriteDetail data={data} />
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "embedding") {
    return (
      <>
        <p>Dimension · {String(data.dimension ?? "-")}</p>
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "vector_search" || event.step === "retry_search") {
    return (
      <>
        {count != null && <p>검색된 후보 · {count}개</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "reranking") {
    return (
      <>
        <p>Vector Search 후보를 더 정밀하게 다시 평가했습니다.</p>
        <RerankDetail data={data} />
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "agent_decision") {
    const needsSearch = data.needs_search;
    return (
      <>
        {typeof needsSearch === "boolean" && <p>검색 필요 · {needsSearch ? "YES" : "NO"}</p>}
        {typeof data.query === "string" && <p>검색 질문 · {data.query}</p>}
        {typeof data.reason === "string" && <p>{data.reason}</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "context_evaluation") {
    const sufficient = data.sufficient;
    return (
      <>
        <p>답변하기 충분한가? · {sufficient === false ? "NO" : sufficient === true ? "YES" : "-"}</p>
        <RequirementList label="충족" value={data.covered_requirements} />
        <RequirementList label="부족" value={data.missing_requirements} />
        {typeof data.reason === "string" && <p>{data.reason}</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "query_refinement") {
    return (
      <>
        <QueryRewriteDetail data={{ original_query: data.original_query, rewritten_query: data.refined_query }} />
        <RequirementList label="부족" value={data.missing_requirements} />
        {event.event === "retry" && typeof event.reason === "string" && <p>{event.reason}</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "retry_limit") {
    return (
      <>
        <p>최대 재검색 횟수에 도달했습니다.</p>
        <p>현재까지 확보한 정보를 이용해 답변을 생성합니다.</p>
      </>
    );
  }

  if (event.step === "context_build") {
    return (
      <>
        {count != null && <p>선택된 문서 · {count}개</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  if (event.step === "llm_generation") {
    return (
      <>
        {typeof data.answer === "string" && <p className="trace-answer">{data.answer}</p>}
        {elapsed && <p>Actual · {elapsed}</p>}
      </>
    );
  }

  return elapsed ? <p>Actual · {elapsed}</p> : null;
}

function eventRound(event: PresentationEvent) {
  const data = asRecord(event.intermediate_result);
  return typeof event.round === "number" ? event.round : typeof data.round === "number" ? data.round : 0;
}

function eventRetryCount(event: PresentationEvent) {
  const data = asRecord(event.intermediate_result);
  const round = eventRound(event);
  return typeof event.retry_count === "number"
    ? event.retry_count
    : typeof data.retry_count === "number"
      ? data.retry_count
      : event.step === "retry_search" && round > 1
        ? round - 1
        : 0;
}

function blockKey(event: PresentationEvent) {
  return `${eventRound(event)}-${eventRetryCount(event)}-${event.step}`;
}

function buildTrace(events: PresentationEvent[]): TraceBlock[] {
  const blocks: TraceBlock[] = [];

  for (const event of events) {
    if (!event.step || event.step === "run" || event.step === "round") continue;
    if (!["step_start", "step_complete", "decision", "retry", "error"].includes(event.event)) continue;

    const key = blockKey(event);
    let previousIndex = -1;
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index].key === key) {
        previousIndex = index;
        break;
      }
    }
    const nextBlock = { key, event, index: blocks.length + 1 };

    if (previousIndex >= 0) {
      blocks[previousIndex] = { ...nextBlock, index: blocks[previousIndex].index };
    } else {
      blocks.push(nextBlock);
    }
  }

  return blocks;
}

export function ExecutionTrace({ run, guide }: { run: PresentationRun; guide: TeachingGuide }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);
  const blocks = useMemo(() => buildTrace(run.events), [run.events]);
  const actualTotal = Number(run.result?.actual_total_ms ?? 0);

  useEffect(() => {
    if (!followRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [run.events.length, run.status, blocks.length]);

  function handleTraceScroll() {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    const nextFollowing = distanceFromBottom < 48;
    followRef.current = nextFollowing;
    setIsFollowing(nextFollowing);
  }

  function statusLabel(event: PresentationEvent) {
    if (event.event === "retry") return "RETRY";
    if (event.status === "running") return "RUN";
    if (event.status === "completed") return "DONE";
    if (event.status === "failed") return "!";
    return "";
  }

  return (
    <aside className={`execution-panel execution-trace-panel ${run.ragType}-accent`}>
      <div className="trace-heading">
        <h2>EXECUTION TRACE</h2>
        {actualTotal > 0 && <span>Actual · {formatMs(actualTotal)}</span>}
      </div>

      <div className="teaching-guide">
        <div className="guide-principle">
          <p>
            <span>WHY</span>
            {guide.why}
          </p>
          <p>
            <span>PRINCIPLE</span>
            {guide.principle}
          </p>
        </div>
        <p className="guide-keypoint">
          <span>KEY POINT</span>
          {guide.keyPoint}
        </p>
        <div className="guide-concepts">
          {guide.concepts.map((concept) => (
            <div key={concept.title}>
              <span>{concept.label}</span>
              <strong>{concept.title}</strong>
              <p>{concept.description}</p>
            </div>
          ))}
        </div>
        <p className="guide-bridge">{guide.bridge}</p>
      </div>

      {run.error && <div className="trace-error">실행 오류: {run.error}</div>}
      <div className="actual-execution-heading">
        <strong>실행 과정</strong>
        <span>완료된 단계가 순서대로 쌓입니다</span>
      </div>
      <div className="trace-list" ref={scrollRef} onScroll={handleTraceScroll} data-following={isFollowing}>
        {!blocks.length && <p className="empty-live">실제 backend 실행 이벤트를 기다리고 있습니다.</p>}
        {blocks.map((block) => {
          const copy = stepCopy[block.event.step] ?? {
            title: block.event.step,
            running: "실행 중입니다.",
            complete: "완료되었습니다."
          };
          const isRunning = block.event.status === "running";
          const round = eventRound(block.event);
          const retryCount = eventRetryCount(block.event);
          return (
            <article
              className={`trace-block step-${block.event.step} ${isRunning ? "running" : "completed"}`}
              key={`${block.key}-${block.index}`}
            >
              <header>
                <span>{String(block.index).padStart(2, "0")}</span>
                <strong>
                  {round ? `Round ${round} · ` : ""}
                  {copy.title}
                </strong>
                {retryCount ? <em>Retry {retryCount}</em> : null}
                <b>{statusLabel(block.event)}</b>
              </header>
              <p>{isRunning ? copy.running : copy.complete}</p>
              <TraceDetail event={block.event} />
            </article>
          );
        })}
        {run.status === "complete" && run.result && (
          <article className="trace-block completed final-answer">
            <header>
              <span>{String(blocks.length + 1).padStart(2, "0")}</span>
              <strong>Answer</strong>
              <b>DONE</b>
            </header>
            <p className="trace-answer">{String(run.result.answer ?? "")}</p>
          </article>
        )}
      </div>
    </aside>
  );
}
