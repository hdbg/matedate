"""The archetype engine: one cheap PydanticAI agent supplies the *subjective* half.

Mirrors `app/analysis/engine.py` (Protocol + real OpenRouter engine + deterministic fake +
`build_*` factory). The model returns only what the deterministic side can't: the play-style
(1 of 4, which with the tier indexes the grid), a one-line flavor sentence referencing what the
player actually said, and the meme moment — up to 4 real transcript positions to render as the
shareable excerpt. It never names an archetype; the title is assembled server-side.
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
from .prompt import SYSTEM_PROMPT, build_user_prompt
from .vocab import LegendaryKey, Style, Tier

MAX_MEME_POSITIONS = 4


class ArchetypeVerdict(BaseModel):
    play_style: Style = Field(description="The dominant play-style: bold | smooth | dry | chaotic")
    flavor_reason: str = Field(
        min_length=1,
        max_length=200,
        description="One punchy sentence for the card, referencing what they actually said",
    )
    # The meme excerpt is a CONSECUTIVE window defined by a start + a downstream count, so it can
    # never skip a message (the server expands it into `meme_positions`).
    meme_start: int = Field(
        description="Transcript [position] of the FIRST message of the meme excerpt (You or Match)",
    )
    meme_after: int = Field(
        ge=0,
        le=MAX_MEME_POSITIONS - 1,
        description=f"How many messages AFTER meme_start to include (0-{MAX_MEME_POSITIONS - 1}); "
        f"the excerpt is that consecutive window (≤{MAX_MEME_POSITIONS} messages)",
    )


@dataclass(frozen=True)
class ArchetypeContext:
    rendered: str
    valid_positions: list[int]
    tier: Tier
    legendary: LegendaryKey | None


@dataclass
class ArchetypeResult:
    verdict: ArchetypeVerdict
    model: str
    latency_ms: int


class ArchetypeValidationError(ValueError):
    """The verdict's meme window doesn't line up with the transcript."""


def validate_verdict(verdict: ArchetypeVerdict, valid: list[int]) -> None:
    if verdict.meme_start not in set(valid):
        raise ArchetypeValidationError(f"meme_start {verdict.meme_start} is not a transcript position")


def expand_meme(verdict: ArchetypeVerdict, valid: list[int]) -> list[int]:
    """The consecutive window the excerpt renders: `meme_after + 1` messages from `meme_start`
    (capped at MAX_MEME_POSITIONS), clamped to the actual transcript."""
    ordered = sorted(valid)
    if not ordered:
        return []
    start = verdict.meme_start if verdict.meme_start in ordered else ordered[-MAX_MEME_POSITIONS]
    i = ordered.index(start)
    count = min(verdict.meme_after + 1, MAX_MEME_POSITIONS)
    return ordered[i : i + count]


class ArchetypeEngine(Protocol):
    async def classify(self, ctx: ArchetypeContext) -> ArchetypeResult: ...


class OpenRouterArchetypeEngine:
    """Real engine backed by a cheap OpenRouter model through PydanticAI."""

    def __init__(self, settings: Settings) -> None:
        self._model_name = settings.archetype_model
        self._model = OpenAIChatModel(
            settings.archetype_model,
            provider=OpenRouterProvider(api_key=settings.openrouter_api_key),
        )

    async def classify(self, ctx: ArchetypeContext) -> ArchetypeResult:
        agent: Agent[None, ArchetypeVerdict] = Agent(
            self._model,
            output_type=ArchetypeVerdict,
            system_prompt=SYSTEM_PROMPT,
        )

        @agent.output_validator
        def _check(output: ArchetypeVerdict) -> ArchetypeVerdict:
            try:
                validate_verdict(output, ctx.valid_positions)
            except ArchetypeValidationError as exc:
                raise ModelRetry(str(exc)) from exc
            return output

        start = time.monotonic()
        result = await agent.run(build_user_prompt(ctx))
        latency_ms = int((time.monotonic() - start) * 1000)
        return ArchetypeResult(verdict=result.output, model=self._model_name, latency_ms=latency_ms)


class FakeArchetypeEngine:
    """Deterministic offline engine so the whole flow runs without a live key (tests / FAKE_ENGINE).

    Style keys off simple content cues; the meme window is the last up-to-4 positions; the flavor
    is templated. Stable across runs.
    """

    @staticmethod
    def _style(rendered: str) -> Style:
        lowered = rendered.lower()
        if any(c in rendered for c in "😂😏🔥👀") or "lol" in lowered:
            return "chaotic"
        if any(word in lowered for word in ("date", "dinner", "drinks", "coffee")):
            return "bold"
        if len(rendered) < 120:
            return "dry"
        return "smooth"

    async def classify(self, ctx: ArchetypeContext) -> ArchetypeResult:
        start = time.monotonic()
        ordered = sorted(ctx.valid_positions)
        window = ordered[-MAX_MEME_POSITIONS:]
        verdict = ArchetypeVerdict(
            play_style=self._style(ctx.rendered),
            flavor_reason="A deterministic fake read: no live model was called.",
            meme_start=window[0] if window else 0,
            meme_after=max(0, len(window) - 1),
        )
        if window:
            validate_verdict(verdict, ctx.valid_positions)
        latency_ms = int((time.monotonic() - start) * 1000)
        return ArchetypeResult(verdict=verdict, model="fake-archetype-engine", latency_ms=latency_ms)


def build_archetype_engine(settings: Settings) -> ArchetypeEngine:
    if settings.fake_engine or not settings.openrouter_api_key:
        return FakeArchetypeEngine()
    return OpenRouterArchetypeEngine(settings)
