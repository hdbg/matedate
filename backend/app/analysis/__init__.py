"""Post-game deep analysis: a pgmq-backed worker that reviews a finished game with a
stronger model and writes a source-independent report (title/description/tags + per-move
comments and best-lines) into `game_analyses` / `game_analysis_moves`.

Public surface: `enqueue_game_analysis` (put a completed game on the queue) and
`build_analysis_engine` (the fake/real engine factory).
"""

from __future__ import annotations

from .engine import build_analysis_engine
from .service import EnqueueError, enqueue_game_analysis

__all__ = ["build_analysis_engine", "enqueue_game_analysis", "EnqueueError"]
