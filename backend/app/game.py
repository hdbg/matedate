"""Solo PvE game service — the server-authoritative core.

Owns all live-play DB writes (games/solo_games/moves/engine_responses/ratings), the per-move
clock (SPEC §2.6), and the end conditions. Every public method returns a list of protocol
messages to send to the client. The Supabase client is an async service-role client, so RLS is
bypassed, the server is the sole writer of game state, and queries never block the event loop.

The clock is a per-game **Fischer** clock (SPEC §2.6): the player starts with `base_seconds` and
gains `increment_seconds` back after each submitted move (rewarding quick answers). The running
bank is encoded as `solo_games.turn_deadline` (= now + remaining bank when a turn opens); it is
paused across the persona's reply and the next turn's deadline is anchored to reply-send time, so
LLM latency is never charged. Expiry is enforced *proactively*: whenever a turn opens a background
task is armed for that turn's deadline (via the optional `send` callback the transport supplies)
so an idle player is finished with `timeout` at the deadline rather than only on their next
message. A lock serializes the timer against the request path so a game is finished at most once.

Reads are parsed into the generated `database_types` pydantic models (which coerce the REST
JSON into datetime/UUID/float); writes annotate their payloads with the generated
`*Insert`/`*Update` TypedDicts and pass them through `_json_row` to keep values JSON-safe.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, cast

from pydantic import BaseModel
from supabase import AsyncClient

from .config import Settings
from .db import json_row as _json_row
from .database_types import (
    PublicEngineResponsesInsert,
    PublicGamesInsert,
    PublicGamesUpdate,
    PublicMatchEndReason,
    PublicMoves,
    PublicMovesInsert,
    PublicPlayerRatings,
    PublicPlayerRatingsUpdate,
    PublicRatingHistoryInsert,
    PublicSoloGames,
    PublicSoloGamesInsert,
    PublicSoloGamesUpdate,
)
from .engine import Engine
from .grading import START_EVAL, classify, swing_from_delta
from .personas import HIDDEN_HINT, Persona, get_persona_by_id, pick_persona
from .protocol import (
    ErrorMsg,
    FinishMsg,
    GameStateMsg,
    MoveOut,
    NewGameMsg,
    PersonaOut,
    ResponseMsg,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Callback the transport supplies so the service can push a message unprompted (the timeout
# timer fires with no client request in flight). Fire the timer a hair *after* the deadline so
# the DB re-check (`now > deadline`) is unambiguously true.
Sender = Callable[[BaseModel], Awaitable[None]]
_TIMEOUT_EPSILON = 0.05


@dataclass
class _ActiveGame:
    id: uuid.UUID
    user_id: uuid.UUID
    solo: PublicSoloGames


class SoloGameService:
    def __init__(
        self,
        supabase: AsyncClient,
        settings: Settings,
        engine: Engine,
        *,
        send: Sender | None = None,
    ) -> None:
        self._db = supabase
        self._settings = settings
        self._engine = engine
        # `send` lets the service push the timeout `finish` with no client request in flight.
        # Without it (e.g. in tests) the clock is still enforced reactively on the next call.
        self._send = send
        # Serializes the request-driven path against the background timeout so the game can
        # only be finished once; per-connection, since one service is built per socket.
        self._lock = asyncio.Lock()
        self._timeout_task: asyncio.Task[None] | None = None

    # -- public entrypoints -------------------------------------------------

    async def start_or_resume(self, user_id: str) -> list[BaseModel]:
        async with self._lock:
            return await self._start_or_resume(user_id)

    async def apply_move(self, user_id: str, content: str) -> list[BaseModel]:
        async with self._lock:
            return await self._apply_move(user_id, content)

    async def aclose(self) -> None:
        """Cancel the pending timeout timer (call when the socket closes)."""
        self._arm(None, None)

    async def _start_or_resume(self, user_id: str) -> list[BaseModel]:
        game = await self._load_active(user_id)
        if game is None:
            new_game = await self._create_game(user_id)
            self._arm(user_id, _now() + timedelta(seconds=self._settings.solo_base_seconds))
            return [new_game]

        deadline = game.solo.turn_deadline
        if deadline is not None and _now() > deadline:
            finish = await self._finish(game, "timeout")
            fresh = await self._create_game(user_id)
            self._arm(user_id, _now() + timedelta(seconds=self._settings.solo_base_seconds))
            return [finish, fresh]

        if deadline is None:
            # No open turn on an active game (rare); reopen one at the base bank.
            deadline = _now() + timedelta(seconds=game.solo.base_seconds)
            await self._update_solo(game.id, {"turn_deadline": deadline})
            game.solo.turn_deadline = deadline

        self._arm(user_id, deadline)
        return [await self._game_state(game)]

    async def _apply_move(self, user_id: str, content: str) -> list[BaseModel]:
        content = content.strip()
        if not content:
            return [ErrorMsg(code="empty_move", message="message is empty")]

        game = await self._load_active(user_id)
        if game is None:
            return [ErrorMsg(code="no_active_game", message="no game in progress")]

        deadline = game.solo.turn_deadline
        if deadline is None:
            return [ErrorMsg(code="not_your_turn", message="wait for the reply")]

        now = _now()
        if now > deadline:
            finish = await self._finish(game, "timeout")
            self._arm(user_id, None)
            return [finish]
        # Fischer clock: what's left of the bank when the player submits (their thinking time
        # has already ticked off, since the bank == turn_deadline - now).
        remaining_ms = max(0, int((deadline - now).total_seconds() * 1000))

        persona = await get_persona_by_id(self._db, str(game.solo.persona_id))
        moves = await self._load_moves(game.id)
        eval_before = _last_eval(moves)
        transcript = _transcript(moves, persona.name)

        turn = await self._engine.run_turn(
            persona.system_prompt, transcript, content, eval_before
        )
        eval_after = max(0.0, min(100.0, turn.verdict.eval_after))
        eval_delta = round(eval_after - eval_before, 2)
        swing = swing_from_delta(eval_delta)
        grade = classify(swing)
        position = len(moves)

        await self._write_turn(
            game.id,
            position,
            content,
            eval_before,
            eval_after,
            turn.verdict.reply,
            {"model": turn.model, "latency_ms": turn.latency_ms, "verdict": turn.verdict.model_dump()},
        )

        # Reward a quick answer: the bank carried into the next turn is what was left plus the
        # increment. The clock is paused across the persona's reply — the next turn's countdown
        # is anchored below to _now() (reply-send time), so LLM latency is never charged.
        exchanges = game.solo.exchanges + 1
        new_bank_ms = remaining_ms + game.solo.increment_seconds * 1000
        response = ResponseMsg(
            content=turn.verdict.reply,
            classification=grade.class_key,
            swing=swing,
            time_left=new_bank_ms,
        )

        # The persona blocked the human — end the game early, but still deliver the parting
        # reply + verdict so the player sees why the date is over.
        if turn.verdict.is_blocked:
            await self._update_solo(game.id, {"exchanges": exchanges, "turn_deadline": None})
            game.solo.exchanges = exchanges
            finish = await self._finish(game, "blocked")
            self._arm(user_id, None)
            return [response, finish]

        if exchanges >= self._settings.solo_max_exchanges:
            await self._update_solo(game.id, {"exchanges": exchanges, "turn_deadline": None})
            game.solo.exchanges = exchanges
            finish = await self._finish(game, "scored")
            self._arm(user_id, None)
            return [finish]

        new_deadline = _now() + timedelta(milliseconds=new_bank_ms)
        await self._update_solo(
            game.id,
            {"exchanges": exchanges, "turn_deadline": new_deadline},
        )
        self._arm(user_id, new_deadline)
        return [response]

    # -- timeout timer ------------------------------------------------------

    def _arm(self, user_id: str | None, deadline: datetime | None) -> None:
        """(Re)schedule the background timeout for the current open turn, cancelling any prior
        one. `deadline=None` just disarms (game ended / socket closing)."""
        if self._timeout_task is not None:
            self._timeout_task.cancel()
            self._timeout_task = None
        if user_id is None or deadline is None or self._send is None:
            return
        self._timeout_task = asyncio.create_task(self._run_timeout(user_id, deadline))

    async def _run_timeout(self, user_id: str, deadline: datetime) -> None:
        try:
            await asyncio.sleep(max(0.0, (deadline - _now()).total_seconds()) + _TIMEOUT_EPSILON)
            async with self._lock:
                game = await self._load_active(user_id)
                if game is None:
                    return  # already finished
                current = game.solo.turn_deadline
                if current is None or _now() <= current:
                    return  # a move advanced or closed the turn while we slept
                finish = await self._finish(game, "timeout")
                if self._send is not None:
                    await self._send(finish)
        except asyncio.CancelledError:
            pass

    # -- game lifecycle -----------------------------------------------------

    async def _create_game(self, user_id: str) -> NewGameMsg:
        persona = await pick_persona(self._db)
        base_seconds = self._settings.solo_base_seconds
        increment_seconds = self._settings.solo_increment_seconds
        deadline = _now() + timedelta(seconds=base_seconds)
        await self._insert_game(user_id, persona, base_seconds, increment_seconds, deadline)
        return NewGameMsg(persona=_persona_out(persona), time=base_seconds * 1000)

    async def _game_state(self, game: _ActiveGame) -> GameStateMsg:
        persona = await get_persona_by_id(self._db, str(game.solo.persona_id))
        moves = await self._load_moves(game.id)
        deadline = game.solo.turn_deadline
        time_left = max(0, int((deadline - _now()).total_seconds() * 1000)) if deadline else 0
        return GameStateMsg(
            persona=_persona_out(persona),
            moves=[_move_out(m) for m in moves],
            time=game.solo.base_seconds * 1000,
            time_left=time_left,
            status="active",
        )

    async def _finish(self, game: _ActiveGame, end_reason: PublicMatchEndReason) -> FinishMsg:
        persona = await get_persona_by_id(self._db, str(game.solo.persona_id))
        moves = await self._load_moves(game.id)
        deltas = [m.eval_delta or 0.0 for m in moves if m.side == "You"]
        qualities = [classify(swing_from_delta(d)).quality for d in deltas]
        accuracy = round(sum(qualities) / len(qualities), 2) if qualities else 0.0
        rating_delta = max(-25, min(25, round((accuracy - 50) / 2)))
        title = f"{accuracy:.0f}% accuracy vs {persona.name}"
        description = (
            f"{end_reason.capitalize()} after {len(deltas)} messages — "
            f"rizz {'+' if rating_delta >= 0 else ''}{rating_delta}."
        )
        await self._write_finish(game, end_reason, accuracy, rating_delta, title, description)
        return FinishMsg(
            end_reason=end_reason,
            accuracy=accuracy,
            rating_delta=rating_delta,
            moves=[_move_out(m) for m in moves],
            title=title,
            description=description,
            game_id=str(game.id),
        )

    # -- async DB helpers ---------------------------------------------------

    async def _load_active(self, user_id: str) -> _ActiveGame | None:
        res = await (
            self._db.table("games")
            .select("id, user_id, solo_games(*)")
            .eq("user_id", user_id)
            .eq("mode", "solo")
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        rows = cast("list[dict[str, Any]]", res.data or [])
        if not rows:
            return None
        row = rows[0]
        embed = row.get("solo_games")
        solo = embed[0] if isinstance(embed, list) else embed
        if not solo:
            return None
        return _ActiveGame(
            id=uuid.UUID(row["id"]),
            user_id=uuid.UUID(row["user_id"]),
            solo=PublicSoloGames.model_validate(solo),
        )

    async def _insert_game(
        self,
        user_id: str,
        persona: Persona,
        base_seconds: int,
        increment_seconds: int,
        deadline: datetime,
    ) -> None:
        game_payload: PublicGamesInsert = {
            "user_id": uuid.UUID(user_id),
            "mode": "solo",
            "status": "active",
        }
        game = await self._db.table("games").insert(_json_row(game_payload)).execute()
        inserted: Any = game.data
        game_id = uuid.UUID(inserted[0]["id"])
        solo_payload: PublicSoloGamesInsert = {
            "game_id": game_id,
            "persona_id": uuid.UUID(persona.id),
            "base_seconds": base_seconds,
            "increment_seconds": increment_seconds,
            "exchanges": 0,
            "turn_deadline": deadline,
        }
        await self._db.table("solo_games").insert(_json_row(solo_payload)).execute()
        opening: PublicMovesInsert = {
            "game_id": game_id,
            "position": 0,
            "side": "Match",
            "content": persona.opening_line,
        }
        await self._db.table("moves").insert(_json_row(opening)).execute()

    async def _load_moves(self, game_id: uuid.UUID) -> list[PublicMoves]:
        res = await (
            self._db.table("moves")
            .select("*")
            .eq("game_id", str(game_id))
            .order("position")
            .execute()
        )
        return [PublicMoves.model_validate(m) for m in (res.data or [])]

    async def _write_turn(
        self,
        game_id: uuid.UUID,
        position: int,
        content: str,
        eval_before: float,
        eval_after: float,
        reply: str,
        raw_response: dict[str, Any],
    ) -> None:
        # Store the numeric eval only; eval_delta is a generated column and the Brilliant…Blunder
        # rank is derived on read (grading.py).
        you_move: PublicMovesInsert = {
            "game_id": game_id,
            "position": position,
            "side": "You",
            "content": content,
            "eval_before": eval_before,
            "eval_after": eval_after,
        }
        await self._db.table("moves").insert(_json_row(you_move)).execute()
        match_move: PublicMovesInsert = {
            "game_id": game_id,
            "position": position + 1,
            "side": "Match",
            "content": reply,
        }
        await self._db.table("moves").insert(_json_row(match_move)).execute()
        engine_row: PublicEngineResponsesInsert = {
            "game_id": game_id,
            "model": raw_response["model"],
            "prompt_version": "solo-v1",
            "raw_response": cast("Any", raw_response),
            "latency_ms": raw_response["latency_ms"],
        }
        await self._db.table("engine_responses").insert(_json_row(engine_row)).execute()

    async def _update_solo(self, game_id: uuid.UUID, patch: PublicSoloGamesUpdate) -> None:
        await self._db.table("solo_games").update(_json_row(patch)).eq(
            "game_id", str(game_id)
        ).execute()

    async def _write_finish(
        self,
        game: _ActiveGame,
        end_reason: PublicMatchEndReason,
        accuracy: float,
        rating_delta: int,
        title: str,
        description: str,
    ) -> None:
        games_update: PublicGamesUpdate = {
            "status": "completed",
            "end_reason": end_reason,
            "ended_at": _now(),
            "accuracy": accuracy,
            "title": title,
            "description": description,
        }
        await self._db.table("games").update(_json_row(games_update)).eq(
            "id", str(game.id)
        ).execute()
        solo_update: PublicSoloGamesUpdate = {"rating_delta": rating_delta, "turn_deadline": None}
        await self._db.table("solo_games").update(_json_row(solo_update)).eq(
            "game_id", str(game.id)
        ).execute()

        current = await (
            self._db.table("player_ratings")
            .select("*")
            .eq("user_id", str(game.user_id))
            .maybe_single()
            .execute()
        )
        if not current or not current.data:
            return
        before = PublicPlayerRatings.model_validate(current.data).rizz_rating
        after = max(0, before + rating_delta)
        if after == before:
            return
        rating_update: PublicPlayerRatingsUpdate = {"rizz_rating": after}
        await self._db.table("player_ratings").update(_json_row(rating_update)).eq(
            "user_id", str(game.user_id)
        ).execute()
        history: PublicRatingHistoryInsert = {
            "user_id": game.user_id,
            "kind": "rizz",
            "rating_before": before,
            "rating_after": after,
            "delta": after - before,
            "source_kind": "game",
            "source_id": game.id,
        }
        await self._db.table("rating_history").insert(_json_row(history)).execute()


# -- pure mappers -----------------------------------------------------------


def _persona_out(persona: Persona) -> PersonaOut:
    return PersonaOut(
        slug=persona.slug,
        name=persona.name,
        hint=HIDDEN_HINT,
        opening_line=persona.opening_line,
        suggested_messages=persona.suggested_messages,
    )


def _move_out(move: PublicMoves) -> MoveOut:
    if move.side == "You":
        swing = swing_from_delta(move.eval_delta or 0.0)
        return MoveOut(
            position=move.position,
            side="You",
            content=move.content,
            classification=classify(swing).class_key,
            swing=swing,
        )
    return MoveOut(position=move.position, side="Match", content=move.content)


def _last_eval(moves: list[PublicMoves]) -> float:
    deltas = [m.eval_delta for m in moves if m.side == "You" and m.eval_delta is not None]
    if not deltas:
        return START_EVAL
    # eval_after isn't tracked separately; reconstruct from the running deltas off the baseline.
    return max(0.0, min(100.0, START_EVAL + sum(deltas)))


def _transcript(moves: list[PublicMoves], persona_name: str) -> str:
    lines = []
    for move in moves:
        who = "You" if move.side == "You" else persona_name
        lines.append(f"{who}: {move.content}")
    return "\n".join(lines)
