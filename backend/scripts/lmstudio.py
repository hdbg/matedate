"""Shared LM Studio plumbing for the offline content-generation scripts.

LM Studio (https://lmstudio.ai/docs/developer/rest) serves both of its local HTTP APIs on
one port (default 1234):

- the native REST API (`GET /api/v1/models`) — used to list downloaded LLMs so the
  operator can pick one interactively;
- the OpenAI-compat API (`POST /v1/chat/completions`) — used for the generation itself,
  because it supports grammar-constrained structured output via
  `response_format: json_schema` (llama.cpp grammars / Outlines), which keeps small local
  models on-schema.

Nothing here touches the live game engine (that stays on OpenRouter); these helpers exist
only for authoring content (`generate_personas.py` / `generate_puzzles.py`).
"""

from __future__ import annotations

import asyncio
import os
import random
import re
import sys
from collections.abc import Awaitable, Iterable
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

DEFAULT_BASE_URL = "http://127.0.0.1:1234"

# Reasoning models emit a think block before the constrained JSON; strip it before parsing.
_THINK_RE = re.compile(r"^\s*<think>.*?</think>\s*", re.DOTALL)


class LMStudioError(RuntimeError):
    """LM Studio is unreachable or kept returning output that fails validation."""


class LMStudioClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (
            base_url or os.environ.get("LMSTUDIO_BASE_URL") or DEFAULT_BASE_URL
        ).rstrip("/")
        # Local generation on a big model can be slow; connect fails fast when the
        # server isn't running at all.
        self._http = httpx.AsyncClient(
            base_url=self.base_url, timeout=httpx.Timeout(600.0, connect=5.0)
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def list_llm_keys(self) -> list[str]:
        """Model keys of the downloaded LLMs (embedding models filtered out)."""
        try:
            resp = await self._http.get("/api/v1/models")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise LMStudioError(
                f"cannot list models at {self.base_url} — is the LM Studio server running? ({exc})"
            ) from exc
        body: dict[str, Any] = resp.json()
        # Tolerate both the native shape ({"models": [{"key", "type", ...}]}) and the
        # OpenAI-style one ({"data": [{"id", ...}]}) across LM Studio versions.
        items: list[dict[str, Any]] = body.get("models") or body.get("data") or []
        keys: list[str] = []
        for item in items:
            if str(item.get("type", "")).startswith("embedding"):
                continue
            key = item.get("key") or item.get("id")
            if key:
                keys.append(str(key))
        return keys

    async def generate[T: BaseModel](
        self,
        *,
        model: str,
        output_type: type[T],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.8,
        max_attempts: int = 3,
    ) -> T:
        """One structured completion, parsed and validated into `output_type`.

        The schema rides as `response_format: json_schema`, so decoding is grammar-
        constrained; validation failures (e.g. numeric ranges grammars can't express)
        are retried up to `max_attempts` times.
        """
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": output_type.__name__,
                    "strict": True,
                    "schema": output_type.model_json_schema(),
                },
            },
        }
        last_error: Exception | None = None
        for _ in range(max_attempts):
            try:
                resp = await self._http.post("/v1/chat/completions", json=payload)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise LMStudioError(f"chat completion failed: {exc}") from exc
            content = str(resp.json()["choices"][0]["message"]["content"])
            try:
                return output_type.model_validate_json(_THINK_RE.sub("", content))
            except ValidationError as exc:
                last_error = exc
        raise LMStudioError(
            f"model {model} returned invalid {output_type.__name__} "
            f"{max_attempts} times; last error:\n{last_error}"
        )


async def gather_bounded[T](limit: int, coros: Iterable[Awaitable[T]]) -> list[T]:
    """Await every coroutine, running at most `limit` at once, results in input order.

    Lets the content scripts fan out generation across a model that serves parallel
    requests (LM Studio's per-model `Parallel` slots) without swamping it; `limit=1`
    is fully sequential. Order is preserved, so callers can zip results back to their
    deterministically-rolled inputs regardless of which finishes first.
    """
    sem = asyncio.Semaphore(max(1, limit))

    async def guarded(coro: Awaitable[T]) -> T:
        async with sem:
            return await coro

    return await asyncio.gather(*(guarded(coro) for coro in coros))


async def choose_model(client: LMStudioClient, model_arg: str | None) -> str:
    """Resolve the model to use: `--model` wins, otherwise pick interactively."""
    if model_arg:
        return model_arg
    keys = await client.list_llm_keys()
    if not keys:
        raise LMStudioError("no LLMs downloaded in LM Studio")
    if not sys.stdin.isatty():
        raise LMStudioError("not a TTY — pass --model <key> (see `--list-models`)")
    for i, key in enumerate(keys, start=1):
        print(f"  {i}. {key}")
    while True:
        raw = input(f"model [1-{len(keys)}]: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(keys):
            return keys[int(raw) - 1]
        if raw in keys:
            return raw
        print("pick a number from the list")


# ---------------------------------------------------------------------------
# Personality dimensions — the random "position" a persona or puzzle is built from.
# ---------------------------------------------------------------------------

# (name, meaning of 1, meaning of 10). Eight dials, each rolled 1-10.
DIMENSIONS: tuple[tuple[str, str, str], ...] = (
    ("warmth", "ice-cold and guarded", "openly affectionate"),
    ("humor", "dead serious", "relentlessly joking"),
    ("sarcasm", "always sincere", "biting, teasing irony"),
    ("boldness", "shy and reserved", "forward and flirty"),
    ("curiosity", "small talk only", "probing questions and intellectual tangents"),
    ("chaos", "predictable and grounded", "unhinged (complimentary)"),
    ("openness", "deflects anything personal", "overshares within two messages"),
    ("patience", "punishes one low-effort line instantly", "endlessly forgiving"),
)


@dataclass(frozen=True)
class PersonalityDims:
    scores: dict[str, int]  # dimension name -> 1..10

    @classmethod
    def roll(cls, rng: random.Random) -> PersonalityDims:
        return cls({name: rng.randint(1, 10) for name, _, _ in DIMENSIONS})

    def render(self) -> str:
        """The dimension block passed to the generator (and kept in persona_secrets)."""
        return "\n".join(
            f"- {name}: {self.scores[name]}/10  (1 = {low}; 10 = {high})"
            for name, low, high in DIMENSIONS
        )

    def summary(self) -> str:
        return " · ".join(f"{name} {score}" for name, score in self.scores.items())

    @property
    def difficulty(self) -> int:
        """1-3 (personas.difficulty / puzzles.difficulty), derived from the dials:
        sarcastic, chaotic, impatient, cold characters punish generic play hardest."""
        s = self.scores
        hostility = (s["sarcasm"] + s["chaos"] + (11 - s["patience"]) + (11 - s["warmth"])) / 4
        if hostility < 4.5:
            return 1
        if hostility < 7.0:
            return 2
        return 3

    @property
    def is_boss(self) -> bool:
        return self.difficulty == 3 and self.scores["chaos"] >= 9


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "x"
