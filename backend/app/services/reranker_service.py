from dataclasses import asdict, dataclass
from functools import lru_cache

from sentence_transformers import CrossEncoder

from app.services.vector_search_service import SearchResult


RERANKER_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@dataclass
class RerankedResult:
    chunk_id: int
    document_id: int
    content: str
    distance: float
    similarity: float
    vector_rank: int
    rerank_score: float


@lru_cache(maxsize=1)
def get_reranker_model() -> CrossEncoder:
    return CrossEncoder(RERANKER_MODEL_NAME, device="cpu")


def rerank_chunks(
    query: str,
    candidates: list[SearchResult],
    top_k: int = 5,
) -> list[RerankedResult]:
    if not candidates:
        return []

    model = get_reranker_model()
    pairs = [(query, candidate.content) for candidate in candidates]
    scores = model.predict(pairs, show_progress_bar=False)

    reranked = [
        RerankedResult(
            **asdict(candidate),
            vector_rank=index,
            rerank_score=float(scores[index - 1]),
        )
        for index, candidate in enumerate(candidates, start=1)
    ]
    reranked.sort(key=lambda result: result.rerank_score, reverse=True)
    return reranked[:top_k]
