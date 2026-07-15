"""Source-independent transcript loading for analysis.

A `Transcript` is just the ordered list of messages with their positions and sides, whatever
produced it: `load_game_transcript` reads solo/screenshot games from `moves`;
`load_match_transcript` reads ONE competitor's conversation from `match_moves` (keyed by
`(match_id, side)`, with `speaker` as the You/Match axis). The engine and validation stay
unaware of the source.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from supabase import AsyncClient

from ..database_types import PublicMatchMoves, PublicMatchSide, PublicMessageSide, PublicMoves


@dataclass(frozen=True)
class TranscriptMove:
    # Source moves.id, kept so game_analysis_moves.move_id can point back. None for match
    # sources — that FK references `moves` only, so match_moves rows are snapshotted by content.
    id: uuid.UUID | None
    position: int
    side: PublicMessageSide  # "You" | "Match"
    content: str


@dataclass(frozen=True)
class Transcript:
    source_id: uuid.UUID  # the game id, or the match id for one side of a PvP match
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
    return Transcript(source_id=game_id, moves=moves)


async def load_match_transcript(
    db: AsyncClient, match_id: uuid.UUID, side: PublicMatchSide
) -> Transcript:
    """One competitor's conversation with the persona — the analyzable unit of a PvP match."""
    res = await (
        db.table("match_moves")
        .select("*")
        .eq("match_id", str(match_id))
        .eq("side", side)
        .order("position")
        .execute()
    )
    rows = [PublicMatchMoves.model_validate(m) for m in (res.data or [])]
    moves = [
        TranscriptMove(id=None, position=m.position, side=m.speaker, content=m.content)
        for m in rows
    ]
    return Transcript(source_id=match_id, moves=moves)
