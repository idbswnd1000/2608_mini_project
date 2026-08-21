from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.rag.advanced import DEFAULT_CANDIDATE_K
from app.rag.agentic import DEFAULT_MAX_SEARCH_ROUNDS
from app.services.presentation_service import presentation_event_stream


router = APIRouter(prefix="/presentation", tags=["presentation"])


@router.get("/{rag_type}/stream")
async def stream_presentation_rag(
    rag_type: str,
    question: str = Query(..., min_length=1),
    top_k: int = Query(default=5, ge=1, le=20),
    candidate_k: int = Query(default=DEFAULT_CANDIDATE_K, ge=1, le=50),
    max_search_rounds: int = Query(default=DEFAULT_MAX_SEARCH_ROUNDS, ge=1, le=5),
):
    return StreamingResponse(
        presentation_event_stream(
            rag_type=rag_type,
            question=question,
            top_k=top_k,
            candidate_k=candidate_k,
            max_search_rounds=max_search_rounds,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
