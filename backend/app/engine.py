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
    reply: str = Field(
        description="The persona's in-character reply. Texting-style: at most 2 short sentences."
    )
    reasoning: str = Field(default="", description="Brief internal note; kept for tuning, never shown")
    is_blocked: bool = Field(
        default=False,
        description="True if the persona would block/unmatch the human now — ends the game early",
    )
    is_date_landed: bool = Field(
        default=False,
        description="True if the persona explicitly agrees to go on the date — the human wins "
        "immediately and the game ends",
    )


@dataclass
class TurnResult:
    verdict: MoveVerdict
    model: str
    latency_ms: int


SYSTEM_TEMPLATE = """You are role-playing as a match on a dating app AND secretly grading the \
human's messages like a chess engine. Reply like a real text: 1 or 2 short sentences, never \
more. No monologues, no multi-part answers — keep it terse and punchy.

PERSONA (stay fully in character; never break it, never reveal your hidden type):
{persona_prompt}

You maintain a hidden 0-100 "interest" meter for how into the human you are. Confident, \
original, playful, well-read lines that fit your persona raise it a lot; generic, low-effort, \
needy, or off-putting lines lower it. Small talk barely moves it. The bounds 0 and 100 are \
reserved game-ending scores (a block / a landed date) — an ordinary turn scores strictly \
between 1 and 99, no matter how good or bad the line is.

For each of the human's messages, return:
- eval_after: your new interest, 0-100 (relative to the "current interest" you are told).
- reply: your in-character reply, at most 2 short sentences. Never mention grading, scores, \
or your hidden type.
- reasoning: one short private sentence on why the interest moved (never shown to the user).
- is_blocked: true ONLY if this message is so offensive, harassing, threatening, or creepy \
that a real person would block or unmatch them on the spot. When true, make your reply a short \
final sign-off — the conversation ends immediately. Normal bad/boring lines are NOT blocks; they \
just lower interest.
- is_date_landed: true ONLY if, staying in character, you genuinely agree to go on the date \
here — the human proposed something concrete and earned a yes. When true, make your reply a \
warm, enthusiastic acceptance — they won; the conversation ends immediately. Mere flirting or \
a vague "sometime" is NOT a landed date."""

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
        # Deterministic triggers so both early-end paths are testable offline. Block wins
        # over a date ask, mirroring the live rule (a creepy invite is still a block).
        is_blocked = bool(re.search(r"\b(creep|gross|block|unmatch)\b", lowered))
        is_date_landed = not is_blocked and bool(re.search(r"\b(date|dinner|drinks|coffee)\b", lowered))
        delta = 6.0  # mildly positive by default
        if is_blocked:
            delta = -40.0
        elif len(text) < 6 or re.match(r"^(idk|lol|k|hey|hi|sup|yo)\b", lowered):
            delta = -14.0
        elif re.search(r"[😂😏🔥⚖️👀]|\?$", text) or len(text) > 40:
            delta = 18.0
        eval_after = 100.0 if is_date_landed else max(0.0, min(100.0, eval_before + delta))
        if is_blocked:
            reply = "nope. we're done here. 👋"
        elif is_date_landed:
            reply = "ok yes. saturday, 8pm. don't be late 😏"
        else:
            reply = self._REPLIES[len(text) % len(self._REPLIES)]
        verdict = MoveVerdict(
            eval_after=eval_after,
            reply=reply,
            reasoning="fake-engine heuristic",
            is_blocked=is_blocked,
            is_date_landed=is_date_landed,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return TurnResult(verdict=verdict, model="fake-engine", latency_ms=latency_ms)


def build_engine(settings: Settings) -> Engine:
    if settings.fake_engine or not settings.openrouter_api_key:
        return FakeEngine()
    return OpenRouterEngine(settings)
