"""Pure wire mappers shared by the solo and PvP services.

Both services speak the same conversation shapes (a You/Match thread graded off START_EVAL)
but persist to different tables (`moves` vs `match_moves`, whose speaker column is named
`side` vs `speaker`), so these helpers take plain fields rather than a row model.
"""

from __future__ import annotations

from collections.abc import Iterable

from .database_types import PublicMessageSide
from .grading import START_EVAL, classify, swing_from_delta
from .personas import HIDDEN_HINT, Persona
from .protocol import MoveOut, PersonaOut

# End reasons whose enum value doesn't read well through a bare .capitalize().
END_REASON_LABELS: dict[str, str] = {"date_landed": "Date landed"}


def persona_out(persona: Persona) -> PersonaOut:
    return PersonaOut(
        slug=persona.slug,
        name=persona.name,
        hint=HIDDEN_HINT,
        opening_line=persona.opening_line,
        suggested_messages=persona.suggested_messages,
    )


def move_out(
    position: int,
    speaker: PublicMessageSide,
    content: str,
    eval_delta: float | None,
    eval_after: float | None,
) -> MoveOut:
    if speaker == "You":
        swing = swing_from_delta(eval_delta or 0.0)
        return MoveOut(
            position=position,
            side="You",
            content=content,
            classification=classify(swing, eval_after).class_key,
            swing=swing,
        )
    return MoveOut(position=position, side="Match", content=content)


def last_eval(you_deltas: Iterable[float]) -> float:
    """Reconstruct the running eval from the You-side deltas off the baseline."""
    deltas = list(you_deltas)
    if not deltas:
        return START_EVAL
    return max(0.0, min(100.0, START_EVAL + sum(deltas)))


def transcript_text(moves: Iterable[tuple[PublicMessageSide, str]], persona_name: str) -> str:
    """Format (speaker, content) pairs for the engine prompt."""
    return "\n".join(
        f"{'You' if speaker == 'You' else persona_name}: {content}" for speaker, content in moves
    )
