"""Manually enqueue a finished game for deep analysis.

Dev/testing helper until the request UI exists. Run from `backend/` so `.env` loads:

    uv run python scripts/enqueue_analysis.py <game-id> [--force]
    uv run python scripts/enqueue_analysis.py --latest [--force]   # most recent completed game
"""

from __future__ import annotations

import argparse
import asyncio
import uuid
from typing import Any, cast

from app.analysis import EnqueueError, enqueue_game_analysis
from app.supabase_client import get_supabase


async def _latest_completed_game_id() -> uuid.UUID | None:
    db = get_supabase()
    res = await (
        db.table("games")
        .select("id")
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = cast("list[dict[str, Any]]", res.data or [])
    return uuid.UUID(rows[0]["id"]) if rows else None


async def amain(game_id: str | None, latest: bool, force: bool) -> None:
    if latest:
        resolved = await _latest_completed_game_id()
        if resolved is None:
            raise SystemExit("no completed games found")
    elif game_id:
        resolved = uuid.UUID(game_id)
    else:
        raise SystemExit("pass a <game-id> or --latest")

    db = get_supabase()
    try:
        job_id = await enqueue_game_analysis(db, resolved, force=force)
    except EnqueueError as exc:
        raise SystemExit(f"cannot enqueue: {exc}") from exc
    print(f"enqueued analysis job {job_id} for game {resolved}")
    print("run `task worker` (or `uv run python worker.py`) to process it")


def main() -> None:
    parser = argparse.ArgumentParser(description="Enqueue a finished game for deep analysis.")
    parser.add_argument("game_id", nargs="?", help="UUID of a completed game")
    parser.add_argument("--latest", action="store_true", help="use the most recent completed game")
    parser.add_argument("--force", action="store_true", help="allow re-analysis of the same game")
    args = parser.parse_args()
    asyncio.run(amain(args.game_id, args.latest, args.force))


if __name__ == "__main__":
    main()
