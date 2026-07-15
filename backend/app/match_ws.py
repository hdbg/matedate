"""WebSocket transport for ranked PvP: one authenticated socket per user at /ws/match.

Mirrors the solo transport (`app/ws.py`): token in the query string, 4401 on bad auth, the
shared ConnectionManager (so one socket per user stays global across solo and PvP — a new
socket replaces the old with 4000), and a send lock serializing the request loop against the
session's background pushes (opponent moves, the timeout finish).

A connection first resumes any in-progress match (`match_state`); otherwise the client sends
one intent — `queue`, `create_invite`, or `join_invite` — and then `move`/`cancel` frames.
The socket ends with the match: a batch ending in `match_finish` stops the read loop, and the
idle opponent's socket is closed by the session via the close callback.
"""

import asyncio
from functools import lru_cache
from typing import Annotated, Any, Union

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from supabase import AsyncClient

from .auth import AuthError, verify_token
from .config import get_settings
from .engine import Engine, build_engine
from .protocol import (
    CancelMsg,
    ClientMove,
    CreateInviteMsg,
    ErrorMsg,
    JoinInviteMsg,
    MatchFinishMsg,
    QueueMsg,
)
from .pvp import PlayerConn, invites, matchmaking, registry
from .supabase_client import get_supabase
from .ws import CLOSE_UNAUTHORIZED, manager


@lru_cache
def _engine() -> Engine:
    return build_engine(get_settings())


ClientFrame = Annotated[
    Union[ClientMove, QueueMsg, CreateInviteMsg, JoinInviteMsg, CancelMsg],
    Field(discriminator="type"),
]
_frame_adapter: TypeAdapter[ClientFrame] = TypeAdapter(ClientFrame)


async def match_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    supabase = get_supabase()
    token = websocket.query_params.get("token", "")
    try:
        user_id = await verify_token(supabase, token)
    except AuthError:
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="unauthorized")
        return

    await manager.register(user_id, websocket)

    # Serialize every send: the request loop and the session's pushes (opponent frames, the
    # timeout finish) would otherwise interleave and corrupt the WS framing.
    send_lock = asyncio.Lock()

    async def send(message: BaseModel) -> None:
        async with send_lock:
            try:
                await websocket.send_json(message.model_dump())
            except Exception:
                pass  # socket closing/closed — nothing more we can do

    async def close() -> None:
        try:
            await websocket.close()
        except Exception:
            pass

    conn = PlayerConn(user_id=user_id, send=send, close=close)
    try:
        # Resume an in-progress match straight away (reconnect / backend restart).
        session = await registry.get_or_load(supabase, get_settings(), _engine(), user_id)
        if session is not None:
            opening = await session.attach(conn)
            for message in opening:
                await send(message)
            if _ends_match(opening):
                return

        while True:
            try:
                data = await websocket.receive_json()
            except (WebSocketDisconnect, RuntimeError):
                # RuntimeError: the session closed this socket under us (match over).
                break
            except Exception:
                await send(ErrorMsg(code="bad_message", message="invalid JSON"))
                continue
            results = await _handle(supabase, conn, data)
            for message in results:
                await send(message)
            if _ends_match(results):
                break
    except WebSocketDisconnect:
        pass
    finally:
        if conn.session is not None:
            conn.session.detach(conn)
        if conn.queued:
            await matchmaking.leave(supabase, conn)
        if conn.invite_code is not None:
            await invites.cancel(supabase, conn)
        manager.unregister(user_id, websocket)


async def _handle(db: AsyncClient, conn: PlayerConn, data: Any) -> list[BaseModel]:
    try:
        frame = _frame_adapter.validate_python(data)
    except ValidationError as exc:
        return [ErrorMsg(code="bad_message", message=str(exc))]

    if isinstance(frame, ClientMove):
        if conn.session is None:
            return [ErrorMsg(code="no_active_match", message="no match in progress")]
        return await conn.session.apply_move(conn, frame.content)

    if isinstance(frame, CancelMsg):
        if conn.queued:
            return await matchmaking.leave(db, conn)
        if conn.invite_code is not None:
            return await invites.cancel(db, conn)
        return [ErrorMsg(code="nothing_to_cancel", message="nothing is pending")]

    # Intents. One pending thing at a time, and not while a solo game is live — starting solo
    # play mid-queue (or vice versa) would burn a clock somewhere the player isn't looking.
    if conn.session is not None:
        return [ErrorMsg(code="busy", message="a match is already in progress")]
    if conn.queued or conn.invite_code is not None:
        return [ErrorMsg(code="busy", message="cancel your pending queue or invite first")]
    if await _has_active_solo_game(db, conn.user_id):
        return [ErrorMsg(code="active_game", message="finish your solo game first")]

    if isinstance(frame, QueueMsg):
        return await matchmaking.join(db, get_settings(), _engine(), conn, frame.time_control)
    if isinstance(frame, CreateInviteMsg):
        return await invites.create(db, conn, frame.time_control)
    return await invites.join(db, get_settings(), _engine(), conn, frame.code)


async def _has_active_solo_game(db: AsyncClient, user_id: str) -> bool:
    res = await (
        db.table("games")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _ends_match(messages: list[BaseModel]) -> bool:
    return bool(messages) and isinstance(messages[-1], MatchFinishMsg)
