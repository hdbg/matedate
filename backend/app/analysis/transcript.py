"""Source-independent transcript loading for analysis.

A `Transcript` is just the ordered list of messages with their positions and sides. Today the
only loader reads solo/screenshot games from `moves`; PvP rounds (which live in `match_moves`)
would get a second loader that produces the same `Transcript` shape, so the engine and
persistence stay unaware of the source.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from supabase import AsyncClient

from ..database_types import PublicMessageSide, PublicMoves


@dataclass(frozen=True)
class TranscriptMove:
    id: uuid.UUID  # source moves.id, kept so game_analysis_moves.move_id can point back
    position: int
    side: PublicMessageSide  # "You" | "Match"
    content: str


@dataclass(frozen=True)
class Transcript:
    game_id: uuid.UUID
    moves: list[TranscriptMove]

    @property
    def you_moves(self) -> list[TranscriptMove]:
        return [m for m in self.moves if m.side == "You"]

    def rendered(self) -> str:
        """The conversation as `[<position>] You/Match: <text>` lines, ordered by position.

        Positions are embedded so the model echoes them back exactly when it annotates the
        You-side messages.
        """
        return "\n".join(f"[{m.position}] {m.side}: {m.content}" for m in self.moves)


async def load_game_transcript(db: AsyncClient, game_id: uuid.UUID) -> Transcript:
    res = await (
        db.table("moves")
        .select("*")
        .eq("game_id", str(game_id))
        .order("position")
        .execute()
    )
    rows = [PublicMoves.model_validate(m) for m in (res.data or [])]
    moves = [
        TranscriptMove(id=m.id, position=m.position, side=m.side, content=m.content)
        for m in rows
    ]
    return Transcript(game_id=game_id, moves=moves)
