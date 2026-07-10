"""The scoring/reply engine: one combined LLM turn returning a typed verdict.

A single PydanticAI agent both role-plays the persona's reply and rates the player's latest
message on a hidden 0-100 interest scale (one round-trip, lower latency). Provider-agnostic via
OpenRouter. A deterministic `FakeEngine` mirrors the interface for offline dev/tests.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from .config import Settings


class MoveVerdict(BaseModel):
    """Structured output for a single graded turn."""

    eval_after: float = Field(ge=0, le=100, description="Persona's hidden interest after this message")
    reply: str = Field(description="The persona's in-character reply, texting-style and short")
    reasoning: str = Field(default="", description="Brief internal note; kept for tuning, never shown")
    is_blocked: bool = Field(
        default=False,
        description="True if the persona would block/unmatch the human now — ends the game early",
    )


@dataclass
class TurnResult:
    verdict: MoveVerdict
    model: str
    latency_ms: int


SYSTEM_TEMPLATE = """You are role-playing as a match on a dating app AND secretly grading the \
human's messages like a chess engine.

PERSONA (stay fully in character; never break it, never reveal your hidden type):
{persona_prompt}

You maintain a hidden 0-100 "interest" meter for how into the human you are. Confident, \
original, playful, well-read lines that fit your persona raise it a lot; generic, low-effort, \
needy, or off-putting lines lower it. Small talk barely moves it.

For each of the human's messages, return:
- eval_after: your new interest, 0-100 (relative to the "current interest" you are told).
- reply: your in-character reply. Keep it short and text-like. Never mention grading, scores, \
or your hidden type.
- reasoning: one short private sentence on why the interest moved (never shown to the user).
- is_blocked: true ONLY if this message is so offensive, harassing, threatening, or creepy \
that a real person would block or unmatch them on the spot. When true, make your reply a short \
final sign-off — the conversation ends immediately. Normal bad/boring lines are NOT blocks; they \
just lower interest."""

USER_TEMPLATE = """Conversation so far:
{transcript}

The human just sent this new message — grade THIS message:
"{content}"

Current hidden interest before this message: {eval_before:.0f}/100.
Return your new eval_after, your in-character reply, and brief reasoning."""


class Engine(Protocol):
    async def run_turn(
        self, persona_prompt: str, transcript: str, content: str, eval_before: float
    ) -> TurnResult: ...


class OpenRouterEngine:
    """Real engine backed by an OpenRouter model through PydanticAI."""

    def __init__(self, settings: Settings) -> None:
        self._model_name = settings.openrouter_model
        self._model = OpenAIChatModel(
            settings.openrouter_model,
            provider=OpenRouterProvider(api_key=settings.openrouter_api_key),
        )

    async def run_turn(
        self, persona_prompt: str, transcript: str, content: str, eval_before: float
    ) -> TurnResult:
        agent: Agent[None, MoveVerdict] = Agent(
            self._model,
            output_type=MoveVerdict,
            system_prompt=SYSTEM_TEMPLATE.format(persona_prompt=persona_prompt),
        )
        prompt = USER_TEMPLATE.format(
            transcript=transcript or "(no messages yet)",
            content=content,
            eval_before=eval_before,
        )
        start = time.monotonic()
        result = await agent.run(prompt)
        latency_ms = int((time.monotonic() - start) * 1000)
        return TurnResult(verdict=result.output, model=self._model_name, latency_ms=latency_ms)


class FakeEngine:
    """Deterministic offline engine so the full flow runs without a live LLM key."""

    _REPLIES = [
        "ok that's actually kind of good, go on 👀",
        "hmm. bold. i'll allow it.",
        "lol you're trying. respect.",
        "wait that's genuinely funny",
        "idk about that one chief",
    ]

    async def run_turn(
        self, persona_prompt: str, transcript: str, content: str, eval_before: float
    ) -> TurnResult:
        start = time.monotonic()
        text = content.strip()
        lowered = text.lower()
        # Deterministic block trigger so the early-end path is testable offline.
        is_blocked = bool(re.search(r"\b(creep|gross|block|unmatch)\b", lowered))
        delta = 6.0  # mildly positive by default
        if is_blocked:
            delta = -40.0
        elif len(text) < 6 or re.match(r"^(idk|lol|k|hey|hi|sup|yo)\b", lowered):
            delta = -14.0
        elif re.search(r"[😂😏🔥⚖️👀]|\?$", text) or len(text) > 40:
            delta = 18.0
        eval_after = max(0.0, min(100.0, eval_before + delta))
        reply = "nope. we're done here. 👋" if is_blocked else self._REPLIES[len(text) % len(self._REPLIES)]
        verdict = MoveVerdict(
            eval_after=eval_after, reply=reply, reasoning="fake-engine heuristic", is_blocked=is_blocked
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return TurnResult(verdict=verdict, model="fake-engine", latency_ms=latency_ms)


def build_engine(settings: Settings) -> Engine:
    if settings.fake_engine or not settings.openrouter_api_key:
        return FakeEngine()
    return OpenRouterEngine(settings)
