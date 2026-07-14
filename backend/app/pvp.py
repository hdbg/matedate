"""Ranked PvP (player vs player) — the server-authoritative match core.

Two humans get the SAME persona and opening line and each plays their own parallel
conversation with it (SPEC §2.2), in move-by-move lockstep: side 'a' submits exchange N,
then side 'b', then exchange N+1 — so only the on-move player's Fischer clock ever runs,
and it is paused while the engine grades (SPEC §2.6). A match is a single contest: a
blocked verdict is an instant loss for the mover, a landed date an instant win, a flagged
clock a loss on time, and both sides completing `max_exchanges` compares accuracies
('scored'; an exact tie is a draw).

Coordination is in-memory and single-process (like the ConnectionManager): a module-level
`MatchRegistry` maps a live match to its `MatchSession`, which holds both sides' send/close
callbacks, one asyncio.Lock, and the single armed timeout task. The DB rows
(`matches`/`pvp_matches`/`match_moves`) are the source of truth — a reconnect (or a backend
restart) rebuilds the session from them. The matchmaking queue claim is also guarded by a
single in-process lock; the `matchmaking_queue` row status is the seam for a future
multi-process CAS claim.

Mid-match a player never sees the opponent's words: `OppMoveOut.content` is nulled unless
the `pvp_live_transcript` gate (a future premium) is on. The full transcript is revealed on
`match_finish`, matching the RLS rule that opens `match_moves` once the match is over.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, cast

from pydantic import BaseModel
from supabase import AsyncClient

from .config import Settings, pvp_clock
from .database_types import (
    PublicEngineResponsesInsert,
    PublicGender,
    PublicMatchEndReason,
    PublicMatches,
    PublicMatchesInsert,
    PublicMatchesUpdate,
    PublicMatchInvitesInsert,
    PublicMatchInvitesUpdate,
    PublicMatchmakingQueue,
    PublicMatchmakingQueueInsert,
    PublicMatchmakingQueueUpdate,
    PublicMatchMoves,
    PublicMatchMovesInsert,
    PublicMatchSide,
    PublicMessageSide,
    PublicPlayerRatings,
    PublicPlayerRatingsUpdate,
    PublicPvpMatches,
    PublicPvpMatchesInsert,
    PublicPvpMatchesUpdate,
    PublicRatingHistoryInsert,
    PublicTimeControl,
)
from .db import json_row as _json_row
from .engine import Engine
from .grading import (
    MoveClassKey,
    accuracy_from_qualities,
    classify,
    resolve_eval_after,
    swing_from_delta,
)
from .moves_common import END_REASON_LABELS, last_eval, move_out, persona_out, transcript_text
from .personas import get_persona_by_id, pick_persona
from .protocol import (
    CancelledMsg,
    ErrorMsg,
    InviteCreatedMsg,
    MatchFinishMsg,
    MatchFoundMsg,
    MatchStateMsg,
    MoveOut,
    OpponentOut,
    OppMovedMsg,
    OppMoveOut,
    QueuedMsg,
    ResponseMsg,
    TurnMsg,
)


logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _other(side: PublicMatchSide) -> PublicMatchSide:
    return "b" if side == "a" else "a"


_SIDES: tuple[PublicMatchSide, PublicMatchSide] = ("a", "b")


Sender = Callable[[BaseModel], Awaitable[None]]
Closer = Callable[[], Awaitable[None]]
_TIMEOUT_EPSILON = 0.05


@dataclass
class PlayerConn:
    """One player's live socket, as the services see it. The WS layer builds one per
    connection; the services mutate the routing state (session/side, queued, invite_code)
    so the frame loop always knows where to send the next message."""

    user_id: str
    send: Sender
    close: Closer
    session: "MatchSession | None" = None
    side: PublicMatchSide | None = None
    queued: bool = False
    invite_code: str | None = None


@dataclass(frozen=True)
class _PlayerInfo:
    user_id: str
    username: str | None
    display_name: str | None
    avatar_path: str | None
    ranked_elo: int

    @property
    def name(self) -> str:
        return self.display_name or self.username or "your opponent"


def _elo_delta(own: int, opp: int, score: float, k: int) -> int:
    """Standard Elo: delta = K * (score - expected), score in {1, 0.5, 0}."""
    expected = 1.0 / (1.0 + 10.0 ** ((opp - own) / 400.0))
    return round(k * (score - expected))


class MatchSession:
    """One live match: both sides' callbacks, the single running clock, all DB writes.

    The session (not a connection) owns the timeout timer, so the clock keeps running while
    a player is disconnected and the match still flags at the deadline. A per-match lock
    serializes moves, attaches, and the timer, so the match finishes at most once.
    """

    def __init__(
        self,
        db: AsyncClient,
        settings: Settings,
        engine: Engine,
        match: PublicMatches,
        pvp: PublicPvpMatches,
    ) -> None:
        self._db = db
        self._settings = settings
        self._engine = engine
        self.match = match
        self.pvp = pvp
        self._lock = asyncio.Lock()
        self._conns: dict[PublicMatchSide, PlayerConn | None] = {"a": None, "b": None}
        self._players: dict[PublicMatchSide, _PlayerInfo] | None = None
        self._timeout_task: asyncio.Task[None] | None = None
        self._finished = match.status != "active"

    @property
    def match_id(self) -> str:
        return str(self.match.id)

    @property
    def user_ids(self) -> tuple[str, str]:
        return (str(self.pvp.player_a), str(self.pvp.player_b))

    def side_of(self, user_id: str) -> PublicMatchSide | None:
        if user_id == str(self.pvp.player_a):
            return "a"
        if user_id == str(self.pvp.player_b):
            return "b"
        return None

    # -- lifecycle ------------------------------------------------------------

    def attach_initial(self, side: PublicMatchSide, conn: PlayerConn) -> None:
        """Wire a freshly created match to its players (no reconnect logic)."""
        self._conns[side] = conn
        conn.session = self
        conn.side = side
        conn.queued = False
        conn.invite_code = None

    async def attach(self, conn: PlayerConn) -> list[BaseModel]:
        """Reconnect: rebind the socket and stream the full match state. An expired deadline
        finishes the match with `timeout` right here, like the solo resume path."""
        async with self._lock:
            side = self.side_of(conn.user_id)
            if side is None or self._finished:
                return [ErrorMsg(code="no_active_match", message="no match in progress")]
            self._conns[side] = conn
            conn.session = self
            conn.side = side

            deadline = self.pvp.turn_deadline
            if deadline is None:
                # No open turn on an active match (backend restart mid-grading): reopen the
                # on-move player's turn at their bank at rest.
                deadline = _now() + timedelta(milliseconds=self._bank_ms(self.pvp.turn_side))
                await self._update_pvp({"turn_deadline": deadline})
                self.pvp.turn_deadline = deadline
            elif _now() > deadline:
                return await self._finish(
                    "timeout", _other(self.pvp.turn_side), requester=side
                )

            self._arm(deadline)
            return [await self._match_state(side)]

    def detach(self, conn: PlayerConn) -> None:
        """Socket gone. The clock keeps running — the session owns the timer, so the match
        still flags at the deadline (and pushes the finish to whoever is still attached)."""
        if conn.side is not None and self._conns.get(conn.side) is conn:
            self._conns[conn.side] = None

    def start_clock(self) -> None:
        self._arm(self.pvp.turn_deadline)

    # -- the move path ----------------------------------------------------------

    async def apply_move(self, conn: PlayerConn, content: str) -> list[BaseModel]:
        content = content.strip()
        if not content:
            return [ErrorMsg(code="empty_move", message="message is empty")]
        async with self._lock:
            side = conn.side
            if side is None or self._finished:
                return [ErrorMsg(code="no_active_match", message="no match in progress")]
            if self.pvp.turn_side != side:
                return [ErrorMsg(code="not_your_turn", message="waiting for your opponent")]
            deadline = self.pvp.turn_deadline
            if deadline is None:
                return [ErrorMsg(code="not_your_turn", message="wait for the reply")]

            now = _now()
            if now > deadline:
                return await self._finish("timeout", _other(side), requester=side)
            remaining_ms = max(0, int((deadline - now).total_seconds() * 1000))

            # The move is accepted: stop the clock while the engine grades (SPEC §2.6 — LLM
            # latency is never charged). Bank the remaining time immediately; the increment
            # lands when the turn actually passes.
            self._arm(None)
            patch: PublicPvpMatchesUpdate = {"turn_deadline": None}
            patch.update(_bank_patch(side, remaining_ms))
            await self._update_pvp(patch)
            self.pvp.turn_deadline = None
            self._set_bank(side, remaining_ms)

            persona = await get_persona_by_id(self._db, str(self.match.persona_id))
            moves = await self._load_moves(side)
            eval_before = last_eval(
                m.eval_delta for m in moves if m.speaker == "You" and m.eval_delta is not None
            )
            transcript = transcript_text(((m.speaker, m.content) for m in moves), persona.name)

            turn = await self._engine.run_turn(
                persona.system_prompt, transcript, content, eval_before
            )
            eval_after = resolve_eval_after(
                turn.verdict.eval_after,
                is_blocked=turn.verdict.is_blocked,
                is_date_landed=turn.verdict.is_date_landed,
            )
            eval_delta = round(eval_after - eval_before, 2)
            swing = swing_from_delta(eval_delta)
            grade = classify(swing, eval_after)
            position = len(moves)
            await self._write_turn(
                side,
                position,
                content,
                eval_before,
                eval_after,
                turn.verdict.reply,
                {
                    "model": turn.model,
                    "latency_ms": turn.latency_ms,
                    "verdict": turn.verdict.model_dump(),
                },
            )
            exchanges = sum(1 for m in moves if m.speaker == "You") + 1
            new_bank_ms = remaining_ms + self.match.increment_seconds * 1000

            response = ResponseMsg(
                content=turn.verdict.reply,
                classification=grade.class_key,
                swing=swing,
                time_left=new_bank_ms,
            )
            opp_moved = OppMovedMsg(
                move=self._opp_move_out(position, "You", content, grade.class_key, swing),
                reply=self._opp_move_out(position + 1, "Match", turn.verdict.reply, None, None),
            )
            other = _other(side)

            # Checkmates end the match instantly (SPEC §3); the mover still sees the persona's
            # parting reply + verdict first, and the opponent gets the gated move before the
            # finish so their glyph row is complete.
            if eval_after <= 0.0 or eval_after >= 100.0:
                await self._send_to(other, opp_moved)
                winner = other if eval_after <= 0.0 else side
                reason: PublicMatchEndReason = (
                    "blocked" if eval_after <= 0.0 else "date_landed"
                )
                return [response, *await self._finish(reason, winner, requester=side)]

            # Side 'b' completing the final exchange closes the lockstep: both sides have now
            # played max_exchanges → score the match.
            if side == "b" and exchanges >= self.match.max_exchanges:
                await self._send_to(other, opp_moved)
                return [response, *await self._finish("scored", None, requester=side)]

            # Pass the turn: the mover banks the increment, the opponent's clock starts.
            other_bank = self._bank_ms(other)
            new_deadline = _now() + timedelta(milliseconds=other_bank)
            pass_patch: PublicPvpMatchesUpdate = {
                "turn_side": other,
                "turn_deadline": new_deadline,
            }
            pass_patch.update(_bank_patch(side, new_bank_ms))
            await self._update_pvp(pass_patch)
            self.pvp.turn_side = other
            self.pvp.turn_deadline = new_deadline
            self._set_bank(side, new_bank_ms)
            self._arm(new_deadline)

            await self._send_to(other, opp_moved)
            await self._send_to(other, TurnMsg(turn="you", time_left=other_bank))
            return [response, TurnMsg(turn="opponent", time_left=other_bank)]

    # -- timeout timer ----------------------------------------------------------

    def _arm(self, deadline: datetime | None) -> None:
        task = self._timeout_task
        self._timeout_task = None
        # Never cancel ourselves: _finish disarms, and when the TIMER is what finished the
        # match, self._timeout_task is the currently running task — cancelling it would
        # abort _finish at its next await and the match would never flag.
        if task is not None and task is not asyncio.current_task():
            task.cancel()
        if deadline is None or self._finished:
            return
        self._timeout_task = asyncio.create_task(self._run_timeout(deadline))
        # A dead timer means a match that never flags — surface the failure loudly.
        self._timeout_task.add_done_callback(_log_task_failure)

    async def _run_timeout(self, deadline: datetime) -> None:
        try:
            await asyncio.sleep(max(0.0, (deadline - _now()).total_seconds()) + _TIMEOUT_EPSILON)
            async with self._lock:
                if self._finished:
                    return
                current = self.pvp.turn_deadline
                if current is None or _now() <= current:
                    return  # a move landed or the turn passed while we slept
                await self._finish("timeout", _other(self.pvp.turn_side), requester=None)
        except asyncio.CancelledError:
            pass

    # -- finish -------------------------------------------------------------------

    async def _finish(
        self,
        end_reason: PublicMatchEndReason,
        winner: PublicMatchSide | None,
        *,
        requester: PublicMatchSide | None,
    ) -> list[BaseModel]:
        """End the match (call under the lock). `winner` is forced for checkmates/timeouts
        and None for 'scored' (decided here by accuracy; an exact tie stays a draw). The
        requester's messages are returned for the request loop to send; everyone else gets
        theirs pushed and their socket closed. `requester=None` (the timer) pushes to both."""
        self._finished = True
        self._arm(None)
        registry.remove(self)

        moves = {side: await self._load_moves(side) for side in _SIDES}
        qualities = {
            side: [
                classify(swing_from_delta(m.eval_delta or 0.0), m.eval_after).quality
                for m in moves[side]
                if m.speaker == "You"
            ]
            for side in _SIDES
        }
        accuracy: dict[PublicMatchSide, float] = {}
        for side in _SIDES:
            denom = len(qualities[side])
            # A timeout is a forfeit (SPEC §2.6): the flagged player's unplayed exchanges
            # count as zero-quality, exactly like the solo path.
            if end_reason == "timeout" and winner == _other(side):
                denom = max(denom, self.match.max_exchanges)
            accuracy[side] = accuracy_from_qualities(qualities[side], denom)
        if end_reason == "scored":
            if accuracy["a"] > accuracy["b"]:
                winner = "a"
            elif accuracy["b"] > accuracy["a"]:
                winner = "b"
            else:
                winner = None  # draw

        players = await self._load_players()
        rating_delta: dict[PublicMatchSide, int] = {"a": 0, "b": 0}
        elo_patch: PublicPvpMatchesUpdate = {}
        if self.match.rated:
            score_a = 1.0 if winner == "a" else 0.0 if winner == "b" else 0.5
            for side in _SIDES:
                score = score_a if side == "a" else 1.0 - score_a
                own, opp = players[side], players[_other(side)]
                rating_delta[side] = _elo_delta(
                    own.ranked_elo, opp.ranked_elo, score, self._settings.pvp_elo_k
                )
            elo_patch = {
                "player_a_elo_before": players["a"].ranked_elo,
                "player_a_elo_after": max(0, players["a"].ranked_elo + rating_delta["a"]),
                "player_b_elo_before": players["b"].ranked_elo,
                "player_b_elo_after": max(0, players["b"].ranked_elo + rating_delta["b"]),
            }
            for side in _SIDES:
                await self._write_rating(
                    players[side],
                    rating_delta[side],
                    won=winner == side,
                    lost=winner is not None and winner != side,
                )

        matches_update: PublicMatchesUpdate = {
            "status": "completed",
            "winner_side": winner,
            "end_reason": end_reason,
            "completed_at": _now(),
        }
        await self._db.table("matches").update(_json_row(matches_update)).eq(
            "id", self.match_id
        ).execute()
        pvp_update: PublicPvpMatchesUpdate = {
            "turn_deadline": None,
            "player_a_accuracy": accuracy["a"],
            "player_b_accuracy": accuracy["b"],
        }
        pvp_update.update(elo_patch)
        await self._update_pvp(pvp_update)
        self.match.status = "completed"
        self.pvp.turn_deadline = None

        label = END_REASON_LABELS.get(end_reason, end_reason.capitalize())

        def msg_for(side: PublicMatchSide) -> MatchFinishMsg:
            other = _other(side)
            result: Literal["win", "loss", "draw"] = (
                "draw" if winner is None else ("win" if winner == side else "loss")
            )
            opp_name = players[other].name
            title = {
                "win": f"Victory vs {opp_name}",
                "loss": f"Defeat vs {opp_name}",
                "draw": f"Draw vs {opp_name}",
            }[result]
            delta = rating_delta[side]
            tail = f"elo {delta:+d}" if self.match.rated else "friendly match"
            description = (
                f"{label} — {accuracy[side]:.0f}% vs {accuracy[other]:.0f}% accuracy · {tail}."
            )
            return MatchFinishMsg(
                match_id=self.match_id,
                result=result,
                end_reason=end_reason,
                your_accuracy=accuracy[side],
                opp_accuracy=accuracy[other],
                rating_delta=delta,
                your_moves=[_match_move_out(m) for m in moves[side]],
                opp_moves=[_match_move_out(m) for m in moves[other]],  # full content: the reveal
                opponent=self._opponent_out(players[other]),
                title=title,
                description=description,
            )

        for side in _SIDES:
            if side == requester:
                continue
            conn = self._conns[side]
            if conn is not None:
                await conn.send(msg_for(side))
                await conn.close()
                self._conns[side] = None
        return [msg_for(requester)] if requester is not None else []

    # -- wire builders --------------------------------------------------------------

    async def _match_state(self, side: PublicMatchSide) -> MatchStateMsg:
        other = _other(side)
        persona = await get_persona_by_id(self._db, str(self.match.persona_id))
        players = await self._load_players()
        own_moves = await self._load_moves(side)
        opp_moves = await self._load_moves(other)

        deadline = self.pvp.turn_deadline
        turn: Literal["you", "opponent", "processing"]
        your_time_left = self._bank_ms(side)
        opp_time_left = self._bank_ms(other)
        if deadline is None:
            turn = "processing"
        else:
            live = max(0, int((deadline - _now()).total_seconds() * 1000))
            turn = "you" if self.pvp.turn_side == side else "opponent"
            if self.pvp.turn_side == side:
                your_time_left = live
            else:
                opp_time_left = live
        return MatchStateMsg(
            match_id=self.match_id,
            your_side=side,
            rated=self.match.rated,
            time_control=self.match.time_control,
            time=self.match.base_seconds * 1000,
            increment=self.match.increment_seconds * 1000,
            max_exchanges=self.match.max_exchanges,
            persona=persona_out(persona),
            opponent=self._opponent_out(players[other]),
            your_moves=[_match_move_out(m) for m in own_moves],
            opp_moves=[
                self._opp_move_out(
                    m.position,
                    m.speaker,
                    m.content,
                    classify(swing_from_delta(m.eval_delta or 0.0), m.eval_after).class_key
                    if m.speaker == "You"
                    else None,
                    swing_from_delta(m.eval_delta or 0.0) if m.speaker == "You" else None,
                )
                for m in opp_moves
            ],
            turn=turn,
            your_time_left=your_time_left,
            opp_time_left=opp_time_left,
        )

    async def match_found_for(self, side: PublicMatchSide) -> list[BaseModel]:
        """The opening frames for one player of a freshly created match."""
        persona = await get_persona_by_id(self._db, str(self.match.persona_id))
        players = await self._load_players()
        found = MatchFoundMsg(
            match_id=self.match_id,
            your_side=side,
            rated=self.match.rated,
            time_control=self.match.time_control,
            time=self.match.base_seconds * 1000,
            increment=self.match.increment_seconds * 1000,
            max_exchanges=self.match.max_exchanges,
            persona=persona_out(persona),
            opponent=self._opponent_out(players[_other(side)]),
        )
        turn = TurnMsg(
            turn="you" if self.pvp.turn_side == side else "opponent",
            time_left=self.match.base_seconds * 1000,
        )
        return [found, turn]

    def _opponent_out(self, info: _PlayerInfo) -> OpponentOut:
        return OpponentOut(
            username=info.username,
            display_name=info.display_name,
            avatar_path=info.avatar_path,
            ranked_elo=info.ranked_elo if self.match.rated else None,
        )

    def _opp_move_out(
        self,
        position: int,
        speaker: PublicMessageSide,
        content: str,
        classification: MoveClassKey | None,
        swing: float | None,
    ) -> OppMoveOut:
        """The content-gated view of an opponent move: glyph + swing always flow (the eval
        bar), the words only when the live-transcript gate (future premium) is open."""
        reveal = self._settings.pvp_live_transcript
        return OppMoveOut(
            position=position,
            speaker=speaker,
            content=content if reveal else None,
            classification=classification,
            swing=swing,
        )

    # -- clock state ------------------------------------------------------------------

    def _bank_ms(self, side: PublicMatchSide) -> int:
        return self.pvp.player_a_bank_ms if side == "a" else self.pvp.player_b_bank_ms

    def _set_bank(self, side: PublicMatchSide, bank_ms: int) -> None:
        if side == "a":
            self.pvp.player_a_bank_ms = bank_ms
        else:
            self.pvp.player_b_bank_ms = bank_ms

    # -- async DB helpers ----------------------------------------------------------

    async def _send_to(self, side: PublicMatchSide, message: BaseModel) -> None:
        conn = self._conns[side]
        if conn is not None:
            await conn.send(message)

    async def _load_moves(self, side: PublicMatchSide) -> list[PublicMatchMoves]:
        res = await (
            self._db.table("match_moves")
            .select("*")
            .eq("match_id", self.match_id)
            .eq("side", side)
            .order("position")
            .execute()
        )
        return [PublicMatchMoves.model_validate(m) for m in (res.data or [])]

    async def _load_players(self) -> dict[PublicMatchSide, _PlayerInfo]:
        if self._players is None:
            self._players = {
                "a": await _load_player(self._db, str(self.pvp.player_a)),
                "b": await _load_player(self._db, str(self.pvp.player_b)),
            }
        return self._players

    async def _write_turn(
        self,
        side: PublicMatchSide,
        position: int,
        content: str,
        eval_before: float,
        eval_after: float,
        reply: str,
        raw_response: dict[str, Any],
    ) -> None:
        you_move: PublicMatchMovesInsert = {
            "match_id": self.match.id,
            "side": side,
            "position": position,
            "speaker": "You",
            "content": content,
            "eval_before": eval_before,
            "eval_after": eval_after,
        }
        await self._db.table("match_moves").insert(_json_row(you_move)).execute()
        reply_move: PublicMatchMovesInsert = {
            "match_id": self.match.id,
            "side": side,
            "position": position + 1,
            "speaker": "Match",
            "content": reply,
        }
        await self._db.table("match_moves").insert(_json_row(reply_move)).execute()
        engine_row: PublicEngineResponsesInsert = {
            "match_id": self.match.id,
            "side": side,
            "model": raw_response["model"],
            "prompt_version": "pvp-v1",
            "raw_response": cast("Any", raw_response),
            "latency_ms": raw_response["latency_ms"],
        }
        await self._db.table("engine_responses").insert(_json_row(engine_row)).execute()

    async def _update_pvp(self, patch: PublicPvpMatchesUpdate) -> None:
        await self._db.table("pvp_matches").update(_json_row(patch)).eq(
            "match_id", self.match_id
        ).execute()

    async def _write_rating(
        self, player: _PlayerInfo, delta: int, won: bool, lost: bool
    ) -> None:
        res = await (
            self._db.table("player_ratings")
            .select("*")
            .eq("user_id", player.user_id)
            .maybe_single()
            .execute()
        )
        if not res or not res.data:
            return
        current = PublicPlayerRatings.model_validate(res.data)
        after = max(0, current.ranked_elo + delta)
        rating_update: PublicPlayerRatingsUpdate = {
            "ranked_elo": after,
            "ranked_wins": current.ranked_wins + (1 if won else 0),
            "ranked_losses": current.ranked_losses + (1 if lost else 0),
        }
        await self._db.table("player_ratings").update(_json_row(rating_update)).eq(
            "user_id", player.user_id
        ).execute()
        if after == current.ranked_elo:
            return
        history: PublicRatingHistoryInsert = {
            "user_id": uuid.UUID(player.user_id),
            "kind": "ranked",
            "rating_before": current.ranked_elo,
            "rating_after": after,
            "delta": after - current.ranked_elo,
            "source_kind": "match",
            "source_id": self.match.id,
        }
        await self._db.table("rating_history").insert(_json_row(history)).execute()


def _log_task_failure(task: asyncio.Task[None]) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.exception("pvp timeout timer crashed", exc_info=exc)


def _bank_patch(side: PublicMatchSide, bank_ms: int) -> PublicPvpMatchesUpdate:
    if side == "a":
        return {"player_a_bank_ms": bank_ms}
    return {"player_b_bank_ms": bank_ms}


def _match_move_out(move: PublicMatchMoves) -> MoveOut:
    """Full-content wire view of a match move (own thread / the post-match reveal)."""
    return move_out(move.position, move.speaker, move.content, move.eval_delta, move.eval_after)


async def _load_player(db: AsyncClient, user_id: str) -> _PlayerInfo:
    profile = await (
        db.table("profiles")
        .select("username, display_name, avatar_path")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    rating = await (
        db.table("player_ratings")
        .select("ranked_elo")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    prow = cast("dict[str, Any]", (profile.data if profile else None) or {})
    rrow = cast("dict[str, Any]", (rating.data if rating else None) or {})
    return _PlayerInfo(
        user_id=user_id,
        username=prow.get("username"),
        display_name=prow.get("display_name"),
        avatar_path=prow.get("avatar_path"),
        ranked_elo=int(rrow.get("ranked_elo", 1000)),
    )


# -- registry -------------------------------------------------------------------


class MatchRegistry:
    """match_id → live session, plus a user index. Single-process, like ConnectionManager."""

    def __init__(self) -> None:
        self._sessions: dict[str, MatchSession] = {}
        self._by_user: dict[str, str] = {}
        self._load_lock = asyncio.Lock()

    def add(self, session: MatchSession) -> None:
        self._sessions[session.match_id] = session
        for user_id in session.user_ids:
            self._by_user[user_id] = session.match_id

    def remove(self, session: MatchSession) -> None:
        self._sessions.pop(session.match_id, None)
        for user_id in session.user_ids:
            if self._by_user.get(user_id) == session.match_id:
                del self._by_user[user_id]

    def for_user(self, user_id: str) -> MatchSession | None:
        match_id = self._by_user.get(user_id)
        return self._sessions.get(match_id) if match_id else None

    async def get_or_load(
        self, db: AsyncClient, settings: Settings, engine: Engine, user_id: str
    ) -> MatchSession | None:
        """The user's live session, rebuilt from the DB after a backend restart if needed."""
        async with self._load_lock:
            existing = self.for_user(user_id)
            if existing is not None:
                return existing
            res = await (
                db.table("pvp_matches")
                .select("*, matches!inner(*)")
                .or_(f"player_a.eq.{user_id},player_b.eq.{user_id}")
                .eq("matches.status", "active")
                .limit(1)
                .execute()
            )
            rows = cast("list[dict[str, Any]]", res.data or [])
            if not rows:
                return None
            row = dict(rows[0])
            match = PublicMatches.model_validate(row.pop("matches"))
            pvp = PublicPvpMatches.model_validate(row)
            session = MatchSession(db, settings, engine, match, pvp)
            self.add(session)
            return session


registry = MatchRegistry()


# -- match creation ---------------------------------------------------------------


async def _create_match(
    db: AsyncClient,
    settings: Settings,
    engine: Engine,
    *,
    conn_a: PlayerConn,
    conn_b: PlayerConn,
    time_control: PublicTimeControl,
    rated: bool,
    persona_gender: PublicGender | None,
) -> MatchSession:
    """Insert a fresh lockstep match (side 'a' on the move, intro grace on the first turn),
    seed both opening moves, register the live session, and start the clock."""
    try:
        persona = await pick_persona(db, gender=persona_gender)
    except LookupError:
        if persona_gender is None:
            raise
        persona = await pick_persona(db)  # liquidity beats strictness
    base_seconds, increment_seconds = pvp_clock(settings, time_control)
    deadline = _now() + timedelta(seconds=base_seconds + settings.pvp_intro_grace_seconds)

    match_payload: PublicMatchesInsert = {
        "mode": "pvp",
        "persona_id": uuid.UUID(persona.id),
        "status": "active",
        "time_control": time_control,
        "base_seconds": base_seconds,
        "increment_seconds": increment_seconds,
        "max_exchanges": settings.pvp_max_exchanges,
        "rated": rated,
        "opening_line": persona.opening_line,
    }
    inserted = await db.table("matches").insert(_json_row(match_payload)).execute()
    match = PublicMatches.model_validate(cast("list[dict[str, Any]]", inserted.data)[0])
    pvp_payload: PublicPvpMatchesInsert = {
        "match_id": match.id,
        "player_a": uuid.UUID(conn_a.user_id),
        "player_b": uuid.UUID(conn_b.user_id),
        "turn_side": "a",
        "turn_deadline": deadline,
        "player_a_bank_ms": base_seconds * 1000,
        "player_b_bank_ms": base_seconds * 1000,
    }
    inserted_pvp = await db.table("pvp_matches").insert(_json_row(pvp_payload)).execute()
    pvp = PublicPvpMatches.model_validate(cast("list[dict[str, Any]]", inserted_pvp.data)[0])
    for side in ("a", "b"):
        opening: PublicMatchMovesInsert = {
            "match_id": match.id,
            "side": side,
            "position": 0,
            "speaker": "Match",
            "content": persona.opening_line,
        }
        await db.table("match_moves").insert(_json_row(opening)).execute()

    session = MatchSession(db, settings, engine, match, pvp)
    session.attach_initial("a", conn_a)
    session.attach_initial("b", conn_b)
    registry.add(session)
    session.start_clock()
    return session


# -- matchmaking ------------------------------------------------------------------


class MatchmakingService:
    """Vs stranger: pair players in the same time_control + gender + seeking pool (SPEC §2.7).

    The find-or-enqueue step runs under one in-process lock, so two concurrent joiners can't
    double-pair (single backend process; the queue row status is the future multi-process
    seam). Only waiters with a LIVE socket are pairable — rows whose socket died (crash,
    restart) are stale and swept on sight."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._waiting: dict[str, PlayerConn] = {}

    async def join(
        self,
        db: AsyncClient,
        settings: Settings,
        engine: Engine,
        conn: PlayerConn,
        time_control: PublicTimeControl,
    ) -> list[BaseModel]:
        profile = await (
            db.table("profiles")
            .select("gender, seeking")
            .eq("id", conn.user_id)
            .maybe_single()
            .execute()
        )
        prow = cast("dict[str, Any]", (profile.data if profile else None) or {})
        gender = cast("PublicGender | None", prow.get("gender"))
        seeking = cast("PublicGender | None", prow.get("seeking"))
        if gender is None or seeking is None:
            return [
                ErrorMsg(
                    code="profile_incomplete",
                    message="set your gender and who you're seeking before ranked play",
                )
            ]
        me = await _load_player(db, conn.user_id)

        async with self._lock:
            # Stale-row hygiene: any previous spot of ours is dead by definition.
            await db.table("matchmaking_queue").delete().eq("user_id", conn.user_id).execute()

            res = await (
                db.table("matchmaking_queue")
                .select("*")
                .eq("status", "queued")
                .eq("time_control", time_control)
                .eq("gender", gender)
                .eq("seeking", seeking)
                .neq("user_id", conn.user_id)
                .order("enqueued_at")
                .execute()
            )
            waiter_conn: PlayerConn | None = None
            waiter_row: PublicMatchmakingQueue | None = None
            for raw in cast("list[dict[str, Any]]", res.data or []):
                row = PublicMatchmakingQueue.model_validate(raw)
                candidate = self._waiting.get(str(row.user_id))
                if candidate is not None:
                    waiter_conn, waiter_row = candidate, row
                    break
                # Orphaned by a dead socket / restart: sweep it.
                await db.table("matchmaking_queue").delete().eq("id", str(row.id)).execute()

            if waiter_conn is None or waiter_row is None:
                queue_row: PublicMatchmakingQueueInsert = {
                    "user_id": uuid.UUID(conn.user_id),
                    "ranked_elo": me.ranked_elo,
                    "gender": gender,
                    "seeking": seeking,
                    "time_control": time_control,
                    "status": "queued",
                }
                await db.table("matchmaking_queue").insert(_json_row(queue_row)).execute()
                self._waiting[conn.user_id] = conn
                conn.queued = True
                return [QueuedMsg(time_control=time_control)]

            # Pair: the waiter was here first — they take side 'a' (and the first move).
            self._waiting.pop(str(waiter_row.user_id), None)
            waiter_conn.queued = False
            session = await _create_match(
                db,
                settings,
                engine,
                conn_a=waiter_conn,
                conn_b=conn,
                time_control=time_control,
                rated=True,
                persona_gender=seeking,
            )
            claim: PublicMatchmakingQueueUpdate = {
                "status": "completed",
                "matched_at": _now(),
                "match_id": session.match.id,
            }
            await db.table("matchmaking_queue").update(_json_row(claim)).eq(
                "id", str(waiter_row.id)
            ).execute()
            for message in await session.match_found_for("a"):
                await waiter_conn.send(message)
            return await session.match_found_for("b")

    async def leave(self, db: AsyncClient, conn: PlayerConn) -> list[BaseModel]:
        async with self._lock:
            conn.queued = False
            # Only tear down our own spot: a replaced socket's cleanup (4000) must not evict
            # the queue row its successor just inserted.
            if self._waiting.get(conn.user_id) is not conn:
                return [CancelledMsg()]
            self._waiting.pop(conn.user_id, None)
            await db.table("matchmaking_queue").delete().eq("user_id", conn.user_id).execute()
        return [CancelledMsg()]


# -- friend invites ------------------------------------------------------------------


class InviteService:
    """Vs friend: an unguessable code the creator shares as a link. Joining is service-side
    only (never PostgREST), the match is unrated, and the persona matches the creator's
    `seeking`. An invite lives exactly as long as the creator's waiting socket."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._open: dict[str, PlayerConn] = {}  # code → creator's conn

    async def create(
        self, db: AsyncClient, conn: PlayerConn, time_control: PublicTimeControl
    ) -> list[BaseModel]:
        code = secrets.token_urlsafe(12)
        invite: PublicMatchInvitesInsert = {
            "code": code,
            "creator": uuid.UUID(conn.user_id),
            "time_control": time_control,
            "status": "queued",
        }
        await db.table("match_invites").insert(_json_row(invite)).execute()
        async with self._lock:
            self._open[code] = conn
            conn.invite_code = code
        return [InviteCreatedMsg(code=code, time_control=time_control)]

    async def join(
        self,
        db: AsyncClient,
        settings: Settings,
        engine: Engine,
        conn: PlayerConn,
        code: str,
    ) -> list[BaseModel]:
        async with self._lock:
            creator_conn = self._open.get(code)
            if creator_conn is None:
                return [ErrorMsg(code="bad_code", message="this challenge is gone or was never real")]
            if creator_conn.user_id == conn.user_id:
                return [ErrorMsg(code="bad_code", message="you can't join your own challenge")]
            self._open.pop(code, None)
            creator_conn.invite_code = None

            invite_res = await (
                db.table("match_invites")
                .select("time_control")
                .eq("code", code)
                .maybe_single()
                .execute()
            )
            irow = cast("dict[str, Any]", (invite_res.data if invite_res else None) or {})
            time_control = cast("PublicTimeControl", irow.get("time_control", "rapid"))
            creator_profile = await (
                db.table("profiles")
                .select("seeking")
                .eq("id", creator_conn.user_id)
                .maybe_single()
                .execute()
            )
            crow = cast("dict[str, Any]", (creator_profile.data if creator_profile else None) or {})
            session = await _create_match(
                db,
                settings,
                engine,
                conn_a=creator_conn,
                conn_b=conn,
                time_control=time_control,
                rated=False,
                persona_gender=cast("PublicGender | None", crow.get("seeking")),
            )
            done: PublicMatchInvitesUpdate = {
                "status": "completed",
                "matched_at": _now(),
                "match_id": session.match.id,
            }
            await db.table("match_invites").update(_json_row(done)).eq("code", code).execute()
            for message in await session.match_found_for("a"):
                await creator_conn.send(message)
            return await session.match_found_for("b")

    async def cancel(self, db: AsyncClient, conn: PlayerConn) -> list[BaseModel]:
        async with self._lock:
            code = conn.invite_code
            conn.invite_code = None
            if code is None or self._open.get(code) is not conn:
                return [CancelledMsg()]
            self._open.pop(code, None)
        cancelled: PublicMatchInvitesUpdate = {"status": "cancelled"}
        await db.table("match_invites").update(_json_row(cancelled)).eq("code", code).execute()
        return [CancelledMsg()]


matchmaking = MatchmakingService()
invites = InviteService()
