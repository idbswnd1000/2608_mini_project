from fastapi import APIRouter

from app.services.evaluation_summary_service import get_evaluation_summary


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.get("/summary")
async def evaluation_summary():
    return await get_evaluation_summary()
