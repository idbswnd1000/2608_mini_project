export type RagType = "naive" | "advanced" | "agentic";
export type Difficulty = "simple" | "ambiguous" | "complex" | "overall";
export type SummaryMode = "retrieval_summary" | "full_rag_summary";

export interface RetrievedChunk {
  chunk_id: number;
  document_id: number;
  content: string;
  distance: number;
  similarity: number;
  vector_rank?: number;
  rerank_score?: number;
}

export interface RagMetrics {
  retrieval_ms?: number;
  rewrite_ms?: number;
  rerank_ms?: number;
  decision_ms?: number;
  evaluation_ms?: number;
  generation_ms?: number;
  total_ms: number;
  search_rounds?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
}

export interface RagResponse {
  rag_type: RagType;
  question: string;
  rewritten_query?: string;
  answer: string;
  retrieved_chunks: RetrievedChunk[];
  metrics: RagMetrics;
  steps: Array<Record<string, unknown>>;
  llm?: {
    provider: string;
    model: string;
    configured: boolean;
    error?: string | null;
  };
  search_rounds?: number;
  search_history?: Array<Record<string, unknown>>;
  context_evaluations?: Array<Record<string, unknown>>;
  agent_decision?: Record<string, unknown>;
}

export interface SummaryRow {
  question_count: number;
  avg_hit_at_k: number | null;
  avg_precision_at_k: number | null;
  avg_mrr: number | null;
  avg_intent_coverage_at_k: number | null;
  avg_total_ms: number | null;
  avg_input_tokens: number | null;
  avg_output_tokens: number | null;
  avg_total_tokens: number | null;
  avg_search_rounds: number | null;
  avg_step_count: number | null;
}

export type SummaryMatrix = Record<Difficulty, Record<RagType, SummaryRow>>;

export interface EvaluationSummary {
  retrieval_summary: SummaryMatrix;
  full_rag_summary: SummaryMatrix;
  representative_full_question_keys: string[];
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchEvaluationSummary() {
  return requestJson<EvaluationSummary>("/evaluation/summary");
}

export function runRagDemo(ragType: RagType, question: string, topK = 5) {
  const payload: Record<string, number | string> = { question, top_k: topK };

  if (ragType === "advanced" || ragType === "agentic") {
    payload.candidate_k = 10;
  }
  if (ragType === "agentic") {
    payload.max_search_rounds = 3;
  }

  return requestJson<RagResponse>(`/rag/${ragType}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
