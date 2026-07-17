"""Deterministic half of the hybrid classification (SPEC §9.1).

The backend owns the precise, threshold-based decisions — the **accuracy tier** and the **four
legendary triggers** — so rarity stays under our control and the model can't invent titles. The
model only supplies the subjective **play-style** (which, with the tier, indexes the core grid),
the flavor line, and the meme moment (`engine.py`). Everything here is computed from the graded
You-moves the live game already produced; win/block are read off the eval "mating squares" (SPEC
§3), so this stays source-independent (solo game or one PvP side).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from ..config import Settings
from ..grading import MoveClassKey, classify, swing_from_delta
from .vocab import GRID, LEGENDARY_PRIORITY, ArchetypeKey, LegendaryKey, Style, Tier


@dataclass(frozen=True)
class GradedYouMove:
    """One player message with its server-derived grade — the unit the signals read."""

    position: int
    content: str
    eval_after: float
    eval_delta: float
    swing: float
    class_key: MoveClassKey

    @classmethod
    def build(cls, position: int, content: str, eval_after: float, eval_delta: float) -> GradedYouMove:
        swing = swing_from_delta(eval_delta)
        return cls(
            position=position,
            content=content,
            eval_after=eval_after,
            eval_delta=eval_delta,
            swing=swing,
            class_key=classify(swing, eval_after).class_key,
        )


def accuracy_tier(accuracy: float) -> Tier:
    """Accuracy % → tier band (SPEC §9.1: Low 0–39 · Shaky 40–59 · Solid 60–79 · High 80–100)."""
    if accuracy < 40:
        return "low"
    if accuracy < 60:
        return "shaky"
    if accuracy < 80:
        return "solid"
    return "high"


def detect_legendary(
    you: list[GradedYouMove], accuracy: float, settings: Settings
) -> LegendaryKey | None:
    """The rare overrides (SPEC §9.1). All thresholds are config knobs (tune to keep them rare).

    Win/block are read off the final move's eval bound (SPEC §3 mating squares): a checkmate win
    (eval ≥ 100) is a landed date, a checkmate loss (≤ 0) a block — no end_reason needed.
    """
    if not you:
        return None
    last = you[-1]
    is_win = last.eval_after >= 100
    n = len(you)

    # The Brilliancy — a "!!" move (big positive swing) that looked like a risky sacrifice. This
    # is a mid-game brilliant line, not the finishing move: a date-landing close is a
    # checkmate_win (that's Scholar's Mate territory), so only the "brilliant" rank counts here.
    brilliancy = any(
        m.class_key == "brilliant" and m.swing >= settings.archetype_brilliancy_swing for m in you
    )
    # Scholar's Mate — the famous 4-move mate: a positive close in ≤N messages at high accuracy.
    scholars = (
        is_win
        and n <= settings.archetype_scholars_max_messages
        and accuracy >= settings.archetype_scholars_min_accuracy
    )
    # The Comeback — near-dead (an interior eval dipped low) then recovered to a win / a high close.
    min_eval = min(m.eval_after for m in you)
    comeback = min_eval <= settings.archetype_comeback_low and (
        is_win or last.eval_after >= settings.archetype_comeback_recover
    )
    # The Massacre — a total wipe: rock-bottom accuracy, or almost every move a Blunder.
    blunders = sum(1 for m in you if m.class_key == "blunder")
    massacre = accuracy < settings.archetype_massacre_max_accuracy or (
        blunders / n >= settings.archetype_massacre_blunder_ratio
    )

    fired: dict[LegendaryKey, bool] = {
        "the_brilliancy": brilliancy,
        "scholars_mate": scholars,
        "the_comeback": comeback,
        "the_massacre": massacre,
    }
    for key in LEGENDARY_PRIORITY:
        if fired[key]:
            return key
    return None


def resolve_key(tier: Tier, style: Style, legendary: LegendaryKey | None) -> tuple[ArchetypeKey, bool]:
    """Assemble the final identity: a legendary always beats the tier×style grid cell."""
    if legendary is not None:
        return legendary, True
    return GRID[style][tier], False


def fallback_style(you: list[GradedYouMove]) -> Style:
    """A deterministic play-style for the LLM-failure path (SPEC §9.1 axes minus humor, which
    needs the model). High swing variance → chaotic; terse → dry; long + positive → bold; else
    smooth."""
    if not you:
        return "smooth"
    swings = [m.swing for m in you]
    variance = statistics.pvariance(swings) if len(swings) > 1 else 0.0
    mean_len = statistics.mean(len(m.content) for m in you)
    mean_swing = statistics.mean(swings)
    if variance >= 4.0:
        return "chaotic"
    if mean_len < 20:
        return "dry"
    if mean_swing >= 1.0:
        return "bold"
    return "smooth"
