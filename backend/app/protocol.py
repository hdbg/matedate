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
    time: int  # per-move clock budget, ms


class GameStateMsg(BaseModel):
    """Sent on reconnect to resume an in-progress game."""

    type: Literal["game_state"] = "game_state"
    persona: PersonaOut
    moves: list[MoveOut]
    time: int  # per-move clock budget, ms (so resumed later turns reset correctly)
    time_left: int  # ms remaining in the currently open turn
    status: str


class ResponseMsg(BaseModel):
    type: Literal["response"] = "response"
    content: str  # persona's in-character reply
    classification: MoveClassKey  # verdict on the player's move
    swing: float
    time_left: int  # ms that were left in the move the player just submitted


class FinishMsg(BaseModel):
    type: Literal["finish"] = "finish"
    end_reason: str  # 'scored' | 'timeout' | ...
    accuracy: float
    rating_delta: int
    moves: list[MoveOut]
    title: str
    description: str


class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
