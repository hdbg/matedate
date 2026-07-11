"""The deep-analysis engine: one PydanticAI agent returns a full game review.

Mirrors `app/engine.py`: a Protocol, a real OpenRouter-backed engine, a deterministic
`FakeAnalysisEngine`, and a `build_analysis_engine()` factory gated by settings. The verdict is
validated against the transcript (positions must line up; a non-top move must carry a best line)
both as a PydanticAI output validator (one in-run self-correction) and as a plain check reused by
the fake engine and the persistence path.
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
from ..database_types import PublicMoveKind
from .prompt import SYSTEM_PROMPT, build_user_prompt
from .transcript import Transcript, TranscriptMove

# The only rank that needs no "best line" — the move is already the strongest option.
TOP_GRADE: PublicMoveKind = "Best"


class MoveAnalysis(BaseModel):
    position: int = Field(ge=0, description="Exact transcript position of the You-side message")
    classification: PublicMoveKind = Field(description="One rank from the move vocabulary")
    comment: str = Field(min_length=1, description="1-2 sentence chess-annotator note")
    best_line: str | None = Field(
        default=None,
        description="A better message the user could have sent; required unless classification is Best",
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


class AnalysisValidationError(ValueError):
    """The verdict doesn't line up with the transcript it was produced for."""


def validate_verdict(verdict: GameAnalysisVerdict, transcript: Transcript) -> None:
    """Raise AnalysisValidationError unless the verdict annotates exactly the You-side moves
    (by position) and every non-top move carries a best line."""
    expected = sorted(m.position for m in transcript.you_moves)
    got = sorted(m.position for m in verdict.moves)
    if got != expected:
        raise AnalysisValidationError(
            f"annotated positions {got} do not match the You-side positions {expected}"
        )
    for move in verdict.moves:
        if move.classification != TOP_GRADE and not (move.best_line and move.best_line.strip()):
            raise AnalysisValidationError(
                f"move at position {move.position} is {move.classification} but has no best_line"
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

    Classification is derived purely from each You-move's content (mirroring FakeEngine's
    heuristics) so tests are stable.
    """

    @staticmethod
    def _classify(content: str) -> PublicMoveKind:
        text = content.strip()
        lowered = text.lower()
        if any(word in lowered for word in ("creep", "gross", "block", "unmatch")):
            return "Blunder"
        if len(text) < 6 or lowered.split(" ", 1)[0] in {"idk", "lol", "k", "hey", "hi", "sup", "yo"}:
            return "Mistake"
        if text.endswith("?") or len(text) > 40 or any(c in text for c in "😂😏🔥⚖️👀"):
            return "Best"
        return "Good"

    def _move(self, tm: TranscriptMove) -> MoveAnalysis:
        kind = self._classify(tm.content)
        comment = f"Fake review: this line reads as a {kind}."
        best_line = None if kind == TOP_GRADE else f"Try more spark than: {tm.content[:40]}"
        return MoveAnalysis(
            position=tm.position, classification=kind, comment=comment, best_line=best_line
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
