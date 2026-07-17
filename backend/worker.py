"""Post-game worker entrypoint. Run with `uv run python worker.py` (or `task worker`).

Drains BOTH pgmq queues in one process, concurrently: the deep-analysis queue (game_analysis)
and the archetype queue (game_archetype). Each has its own submodule + `run_loop` (and can run
standalone), but running them together keeps the fast, user-facing archetype pass off the
head-of-line-blocking behind a slow deep review — and shares one Supabase client, stop event,
and signal handlers.
"""

import asyncio
import logging
import signal

from app.analysis.engine import build_analysis_engine
from app.analysis.queue import QUEUE_NAME as ANALYSIS_QUEUE
from app.analysis.worker import run_loop as run_analysis_loop
from app.archetype.engine import build_archetype_engine
from app.archetype.queue import QUEUE_NAME as ARCHETYPE_QUEUE
from app.archetype.worker import run_loop as run_archetype_loop
from app.config import get_settings
from app.supabase_client import get_supabase

logger = logging.getLogger("matedate.worker")


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    db = get_supabase()
    analysis_engine = build_analysis_engine(settings)
    archetype_engine = build_archetype_engine(settings)
    logger.info(
        "worker started (queues=%s, engines=%s/%s)",
        f"{ANALYSIS_QUEUE}+{ARCHETYPE_QUEUE}",
        type(analysis_engine).__name__,
        type(archetype_engine).__name__,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    try:
        await asyncio.gather(
            run_analysis_loop(db, settings, analysis_engine, stop),
            run_archetype_loop(db, settings, archetype_engine, stop),
        )
    finally:
        logger.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
