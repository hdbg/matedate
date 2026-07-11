"""Thin async wrappers over the pgmq queue.

pgmq lives in its own (unexposed) schema, so these go through the `public.pgmq_*`
security-definer RPCs the migration installs, called with the service-role client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from pydantic import BaseModel
from supabase import AsyncClient

QUEUE_NAME = "game_analysis"


class QueueMessage(BaseModel):
    msg_id: int
    read_ct: int
    enqueued_at: datetime
    vt: datetime
    message: dict[str, Any]


async def queue_send(
    db: AsyncClient, queue: str, msg: dict[str, Any], *, delay_seconds: int = 0
) -> int:
    res = await db.rpc(
        "pgmq_send", {"queue_name": queue, "msg": msg, "delay_seconds": delay_seconds}
    ).execute()
    data = res.data
    # A scalar-returning function comes back as the bare value; be tolerant of a 1-row list.
    if isinstance(data, list):
        data = data[0]
    return int(cast("int", data))


async def queue_read(
    db: AsyncClient, queue: str, *, vt_seconds: int, qty: int = 1
) -> list[QueueMessage]:
    res = await db.rpc(
        "pgmq_read", {"queue_name": queue, "vt_seconds": vt_seconds, "qty": qty}
    ).execute()
    rows = cast("list[dict[str, Any]]", res.data or [])
    return [QueueMessage.model_validate(row) for row in rows]


async def queue_archive(db: AsyncClient, queue: str, msg_id: int) -> bool:
    res = await db.rpc("pgmq_archive", {"queue_name": queue, "msg_id": msg_id}).execute()
    data = res.data
    if isinstance(data, list):
        data = data[0] if data else False
    return bool(data)
