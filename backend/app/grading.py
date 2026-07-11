"""Deterministic move classification.

The LLM produces a hidden 0-100 interest score; classification is derived *server-side*
from the resulting swing (SPEC §3: "classification maps eval delta → label"), so thresholds
stay tunable and the label is never left to the model. Nothing persists the label — every move
table stores the numeric eval only, and this ramp derives the rank on read. The vocabulary
mirrors the frontend's `MoveClassKey` in `frontend/app/lib/game/types.ts`.

Checkmate is the one class that isn't on the delta ramp: the eval bounds are "mating squares"
(SPEC §3) — an eval at 100 means the date was landed (checkmate win), at 0 the persona blocked
(checkmate loss). Both end the game, and both are still derived from the number, never the model.
"""

from typing import Literal, NamedTuple

MoveClassKey = Literal[
    "checkmate_win",
    "brilliant",
    "great",
    "good",
    "inaccuracy",
    "mistake",
    "blunder",
    "checkmate_loss",
]

# Ranks that need no "best line": the move is already the strongest option (or the game was won
# outright), so analysis persists no reveal and validation demands no alternative.
NO_BEST_LINE_CLASSES: frozenset[MoveClassKey] = frozenset({"brilliant", "checkmate_win"})

# The eval is on a 0-100 interest scale; "swing" is expressed in chess-style pawns = delta / 10
# (so a +24 interest jump reads as +2.4, matching the frontend's suggestion fixtures).
EVAL_PER_PAWN = 10.0

# Baseline interest a persona starts a fresh conversation with.
START_EVAL = 50.0


class Grade(NamedTuple):
    class_key: MoveClassKey
    glyph: str
    quality: int  # 0-100 weight used for running accuracy


# key -> (glyph, quality). Quality mirrors frontend MOVE_CLASSES.
_TABLE: dict[MoveClassKey, tuple[str, int]] = {
    "checkmate_win": ("#", 100),
    "brilliant": ("!!", 96),
    "great": ("!", 85),
    "good": ("✓", 70),
    "inaccuracy": ("?!", 50),
    "mistake": ("?", 30),
    "blunder": ("??", 10),
    "checkmate_loss": ("#", 0),
}


def classify(swing: float, eval_after: float | None = None) -> Grade:
    """Map a pawn-scale swing to a graded move. Monotonic ramp over SPEC §3 thresholds,
    except the terminal checkmates, which key off the eval hitting a bound."""
    if eval_after is not None and eval_after >= 100:
        key: MoveClassKey = "checkmate_win"
    elif eval_after is not None and eval_after <= 0:
        key = "checkmate_loss"
    elif swing >= 2.5:
        key = "brilliant"
    elif swing >= 1.2:
        key = "great"
    elif swing >= 0.2:
        key = "good"
    elif swing >= -0.8:
        key = "inaccuracy"
    elif swing >= -2.0:
        key = "mistake"
    else:
        key = "blunder"
    glyph, quality = _TABLE[key]
    return Grade(key, glyph, quality)


def swing_from_delta(eval_delta: float) -> float:
    return round(eval_delta / EVAL_PER_PAWN, 2)
