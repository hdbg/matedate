"""The archetype worker loop: drains the game_archetype pgmq queue.

Structured like `app/analysis/worker.py` (its own `run_loop`, and a `main()` so it *can* run
standalone), but in practice `backend/worker.py` runs this loop concurrently with the analysis
loop in one process — the fast, user-facing archetype pass shouldn't wait behind a slow deep
review, and vice versa.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from supabase import AsyncClient

from ..config import Settings, get_settings
from ..supabase_client import get_supabase
from .engine import ArchetypeEngine, build_archetype_engine
from .queue import QUEUE_NAME, queue_read
from .service import process_archetype_job

logger = logging.getLogger("matedate.archetype.worker")


async def run_loop(
    db: AsyncClient, settings: Settings, engine: ArchetypeEngine, stop: asyncio.Event
) -> None:
    """Poll the queue and process one message at a time until `stop` is set."""
    while not stop.is_set():
        try:
            messages = await queue_read(
                db,
                QUEUE_NAME,
                vt_seconds=settings.archetype_visibility_timeout_seconds,
                qty=1,
            )
        except Exception:
            logger.exception("queue read failed; backing off")
            await _sleep_or_stop(stop, settings.archetype_poll_seconds)
            continue

        if not messages:
            await _sleep_or_stop(stop, settings.archetype_poll_seconds)
            continue

        for msg in messages:
            logger.info("processing archetype message %s (read_ct=%s)", msg.msg_id, msg.read_ct)
            await process_archetype_job(db, settings, engine, msg)


async def _sleep_or_stop(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    db = get_supabase()
    engine = build_archetype_engine(settings)
    logger.info("archetype worker started (queue=%s, engine=%s)", QUEUE_NAME, type(engine).__name__)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    try:
        await run_loop(db, settings, engine, stop)
    finally:
        logger.info("archetype worker stopped")
