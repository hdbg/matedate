"""Typed WebSocket message envelopes (JSON, discriminated on `type`).

Solo PvE rides `/ws` (ClientMove in; new_game/game_state/response/finish out). Ranked PvP
rides `/ws/match` and adds the intent messages (queue / create_invite / join_invite / cancel)
plus the match_* frames; `move` and `response`/`error` are shared between both sockets.
"""

from typing import Literal

from pydantic import BaseModel

from .database_types import PublicMatchSide, PublicTimeControl
from .grading import MoveClassKey

# ---------------------------------------------------------------------------
# Client -> server
# ---------------------------------------------------------------------------


class ClientMove(BaseModel):
    type: Literal["move"]
    content: str


class QueueMsg(BaseModel):
    """Join the ranked matchmaking queue (pairs same time_control + gender + seeking)."""

    type: Literal["queue"]
    time_control: PublicTimeControl = "rapid"


class CreateInviteMsg(BaseModel):
    """Open a friend challenge: the reply carries a shareable, unguessable code."""

    type: Literal["create_invite"]
    time_control: PublicTimeControl = "rapid"


class JoinInviteMsg(BaseModel):
    type: Literal["join_invite"]
    code: str


class CancelMsg(BaseModel):
    """Leave the queue / cancel an open invite (whichever is pending)."""

    type: Literal["cancel"]


# ---------------------------------------------------------------------------
# Shared sub-objects
# ---------------------------------------------------------------------------


class PersonaOut(BaseModel):
    slug: str
    name: str
    hint: str  # "type: hidden" teaser; never the real hidden_type
    opening_line: str
    suggested_messages: list[str] = []  # free opener suggestions (not the paid best move)


class MoveOut(BaseModel):
    position: int
    side: Literal["You", "Match"]
    content: str
    classification: MoveClassKey | None = None  # only on graded "You" moves
    swing: float | None = None


class OpponentOut(BaseModel):
    """The human on the other side of a PvP match."""

    username: str | None = None
    display_name: str | None = None
    avatar_path: str | None = None
    ranked_elo: int | None = None  # null on unrated (friend) matches


class OppMoveOut(BaseModel):
    """One move in the OPPONENT's conversation. `content` is null while the live-transcript
    gate is closed (a future premium reveal) — the glyph/swing still flow, so the client can
    render the opponent's eval bar and move-quality row without seeing their words. The full
    content arrives with `match_finish` (and via RLS once the match is over)."""

    position: int
    speaker: Literal["You", "Match"]  # 'You' = the opponent themself, 'Match' = the persona
    content: str | None = None
    classification: MoveClassKey | None = None  # only on graded 'You' moves
    swing: float | None = None


# ---------------------------------------------------------------------------
# Server -> client
# ---------------------------------------------------------------------------


class NewGameMsg(BaseModel):
    type: Literal["new_game"] = "new_game"
    persona: PersonaOut
    time: int  # base game clock, ms (starting time bank; Fischer clock, SPEC §2.6)


class GameStateMsg(BaseModel):
    """Sent on reconnect to resume an in-progress game."""

    type: Literal["game_state"] = "game_state"
    persona: PersonaOut
    moves: list[MoveOut]
    time: int  # base game clock, ms (reference/full bank)
    time_left: int  # ms left in the running bank for the currently open turn
    status: str


class ResponseMsg(BaseModel):
    type: Literal["response"] = "response"
    content: str  # persona's in-character reply
    classification: MoveClassKey  # verdict on the player's move
    swing: float
    time_left: int  # ms in the player's bank for the upcoming turn (leftover + increment)


class FinishMsg(BaseModel):
    type: Literal["finish"] = "finish"
    end_reason: str  # 'scored' | 'timeout' | 'blocked' | 'date_landed' | ...
    accuracy: float
    rating_delta: int
    moves: list[MoveOut]
    title: str
    description: str
    game_id: str  # the finished game, so the client can request a deep review via RPC


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str


# ---------------------------------------------------------------------------
# Server -> client: ranked PvP (/ws/match)
# ---------------------------------------------------------------------------


class QueuedMsg(BaseModel):
    """In the matchmaking queue; a match_found follows whenever a compatible player arrives."""

    type: Literal["queued"] = "queued"
    time_control: PublicTimeControl


class CancelledMsg(BaseModel):
    """Left the queue / the open invite was cancelled."""

    type: Literal["cancelled"] = "cancelled"


class InviteCreatedMsg(BaseModel):
    """The friend challenge is open; share the code (the client renders it as a /join link).
    The invite lives only while this socket stays connected."""

    type: Literal["invite_created"] = "invite_created"
    code: str
    time_control: PublicTimeControl


class MatchFoundMsg(BaseModel):
    """A PvP match starts. Side 'a' always moves first; a turn frame follows for the clock."""

    type: Literal["match_found"] = "match_found"
    match_id: str
    your_side: PublicMatchSide
    rated: bool
    time_control: PublicTimeControl
    time: int  # base Fischer bank per player, ms
    increment: int  # ms gained back per submitted move
    max_exchanges: int  # per-player exchange cap
    persona: PersonaOut
    opponent: OpponentOut


class MatchStateMsg(BaseModel):
    """Sent on reconnect to resume an in-progress match (the PvP mirror of game_state)."""

    type: Literal["match_state"] = "match_state"
    match_id: str
    your_side: PublicMatchSide
    rated: bool
    time_control: PublicTimeControl
    time: int
    increment: int
    max_exchanges: int
    persona: PersonaOut
    opponent: OpponentOut
    your_moves: list[MoveOut]
    opp_moves: list[OppMoveOut]  # content-gated (see OppMoveOut)
    turn: Literal["you", "opponent", "processing"]  # processing = a move is being graded
    your_time_left: int  # ms — live countdown if it's your turn, else your bank at rest
    opp_time_left: int


class OppMovedMsg(BaseModel):
    """The opponent completed an exchange in THEIR conversation: their move + the persona's
    reply, content-gated (see OppMoveOut)."""

    type: Literal["opp_move"] = "opp_move"
    move: OppMoveOut
    reply: OppMoveOut


class TurnMsg(BaseModel):
    """The turn passed. time_left is the on-move player's bank (their clock is the one running)."""

    type: Literal["turn"] = "turn"
    turn: Literal["you", "opponent"]
    time_left: int


class MatchFinishMsg(BaseModel):
    """The match is over. Carries the full opponent transcript — the post-match reveal."""

    type: Literal["match_finish"] = "match_finish"
    match_id: str
    result: Literal["win", "loss", "draw"]
    end_reason: str  # 'scored' | 'timeout' | 'blocked' | 'date_landed' | ...
    your_accuracy: float
    opp_accuracy: float
    rating_delta: int  # your ranked elo change; 0 on unrated matches
    your_moves: list[MoveOut]
    opp_moves: list[MoveOut]  # full content now — the reveal
    opponent: OpponentOut
    title: str
    description: str
