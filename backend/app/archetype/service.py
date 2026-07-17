"""Enqueue + process one archetype job, and persist its result.

Mirrors `app/analysis/service.py`: the pgmq message is the durable unit; the `archetype_jobs`
row is the observable lifecycle + idempotency guard; the result lands in `game_archetypes`. The
enqueue runs at game/match finish (service-role). The tier + legendary are derived deterministically
here; the model supplies style/flavor/meme, and on any model failure a deterministic fallback is
persisted so a `game_archetypes` row ALWAYS lands (the client's loader never hangs).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, cast

from postgrest import APIError
from supabase import AsyncClient

from ..config import Settings
from ..database_types import (
    PublicArchetypeJobsInsert,
    PublicArchetypeJobsUpdate,
    PublicGameArchetypesInsert,
    PublicMatchSide,
)
from ..db import json_row
from .classify import accuracy_tier, detect_legendary, fallback_style, resolve_key
from .engine import (
    MAX_MEME_POSITIONS,
    ArchetypeContext,
    ArchetypeEngine,
    ArchetypeResult,
    ArchetypeVerdict,
    expand_meme,
)
from .prompt import PROMPT_VERSION
from .queue import QUEUE_NAME, QueueMessage, queue_archive, queue_send
from .source import ArchetypeInput, load_game_input, load_match_input

logger = logging.getLogger("matedate.archetype.service")

_UNIQUE_VIOLATION = "23505"
_TERMINAL_STATUSES = frozenset({"completed", "cancelled"})


class EnqueueError(Exception):
    """The game/match can't be enqueued (missing, or not finished)."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enqueue (called at finish, service-role)
# ---------------------------------------------------------------------------


async def enqueue_game_archetype(db: AsyncClient, game_id: uuid.UUID) -> uuid.UUID:
    """Create an archetype_jobs row and enqueue it; return the pre-generated game_archetypes.id.

    Idempotent on `archetype:<game_id>` — a duplicate enqueue returns the existing archetype id.
    """
    res = await (
        db.table("games")
        .select("user_id, status")
        .eq("id", str(game_id))
        .maybe_single()
        .execute()
    )
    row = cast("dict[str, Any] | None", res.data if res else None)
    if not row:
        raise EnqueueError(f"game {game_id} not found")
    if row["status"] != "completed":
        raise EnqueueError(f"game {game_id} is {row['status']}, not completed")
    user_id = uuid.UUID(row["user_id"]) if row.get("user_id") else None

    key = f"archetype:{game_id}"
    archetype_id = uuid.uuid4()
    job_insert: PublicArchetypeJobsInsert = {
        "status": "queued",
        "game_id": game_id,
        "user_id": user_id,
        "idempotency_key": key,
        "archetype_id": archetype_id,
    }
    message = {"game_id": str(game_id), "archetype_id": str(archetype_id)}
    return await _enqueue(db, key, archetype_id, job_insert, message)


async def enqueue_match_archetype(
    db: AsyncClient, match_id: uuid.UUID, side: PublicMatchSide, user_id: uuid.UUID | None
) -> uuid.UUID:
    """Enqueue ONE side of a finished PvP match; return that side's pre-generated archetype id.
    Idempotent on `archetype:match:<match_id>:<side>`. The finish path enqueues both sides."""
    key = f"archetype:match:{match_id}:{side}"
    archetype_id = uuid.uuid4()
    job_insert: PublicArchetypeJobsInsert = {
        "status": "queued",
        "match_id": match_id,
        "side": side,
        "user_id": user_id,
        "idempotency_key": key,
        "archetype_id": archetype_id,
    }
    message = {"match_id": str(match_id), "side": side, "archetype_id": str(archetype_id)}
    return await _enqueue(db, key, archetype_id, job_insert, message)


async def _enqueue(
    db: AsyncClient,
    key: str,
    archetype_id: uuid.UUID,
    job_insert: PublicArchetypeJobsInsert,
    message: dict[str, Any],
) -> uuid.UUID:
    try:
        inserted = await db.table("archetype_jobs").insert(json_row(job_insert)).execute()
    except APIError as exc:
        if exc.code == _UNIQUE_VIOLATION:
            return await _existing_archetype_id(db, key)
        raise
    job_id = uuid.UUID(cast("Any", inserted.data)[0]["id"])
    msg_id = await queue_send(db, QUEUE_NAME, {"job_id": str(job_id), **message})
    await _update_job(db, job_id, {"queue_msg_id": msg_id})
    return archetype_id


async def _existing_archetype_id(db: AsyncClient, key: str) -> uuid.UUID:
    res = await (
        db.table("archetype_jobs").select("archetype_id").eq("idempotency_key", key).single().execute()
    )
    return uuid.UUID(cast("dict[str, Any]", res.data)["archetype_id"])


async def _update_job(db: AsyncClient, job_id: uuid.UUID, patch: PublicArchetypeJobsUpdate) -> None:
    await db.table("archetype_jobs").update(json_row(patch)).eq("id", str(job_id)).execute()


# ---------------------------------------------------------------------------
# Process (worker)
# ---------------------------------------------------------------------------


async def process_archetype_job(
    db: AsyncClient, settings: Settings, engine: ArchetypeEngine, msg: QueueMessage
) -> None:
    """Run one queue message end-to-end. Never raises: failures are recorded on the job row and
    the message is archived only when the job reaches a terminal state."""
    message = msg.message
    try:
        job_id = uuid.UUID(message["job_id"])
        game_id = uuid.UUID(message["game_id"]) if message.get("game_id") else None
        match_id = uuid.UUID(message["match_id"]) if message.get("match_id") else None
        side = cast("PublicMatchSide | None", message.get("side"))
        if game_id is None and (match_id is None or side not in ("a", "b")):
            raise KeyError("game_id or match_id+side")
        archetype_id = uuid.UUID(message["archetype_id"])
    except (KeyError, ValueError):
        await queue_archive(db, QUEUE_NAME, msg.msg_id)
        return

    job = await _load_job(db, job_id)
    if job is None or job["status"] in _TERMINAL_STATUSES:
        await queue_archive(db, QUEUE_NAME, msg.msg_id)
        return

    if msg.read_ct > settings.archetype_max_attempts:
        await _update_job(
            db, job_id, {"status": "failed", "finished_at": _now(), "attempts": msg.read_ct}
        )
        await queue_archive(db, QUEUE_NAME, msg.msg_id)
        return

    await _update_job(
        db, job_id, {"status": "processing", "started_at": _now(), "attempts": msg.read_ct}
    )
    try:
        if game_id is not None:
            inp = await load_game_input(db, game_id)
        else:
            assert match_id is not None and side is not None  # narrowed above
            inp = await load_match_input(db, match_id, side)
        tier = accuracy_tier(inp.accuracy)
        legendary = detect_legendary(inp.you, inp.accuracy, settings)
        result = await _classify_with_fallback(engine, settings, inp, tier, legendary)
        key, is_legendary = resolve_key(tier, result.verdict.play_style, legendary)
        meme_positions = expand_meme(result.verdict, inp.valid_positions)
        await _persist_archetype(
            db,
            job_id,
            archetype_id,
            key=key,
            is_legendary=is_legendary,
            tier=tier,
            result=result,
            meme_positions=meme_positions,
            accuracy=inp.accuracy,
            game_id=game_id,
            match_id=match_id,
            side=side,
        )
    except Exception as exc:  # noqa: BLE001 — record and let pgmq redeliver after the vt.
        await _update_job(db, job_id, {"status": "queued", "last_error": repr(exc)[:2000]})
        return

    await _update_job(db, job_id, {"status": "completed", "finished_at": _now()})
    await queue_archive(db, QUEUE_NAME, msg.msg_id)


async def _classify_with_fallback(
    engine: ArchetypeEngine,
    settings: Settings,
    inp: ArchetypeInput,
    tier: str,
    legendary: str | None,
) -> ArchetypeResult:
    """Run the model under a timeout; on ANY failure fall back to a deterministic verdict so a
    row always persists (the fallback picks a style from swing signals + the last few positions)."""
    ctx = ArchetypeContext(
        rendered=inp.rendered,
        valid_positions=inp.valid_positions,
        tier=cast("Any", tier),
        legendary=cast("Any", legendary),
    )
    try:
        return await asyncio.wait_for(engine.classify(ctx), timeout=settings.archetype_timeout_seconds)
    except Exception as exc:  # noqa: BLE001 — timeouts, API errors, validation → deterministic card.
        logger.warning("archetype model failed (%r); using deterministic fallback", exc)
        window = sorted(inp.valid_positions)[-MAX_MEME_POSITIONS:]
        verdict = ArchetypeVerdict(
            play_style=fallback_style(inp.you),
            flavor_reason="Your game, graded on the board.",
            meme_start=window[0] if window else 0,
            meme_after=max(0, len(window) - 1),
        )
        return ArchetypeResult(verdict=verdict, model="archetype-fallback", latency_ms=0)


async def _load_job(db: AsyncClient, job_id: uuid.UUID) -> dict[str, Any] | None:
    res = (
        await db.table("archetype_jobs")
        .select("id, status")
        .eq("id", str(job_id))
        .maybe_single()
        .execute()
    )
    return cast("dict[str, Any] | None", res.data if res else None)


async def _persist_archetype(
    db: AsyncClient,
    job_id: uuid.UUID,
    archetype_id: uuid.UUID,
    *,
    key: str,
    is_legendary: bool,
    tier: str,
    result: ArchetypeResult,
    meme_positions: list[int],
    accuracy: float,
    game_id: uuid.UUID | None,
    match_id: uuid.UUID | None,
    side: PublicMatchSide | None,
) -> None:
    verdict = result.verdict
    insert: PublicGameArchetypesInsert = {
        "id": archetype_id,
        "job_id": job_id,
        "game_id": game_id,
        "match_id": match_id,
        "side": side,
        "archetype": cast("Any", key),
        "is_legendary": is_legendary,
        "tier": cast("Any", tier),
        "style": verdict.play_style,
        "flavor_reason": verdict.flavor_reason,
        "meme_positions": meme_positions,
        "model": result.model,
        "prompt_version": PROMPT_VERSION,
        "raw_response": cast(
            "Any",
            {
                "model": result.model,
                "latency_ms": result.latency_ms,
                "accuracy": accuracy,
                "verdict": verdict.model_dump(),
            },
        ),
        "latency_ms": result.latency_ms,
    }
    await db.table("game_archetypes").insert(json_row(insert)).execute()
