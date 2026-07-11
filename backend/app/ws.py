"""WebSocket transport: one authenticated socket per user, one active game per user."""

import asyncio
from functools import lru_cache
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

from .auth import AuthError, verify_token
from .config import get_settings
from .engine import Engine, build_engine
from .game import SoloGameService
from .protocol import ClientMove, ErrorMsg
from .supabase_client import get_supabase

# WebSocket close codes (application range 4000-4999).
CLOSE_REPLACED = 4000
CLOSE_UNAUTHORIZED = 4401


@lru_cache
def _engine() -> Engine:
    return build_engine(get_settings())


class ConnectionManager:
    """Tracks the single live socket per user, closing any prior one when replaced."""

    def __init__(self) -> None:
        self._active: dict[str, WebSocket] = {}

    async def register(self, user_id: str, websocket: WebSocket) -> None:
        old = self._active.get(user_id)
        if old is not None and old is not websocket:
            try:
                await old.close(code=CLOSE_REPLACED, reason="replaced by a new connection")
            except Exception:
                pass
        self._active[user_id] = websocket

    def unregister(self, user_id: str, websocket: WebSocket) -> None:
        if self._active.get(user_id) is websocket:
            del self._active[user_id]


manager = ConnectionManager()


async def _handle(service: SoloGameService, user_id: str, data: Any) -> list[BaseModel]:
    if not isinstance(data, dict) or data.get("type") != "move":
        return [ErrorMsg(code="bad_message", message="expected {'type':'move', ...}")]
    try:
        move = ClientMove.model_validate(data)
    except ValidationError as exc:
        return [ErrorMsg(code="bad_message", message=str(exc))]
    return await service.apply_move(user_id, move.content)


async def solo_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    supabase = get_supabase()
    token = websocket.query_params.get("token", "")
    try:
        user_id = await verify_token(supabase, token)
    except AuthError:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="unauthorized")
        return

    await manager.register(user_id, websocket)

    # Serialize every send: the request loop and the service's background timeout timer can
    # both push frames, and interleaved send_json calls would corrupt the WS framing.
    send_lock = asyncio.Lock()

    async def send(message: BaseModel) -> None:
        async with send_lock:
            try:
                await websocket.send_json(message.model_dump())
            except Exception:
                pass  # socket closing/closed — nothing more we can do

    service = SoloGameService(supabase, get_settings(), _engine(), send=send)
    try:
        for message in await service.start_or_resume(user_id):
            await send(message)

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                await send(ErrorMsg(code="bad_message", message="invalid JSON"))
                continue
            for message in await _handle(service, user_id, data):
                await send(message)
    except WebSocketDisconnect:
        pass
    finally:
        await service.aclose()
        manager.unregister(user_id, websocket)
