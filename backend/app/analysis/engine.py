"""The deep-analysis engine: one PydanticAI agent returns a full game review.

Mirrors `app/engine.py`: a Protocol, a real OpenRouter-backed engine, a deterministic
`FakeAnalysisEngine`, and a `build_analysis_engine()` factory gated by settings.

Move quality is a **numeric eval score**, never a category label the model picks: the model
emits a fresh 0-100 interest score per You-move (exactly like the live engine's hidden eval), and
the server derives the Brilliant…Blunder rank from the resulting swing via `app/grading.py`.
Evals chain across the You-moves off `START_EVAL` (the Match replies carry none), so each move's
delta is `eval_after - <previous You eval_after>`. The verdict is validated against the transcript
(positions must line up; a non-top move must carry a best line) both as a PydanticAI output
validator (one in-run self-correction) and as a plain check reused by the fake engine and the
persistence path.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from ..config import Settings
from ..grading import NO_BEST_LINE_CLASSES, START_EVAL, MoveClassKey, classify, swing_from_delta
from .prompt import SYSTEM_PROMPT, build_user_prompt
from .transcript import Transcript, TranscriptMove


class MoveAnalysis(BaseModel):
    position: int = Field(ge=0, description="Exact transcript position of the You-side message")
    eval_after: float = Field(
        description="Fresh 0-100 interest score for the Match after this You message "
        "(higher = more into it); the server derives the move's rank from the swing",
    )
    comment: str = Field(min_length=1, description="1-2 sentence chess-annotator note")
    best_line: str | None = Field(
        default=None,
        description="A better message the user could have sent; required unless this is the "
        "strongest move (a big positive swing)",
    )


class GameAnalysisVerdict(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list, max_length=8)
    moves: list[MoveAnalysis]


@dataclass
class AnalysisResult:
    verdict: GameAnalysisVerdict
    model: str
    latency_ms: int


@dataclass(frozen=True)
class GradedMove:
    """A You-move re-scored by the analysis, with the rank derived server-side from the eval."""

    position: int
    eval_before: float
    eval_after: float
    eval_delta: float
    class_key: MoveClassKey
    comment: str
    best_line: str | None  # the model's raw suggestion (nulled for top moves at persist time)


class AnalysisValidationError(ValueError):
    """The verdict doesn't line up with the transcript it was produced for."""


def _clamp_eval(value: float) -> float:
    return max(0.0, min(100.0, value))


def grade_moves(verdict: GameAnalysisVerdict, transcript: Transcript) -> list[GradedMove]:
    """Chain the model's per-move evals into deltas and derive each move's rank.

    The eval trajectory runs over the You-moves in order, starting from `START_EVAL` (Match
    replies carry no eval), so `eval_delta = eval_after - <previous You eval_after>` — the same
    reconstruction the live game uses. Assumes positions already match (validate first).

    The eval bounds are mating squares (SPEC §3): only the *final* You-move may sit on 0/100
    and grade as a checkmate — interior evals are pinched to [1, 99] so a conversation that
    demonstrably continued can't contain a game-ending move.
    """
    by_position = {m.position: m for m in verdict.moves}
    graded: list[GradedMove] = []
    prev_eval = START_EVAL
    last_position = transcript.you_moves[-1].position if transcript.you_moves else None
    for you_move in transcript.you_moves:
        move = by_position[you_move.position]
        eval_after = _clamp_eval(move.eval_after)
        if you_move.position != last_position:
            eval_after = max(1.0, min(99.0, eval_after))
        eval_delta = round(eval_after - prev_eval, 2)
        class_key = classify(swing_from_delta(eval_delta), eval_after).class_key
        graded.append(
            GradedMove(
                position=you_move.position,
                eval_before=round(prev_eval, 2),
                eval_after=eval_after,
                eval_delta=eval_delta,
                class_key=class_key,
                best_line=move.best_line,
                comment=move.comment,
            )
        )
        prev_eval = eval_after
    return graded


def validate_verdict(verdict: GameAnalysisVerdict, transcript: Transcript) -> None:
    """Raise AnalysisValidationError unless the verdict annotates exactly the You-side moves
    (by position) and every non-top move carries a best line."""
    expected = sorted(m.position for m in transcript.you_moves)
    got = sorted(m.position for m in verdict.moves)
    if got != expected:
        raise AnalysisValidationError(
            f"annotated positions {got} do not match the You-side positions {expected}"
        )
    for move in grade_moves(verdict, transcript):
        if move.class_key not in NO_BEST_LINE_CLASSES and not (
            move.best_line and move.best_line.strip()
        ):
            raise AnalysisValidationError(
                f"move at position {move.position} graded {move.class_key} but has no best_line"
            )


class AnalysisEngine(Protocol):
    async def analyze(self, transcript: Transcript) -> AnalysisResult: ...


class OpenRouterAnalysisEngine:
    """Real engine backed by a (stronger) OpenRouter model through PydanticAI."""

    def __init__(self, settings: Settings) -> None:
        self._model_name = settings.analysis_model
        self._model = OpenAIChatModel(
            settings.analysis_model,
            provider=OpenRouterProvider(api_key=settings.openrouter_api_key),
        )

    async def analyze(self, transcript: Transcript) -> AnalysisResult:
        agent: Agent[None, GameAnalysisVerdict] = Agent(
            self._model,
            output_type=GameAnalysisVerdict,
            system_prompt=SYSTEM_PROMPT,
        )

        @agent.output_validator
        def _check(output: GameAnalysisVerdict) -> GameAnalysisVerdict:
            try:
                validate_verdict(output, transcript)
            except AnalysisValidationError as exc:
                raise ModelRetry(str(exc)) from exc
            return output

        start = time.monotonic()
        result = await agent.run(build_user_prompt(transcript))
        latency_ms = int((time.monotonic() - start) * 1000)
        return AnalysisResult(verdict=result.output, model=self._model_name, latency_ms=latency_ms)


class FakeAnalysisEngine:
    """Deterministic offline engine so the full analysis flow runs without a live LLM key.

    The eval score is derived purely from each You-move's content (mirroring FakeEngine's
    heuristics) so tests are stable. Scores are chosen well above/below `START_EVAL` so the
    derived rank spans brilliant…blunder.
    """

    @staticmethod
    def _eval_after(content: str) -> float:
        text = content.strip()
        lowered = text.lower()
        if any(word in lowered for word in ("creep", "gross", "block", "unmatch")):
            return 0.0  # mating square → checkmate loss on the final move (else pinched to 1)
        if any(word in lowered for word in ("date", "dinner", "drinks", "coffee")):
            return 100.0  # mating square → checkmate win on the final move (else pinched to 99)
        if len(text) < 6 or lowered.split(" ", 1)[0] in {"idk", "lol", "k", "hey", "hi", "sup", "yo"}:
            return 40.0  # negative swing → mistake/inaccuracy
        if text.endswith("?") or len(text) > 40 or any(c in text for c in "😂😏🔥⚖️👀"):
            return 80.0  # big positive swing → brilliant
        return 58.0  # mild positive → good

    def _move(self, tm: TranscriptMove) -> MoveAnalysis:
        eval_after = self._eval_after(tm.content)
        # Always supply a best_line; the persist path nulls it for top moves. This keeps the fake
        # verdict valid regardless of where each move lands on the eval chain.
        return MoveAnalysis(
            position=tm.position,
            eval_after=eval_after,
            comment=f"Fake review: this line scores {eval_after:.0f}/100 interest.",
            best_line=f"Try more spark than: {tm.content[:40]}",
        )

    async def analyze(self, transcript: Transcript) -> AnalysisResult:
        start = time.monotonic()
        you = transcript.you_moves
        verdict = GameAnalysisVerdict(
            title=f"The Offline Gambit ({len(you)} moves)",
            description=(
                "A deterministic fake review: no live model was called. "
                f"Reviewed {len(you)} of your messages across {len(transcript.moves)} total."
            ),
            tags=["fake", "offline"],
            moves=[self._move(tm) for tm in you],
        )
        validate_verdict(verdict, transcript)
        latency_ms = int((time.monotonic() - start) * 1000)
        return AnalysisResult(verdict=verdict, model="fake-analysis-engine", latency_ms=latency_ms)


def build_analysis_engine(settings: Settings) -> AnalysisEngine:
    if settings.fake_engine or not settings.openrouter_api_key:
        return FakeAnalysisEngine()
    return OpenRouterAnalysisEngine(settings)
