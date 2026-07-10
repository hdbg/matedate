"""Deterministic move classification.

The LLM produces a hidden 0-100 interest score; classification is derived *server-side*
from the resulting swing (SPEC §3: "classification maps eval delta → label"), so thresholds
stay tunable and the label is never left to the model. The vocabulary mirrors the frontend's
`MoveClassKey` in `frontend/app/lib/game/types.ts`.
"""

from typing import Literal, NamedTuple

from .database_types import PublicMoveKind

MoveClassKey = Literal["brilliant", "great", "good", "inaccuracy", "mistake", "blunder"]

# The eval is on a 0-100 interest scale; "swing" is expressed in chess-style pawns = delta / 10
# (so a +24 interest jump reads as +2.4, matching the frontend's suggestion fixtures).
EVAL_PER_PAWN = 10.0

# Baseline interest a persona starts a fresh conversation with.
START_EVAL = 50.0


class Grade(NamedTuple):
    class_key: MoveClassKey
    glyph: str
    quality: int  # 0-100 weight used for running accuracy
    move_kind: PublicMoveKind  # public.move_kind enum value stored in `moves.classification`


# key -> (glyph, quality, move_kind). Quality mirrors frontend MOVE_CLASSES.
_TABLE: dict[MoveClassKey, tuple[str, int, PublicMoveKind]] = {
    "brilliant": ("!!", 100, "Best"),
    "great": ("!", 88, "Excellent"),
    "good": ("✓", 74, "Good"),
    "inaccuracy": ("?!", 52, "Inaccuracy"),
    "mistake": ("?", 35, "Mistake"),
    "blunder": ("??", 12, "Blunder"),
}


def classify(swing: float) -> Grade:
    """Map a pawn-scale swing to a graded move. Monotonic ramp over SPEC §3 thresholds."""
    if swing >= 2.0:
        key: MoveClassKey = "brilliant"
    elif swing >= 1.0:
        key = "great"
    elif swing >= 0.2:
        key = "good"
    elif swing >= -1.0:
        key = "inaccuracy"
    elif swing >= -2.5:
        key = "mistake"
    else:
        key = "blunder"
    glyph, quality, move_kind = _TABLE[key]
    return Grade(key, glyph, quality, move_kind)


def swing_from_delta(eval_delta: float) -> float:
    return round(eval_delta / EVAL_PER_PAWN, 2)
