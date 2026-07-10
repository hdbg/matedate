"""Solo PvE game service — the server-authoritative core.

Owns all live-play DB writes (games/solo_games/moves/engine_responses/ratings), the per-move
clock (SPEC §2.6), and the end conditions. Every public method returns a list of protocol
messages to send to the client. The Supabase client is an async service-role client, so RLS is
bypassed, the server is the sole writer of game state, and queries never block the event loop.

Reads are parsed into the generated `database_types` pydantic models (which coerce the REST
JSON into datetime/UUID/float); writes annotate their payloads with the generated
`*Insert`/`*Update` TypedDicts and pass them through `_json_row` to keep values JSON-safe.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, cast

from pydantic import BaseModel
from supabase import AsyncClient

from .config import Settings
from .database_types import (
    PublicEngineResponsesInsert,
    PublicGamesInsert,
    PublicGamesUpdate,
    PublicMatchEndReason,
    PublicMoveKind,
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


def _json_row(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Make a typed write payload JSON-safe for postgrest (which serializes via json.dumps).

    datetime → ISO string, UUID → str; dicts (jsonb), None and primitives pass through.
    """
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, uuid.UUID):
            out[key] = str(value)
        else:
            out[key] = value
    return out


@dataclass
class _ActiveGame:
    id: uuid.UUID
    user_id: uuid.UUID
    solo: PublicSoloGames


class SoloGameService:
    def __init__(self, supabase: AsyncClient, settings: Settings, engine: Engine) -> None:
        self._db = supabase
        self._settings = settings
        self._engine = engine

    # -- public entrypoints -------------------------------------------------

    async def start_or_resume(self, user_id: str) -> list[BaseModel]:
        game = await self._load_active(user_id)
        if game is None:
            return [await self._create_game(user_id)]

        deadline = game.solo.turn_deadline
        if deadline is not None and _now() > deadline:
            finish = await self._finish(game, "timeout")
            fresh = await self._create_game(user_id)
            return [finish, fresh]

        if deadline is None:
            # No open turn on an active game (rare); reopen one deterministically.
            new_deadline = _now() + timedelta(seconds=game.solo.move_seconds)
            await self._update_solo(game.id, {"turn_deadline": new_deadline})
            game.solo.turn_deadline = new_deadline

        return [await self._game_state(game)]

    async def apply_move(self, user_id: str, content: str) -> list[BaseModel]:
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
            return [await self._finish(game, "timeout")]
        time_left_ms = max(0, int((deadline - now).total_seconds() * 1000))

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
            grade.move_kind,
            eval_before,
            eval_after,
            eval_delta,
            turn.verdict.reply,
            {"model": turn.model, "latency_ms": turn.latency_ms, "verdict": turn.verdict.model_dump()},
        )

        exchanges = game.solo.exchanges + 1
        response = ResponseMsg(
            content=turn.verdict.reply,
            classification=grade.class_key,
            swing=swing,
            time_left=time_left_ms,
        )

        # The persona blocked the human — end the game early, but still deliver the parting
        # reply + verdict so the player sees why the date is over.
        if turn.verdict.is_blocked:
            await self._update_solo(game.id, {"exchanges": exchanges, "turn_deadline": None})
            game.solo.exchanges = exchanges
            return [response, await self._finish(game, "blocked")]

        if exchanges >= self._settings.solo_max_exchanges:
            await self._update_solo(game.id, {"exchanges": exchanges, "turn_deadline": None})
            game.solo.exchanges = exchanges
            return [await self._finish(game, "scored")]

        new_deadline = now + timedelta(seconds=game.solo.move_seconds)
        await self._update_solo(
            game.id,
            {"exchanges": exchanges, "turn_deadline": new_deadline},
        )
        return [response]

    # -- game lifecycle -----------------------------------------------------

    async def _create_game(self, user_id: str) -> NewGameMsg:
        persona = await pick_persona(self._db)
        move_seconds = self._settings.solo_move_seconds
        deadline = _now() + timedelta(seconds=move_seconds)
        await self._insert_game(user_id, persona, move_seconds, deadline)
        return NewGameMsg(persona=_persona_out(persona), time=move_seconds * 1000)

    async def _game_state(self, game: _ActiveGame) -> GameStateMsg:
        persona = await get_persona_by_id(self._db, str(game.solo.persona_id))
        moves = await self._load_moves(game.id)
        deadline = game.solo.turn_deadline
        time_left = max(0, int((deadline - _now()).total_seconds() * 1000)) if deadline else 0
        return GameStateMsg(
            persona=_persona_out(persona),
            moves=[_move_out(m) for m in moves],
            time=game.solo.move_seconds * 1000,
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
        self, user_id: str, persona: Persona, move_seconds: int, deadline: datetime
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
            "move_seconds": move_seconds,
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
        move_kind: PublicMoveKind,
        eval_before: float,
        eval_after: float,
        eval_delta: float,
        reply: str,
        raw_response: dict[str, Any],
    ) -> None:
        you_move: PublicMovesInsert = {
            "game_id": game_id,
            "position": position,
            "side": "You",
            "content": content,
            "classification": move_kind,
            "eval_before": eval_before,
            "eval_after": eval_after,
            "eval_delta": eval_delta,
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
