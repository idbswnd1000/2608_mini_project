import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.rag.advanced import DEFAULT_CANDIDATE_K, run_advanced_rag
from app.rag.agentic import DEFAULT_MAX_SEARCH_ROUNDS, run_agentic_rag
from app.rag.naive import run_naive_rag


router = APIRouter(prefix="/rag", tags=["rag"])
logger = logging.getLogger(__name__)


def log_rag_request(rag_type: str, phase: str, started_at: float | None = None) -> None:
    elapsed = ""
    if started_at is not None:
        elapsed = f" elapsed_ms={int((time.perf_counter() - started_at) * 1000)}"
    logger.info("[%s] %s%s", rag_type, phase, elapsed)


class NaiveRAGRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


class AdvancedRAGRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    candidate_k: int = Field(default=DEFAULT_CANDIDATE_K, ge=1, le=50)


class AgenticRAGRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    candidate_k: int = Field(default=DEFAULT_CANDIDATE_K, ge=1, le=50)
    max_search_rounds: int = Field(default=DEFAULT_MAX_SEARCH_ROUNDS, ge=1, le=5)


class RetrievedChunkResponse(BaseModel):
    chunk_id: int
    document_id: int
    content: str
    distance: float
    similarity: float


class AdvancedRetrievedChunkResponse(RetrievedChunkResponse):
    vector_rank: int
    rerank_score: float


class MetricsResponse(BaseModel):
    retrieval_ms: int
    generation_ms: int
    total_ms: int


class AdvancedMetricsResponse(BaseModel):
    rewrite_ms: int
    retrieval_ms: int
    rerank_ms: int
    generation_ms: int
    total_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    rewrite_tokens: int | None = None
    generation_tokens: int | None = None


class AgenticMetricsResponse(BaseModel):
    decision_ms: int
    retrieval_ms: int
    rerank_ms: int
    evaluation_ms: int
    generation_ms: int
    total_ms: int
    search_rounds: int
    retrieved_chunk_count: int
    final_chunk_count: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    decision_tokens: int | None = None
    evaluation_tokens: int | None = None
    generation_tokens: int | None = None


class LLMResponse(BaseModel):
    provider: str
    model: str
    configured: bool
    error: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class NaiveRAGResponse(BaseModel):
    rag_type: str
    question: str
    answer: str
    retrieved_chunks: list[RetrievedChunkResponse]
    metrics: MetricsResponse
    steps: list[dict[str, Any]]
    llm: LLMResponse


class AdvancedRAGResponse(BaseModel):
    rag_type: str
    question: str
    rewritten_query: str
    answer: str
    retrieved_chunks: list[AdvancedRetrievedChunkResponse]
    candidate_count: int
    vector_candidates: list[RetrievedChunkResponse]
    metrics: AdvancedMetricsResponse
    steps: list[dict[str, Any]]
    llm: LLMResponse
    query_rewrite: dict[str, Any]


class AgenticRAGResponse(BaseModel):
    rag_type: str
    question: str
    answer: str
    agent_decision: dict[str, Any]
    search_rounds: int
    retrieved_chunks: list[AdvancedRetrievedChunkResponse]
    search_history: list[dict[str, Any]]
    search_round_details: list[dict[str, Any]]
    context_evaluations: list[dict[str, Any]]
    metrics: AgenticMetricsResponse
    steps: list[dict[str, Any]]
    llm: LLMResponse


@router.post("/naive", response_model=NaiveRAGResponse)
async def naive_rag(request: NaiveRAGRequest):
    started_at = time.perf_counter()
    log_rag_request("naive", "request start")
    try:
        result = await run_naive_rag(
            question=request.question,
            top_k=request.top_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("naive RAG failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not result["retrieved_chunks"]:
        raise HTTPException(status_code=404, detail="No relevant chunks found")

    log_rag_request("naive", "response ready", started_at)
    return result


@router.post("/advanced", response_model=AdvancedRAGResponse)
async def advanced_rag(request: AdvancedRAGRequest):
    started_at = time.perf_counter()
    log_rag_request("advanced", "request start")
    try:
        result = await run_advanced_rag(
            question=request.question,
            top_k=request.top_k,
            candidate_k=request.candidate_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("advanced RAG failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not result["retrieved_chunks"]:
        raise HTTPException(status_code=404, detail="No relevant chunks found")

    log_rag_request("advanced", "response ready", started_at)
    return result


@router.post("/agentic", response_model=AgenticRAGResponse)
async def agentic_rag(request: AgenticRAGRequest):
    started_at = time.perf_counter()
    log_rag_request("agentic", "request start")
    try:
        result = await run_agentic_rag(
            question=request.question,
            top_k=request.top_k,
            candidate_k=request.candidate_k,
            max_search_rounds=request.max_search_rounds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("agentic RAG failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not result["retrieved_chunks"]:
        raise HTTPException(status_code=404, detail="No relevant chunks found")

    log_rag_request("agentic", "response ready", started_at)
    return result
