import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.lecture_command_matcher import LectureAction, match_lecture_command


router = APIRouter(prefix="/lecture-control", tags=["lecture-control"])

DUPLICATE_COOLDOWN_SECONDS = 2.5


class CommandRequest(BaseModel):
    transcript: str | None = None
    action: LectureAction | None = None


class LectureControlHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._last_action: LectureAction | None = None
        self._last_action_at = 0.0
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    def should_suppress_duplicate(self, action: LectureAction) -> bool:
        now = time.monotonic()
        if self._last_action == action and now - self._last_action_at < DUPLICATE_COOLDOWN_SECONDS:
            return True
        self._last_action = action
        self._last_action_at = now
        return False

    async def broadcast(self, message: dict[str, Any]) -> int:
        async with self._lock:
            clients = list(self._clients)

        disconnected: list[WebSocket] = []
        delivered = 0
        for websocket in clients:
            try:
                await websocket.send_json(message)
                delivered += 1
            except Exception:
                disconnected.append(websocket)

        if disconnected:
            async with self._lock:
                for websocket in disconnected:
                    self._clients.discard(websocket)

        return delivered


hub = LectureControlHub()


async def process_transcript(transcript: str) -> dict[str, Any]:
    action = match_lecture_command(transcript)
    if action is None:
        return {
            "type": "lecture_command_result",
            "transcript": transcript,
            "action": None,
            "matched": False,
            "broadcast": False,
            "duplicate": False,
        }

    duplicate = hub.should_suppress_duplicate(action)
    message = {
        "type": "lecture_command",
        "action": action,
        "transcript": transcript,
    }
    delivered = 0 if duplicate else await hub.broadcast(message)

    return {
        "type": "lecture_command_result",
        "transcript": transcript,
        "action": action,
        "matched": True,
        "broadcast": not duplicate,
        "duplicate": duplicate,
        "delivered": delivered,
    }


@router.websocket("/ws")
async def lecture_control_ws(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(websocket)


@router.post("/command")
async def command_from_transcript(payload: CommandRequest):
    if payload.action:
        duplicate = hub.should_suppress_duplicate(payload.action)
        message = {
            "type": "lecture_command",
            "action": payload.action,
            "transcript": payload.transcript or "",
        }
        delivered = 0 if duplicate else await hub.broadcast(message)
        return {
            "type": "lecture_command_result",
            "transcript": payload.transcript or "",
            "action": payload.action,
            "matched": True,
            "broadcast": not duplicate,
            "duplicate": duplicate,
            "delivered": delivered,
        }

    if not payload.transcript:
        raise HTTPException(status_code=400, detail="transcript or action is required")
    return await process_transcript(payload.transcript)
