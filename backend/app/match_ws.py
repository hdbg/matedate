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
import logging
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


logger = logging.getLogger("matedate.ws.match")


@lru_cache
def _engine() -> Engine:
    return build_engine(get_settings())


ClientFrame = Annotated[
    Union[ClientMove, QueueMsg, CreateInviteMsg, JoinInviteMsg, CancelMsg],
    Field(discriminator="type"),
]
_frame_adapter: TypeAdapter[ClientFrame] = TypeAdapter(ClientFrame)


async def match_ws(websocket: WebSocket) -> None:
    cid = f"m{id(websocket) & 0xffffff:06x}"  # short per-connection id for correlating log lines
    client = websocket.client
    logger.info("[%s] /ws/match connect from %s", cid, client)
    await websocket.accept()
    logger.info("[%s] accepted", cid)

    supabase = get_supabase()
    token = websocket.query_params.get("token", "")
    logger.info("[%s] token present=%s len=%d", cid, bool(token), len(token))
    try:
        user_id = await verify_token(supabase, token)
    except AuthError as exc:
        logger.info("[%s] auth failed (%s); closing %d", cid, exc, CLOSE_UNAUTHORIZED)
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="unauthorized")
        return
    logger.info("[%s] authed user=%s", cid, user_id)

    await manager.register(user_id, websocket)
    logger.info("[%s] registered", cid)

    # Serialize every send: the request loop and the session's pushes (opponent frames, the
    # timeout finish) would otherwise interleave and corrupt the WS framing.
    send_lock = asyncio.Lock()

    async def send(message: BaseModel) -> None:
        async with send_lock:
            label = getattr(message, "type", type(message).__name__)
            try:
                await websocket.send_json(message.model_dump())
                logger.info("[%s] sent %s", cid, label)
            except Exception:
                logger.info("[%s] send %s dropped (socket closing)", cid, label)

    async def close() -> None:
        try:
            await websocket.close()
        except Exception:
            pass

    conn = PlayerConn(user_id=user_id, send=send, close=close)
    try:
        # Resume an in-progress match straight away (reconnect / backend restart).
        logger.info("[%s] checking for resumable match…", cid)
        session = await registry.get_or_load(supabase, get_settings(), _engine(), user_id)
        logger.info("[%s] resumable match=%s", cid, session is not None)
        if session is not None:
            opening = await session.attach(conn)
            for message in opening:
                await send(message)
            if _ends_match(opening):
                logger.info("[%s] resumed match already over; closing", cid)
                return

        logger.info("[%s] entering receive loop", cid)
        while True:
            try:
                data = await websocket.receive_json()
            except (WebSocketDisconnect, RuntimeError):
                # RuntimeError: the session closed this socket under us (match over).
                logger.info("[%s] receive loop ended (disconnect/closed)", cid)
                break
            except Exception:
                logger.info("[%s] bad JSON frame", cid)
                await send(ErrorMsg(code="bad_message", message="invalid JSON"))
                continue
            frame_type = data.get("type") if isinstance(data, dict) else type(data).__name__
            logger.info("[%s] recv frame type=%s", cid, frame_type)
            results = await _handle(supabase, conn, data)
            logger.info(
                "[%s] handled %s -> %s", cid, frame_type, [type(m).__name__ for m in results]
            )
            for message in results:
                await send(message)
            if _ends_match(results):
                logger.info("[%s] match finished; closing", cid)
                break
    except WebSocketDisconnect:
        logger.info("[%s] WebSocketDisconnect", cid)
    except Exception:
        logger.exception("[%s] unhandled error in match_ws", cid)
        raise
    finally:
        logger.info("[%s] cleanup (session=%s queued=%s invite=%s)",
                    cid, conn.session is not None, conn.queued, conn.invite_code is not None)
        if conn.session is not None:
            conn.session.detach(conn)
        if conn.queued:
            await matchmaking.leave(supabase, conn)
        if conn.invite_code is not None:
            await invites.cancel(supabase, conn)
        manager.unregister(user_id, websocket)
        logger.info("[%s] closed", cid)


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
