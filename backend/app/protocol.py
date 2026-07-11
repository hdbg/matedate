"""Typed WebSocket message envelopes (JSON, discriminated on `type`)."""

from typing import Literal

from pydantic import BaseModel

from .grading import MoveClassKey

# ---------------------------------------------------------------------------
# Client -> server
# ---------------------------------------------------------------------------


class ClientMove(BaseModel):
    type: Literal["move"]
    content: str


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
