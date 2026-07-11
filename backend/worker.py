"""Game-analysis worker entrypoint. Run with `uv run python worker.py` (or `task worker`)."""

import asyncio

from app.analysis.worker import main

if __name__ == "__main__":
    asyncio.run(main())
