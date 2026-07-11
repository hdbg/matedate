"""The game-analysis worker: a standalone process that drains the game_analysis pgmq queue.

Runs separately from the WebSocket server (`backend/worker.py` → `main()`), so slow model calls
never share the live-game event loop and the two can be restarted/scaled independently.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from supabase import AsyncClient

from ..config import Settings, get_settings
from ..supabase_client import get_supabase
from .engine import AnalysisEngine, build_analysis_engine
from .queue import QUEUE_NAME, queue_read
from .service import process_job

logger = logging.getLogger("matedate.analysis.worker")


async def run_loop(
    db: AsyncClient, settings: Settings, engine: AnalysisEngine, stop: asyncio.Event
) -> None:
    """Poll the queue and process one message at a time until `stop` is set. An in-flight
    message always finishes before shutdown (graceful drain)."""
    while not stop.is_set():
        try:
            messages = await queue_read(
                db,
                QUEUE_NAME,
                vt_seconds=settings.analysis_visibility_timeout_seconds,
                qty=1,
            )
        except Exception:
            logger.exception("queue read failed; backing off")
            await _sleep_or_stop(stop, settings.analysis_poll_seconds)
            continue

        if not messages:
            await _sleep_or_stop(stop, settings.analysis_poll_seconds)
            continue

        for msg in messages:
            logger.info("processing job message %s (read_ct=%s)", msg.msg_id, msg.read_ct)
            await process_job(db, settings, engine, msg)


async def _sleep_or_stop(stop: asyncio.Event, seconds: float) -> None:
    """Wait up to `seconds`, but return immediately once shutdown is requested."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    db = get_supabase()
    engine = build_analysis_engine(settings)
    logger.info(
        "analysis worker started (queue=%s, engine=%s)",
        QUEUE_NAME,
        type(engine).__name__,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    try:
        await run_loop(db, settings, engine, stop)
    finally:
        logger.info("analysis worker stopped")
