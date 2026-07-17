"""Load a finished game / PvP side into the shape the archetype pass needs.

Unlike the analysis `Transcript` (text only), classification needs the graded You-moves (evals)
and the conversation accuracy. This reads the source once and builds both the rendered transcript
(for the model) and the `GradedYouMove` list + accuracy (for the deterministic signals). Source
XOR: a solo game (`moves` + `games.accuracy`) or one PvP side (`match_moves` + `pvp_matches`).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, cast

from supabase import AsyncClient

from ..database_types import PublicMatchMoves, PublicMatchSide, PublicMoves
from ..grading import START_EVAL, accuracy_from_qualities, classify, swing_from_delta
from .classify import GradedYouMove


@dataclass(frozen=True)
class ArchetypeInput:
    rendered: str  # "[<pos>] You/Match: <text>" lines — the model echoes positions back
    valid_positions: list[int]  # every message position (the meme window may span both speakers)
    you: list[GradedYouMove]
    accuracy: float


def _render(rows: list[tuple[int, str, str]]) -> str:
    return "\n".join(f"[{pos}] {side}: {content}" for pos, side, content in rows)


def _accuracy_from(you: list[GradedYouMove]) -> float:
    """Recompute conversation accuracy from move quality (fallback when none is stored)."""
    qualities = [classify(m.swing, m.eval_after).quality for m in you]
    return accuracy_from_qualities(qualities, len(qualities))


async def load_game_input(db: AsyncClient, game_id: uuid.UUID) -> ArchetypeInput:
    moves_res = await (
        db.table("moves").select("*").eq("game_id", str(game_id)).order("position").execute()
    )
    moves = [PublicMoves.model_validate(m) for m in (moves_res.data or [])]
    game_res = await (
        db.table("games").select("accuracy").eq("id", str(game_id)).maybe_single().execute()
    )
    stored = cast("dict[str, Any] | None", game_res.data if game_res else None)
    you = _graded_you([(m.position, m.side, m.content, m.eval_after, m.eval_delta) for m in moves])
    accuracy = float(stored["accuracy"]) if stored and stored.get("accuracy") is not None else _accuracy_from(you)
    rendered = _render([(m.position, m.side, m.content) for m in moves])
    return ArchetypeInput(
        rendered=rendered,
        valid_positions=[m.position for m in moves],
        you=you,
        accuracy=accuracy,
    )


async def load_match_input(
    db: AsyncClient, match_id: uuid.UUID, side: PublicMatchSide
) -> ArchetypeInput:
    moves_res = await (
        db.table("match_moves")
        .select("*")
        .eq("match_id", str(match_id))
        .eq("side", side)
        .order("position")
        .execute()
    )
    moves = [PublicMatchMoves.model_validate(m) for m in (moves_res.data or [])]
    match_res = await (
        db.table("pvp_matches")
        .select("player_a_accuracy, player_b_accuracy")
        .eq("match_id", str(match_id))
        .maybe_single()
        .execute()
    )
    stored = cast("dict[str, Any] | None", match_res.data if match_res else None)
    col = "player_a_accuracy" if side == "a" else "player_b_accuracy"
    you = _graded_you(
        [(m.position, m.speaker, m.content, m.eval_after, m.eval_delta) for m in moves]
    )
    accuracy = (
        float(stored[col]) if stored and stored.get(col) is not None else _accuracy_from(you)
    )
    rendered = _render([(m.position, m.speaker, m.content) for m in moves])
    return ArchetypeInput(
        rendered=rendered,
        valid_positions=[m.position for m in moves],
        you=you,
        accuracy=accuracy,
    )


def _graded_you(
    rows: list[tuple[int, str, str, float | None, float | None]],
) -> list[GradedYouMove]:
    """Build GradedYouMove for the You-side messages, chaining eval_before off START_EVAL when a
    stored eval is missing (mirrors the analysis eval chain)."""
    you: list[GradedYouMove] = []
    prev = START_EVAL
    for position, side, content, eval_after, eval_delta in rows:
        if side != "You":
            continue
        after = eval_after if eval_after is not None else prev
        delta = eval_delta if eval_delta is not None else round(after - prev, 2)
        you.append(GradedYouMove.build(position, content, after, delta))
        prev = after
    return you
