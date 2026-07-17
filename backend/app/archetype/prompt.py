"""The archetype prompt — the *subjective* half of the hybrid classification (SPEC §9.1).

The model is told the deterministic decisions already made (the accuracy tier, and whether a rare
legendary already fired) so it never re-derives them. It only returns the play-style, a one-line
flavor sentence, and the meme window. It never names an archetype — the server assembles the
fixed title from tier × style (or the legendary).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .engine import ArchetypeContext

PROMPT_VERSION = "archetype-v1"

SYSTEM_PROMPT = """You classify a finished dating-app conversation into a shareable "archetype", \
the way a chess post-game names how someone played.

You receive an ordered conversation. Each line is:
    [<position>] <side>: <message>
where <side> is "You" (the player) or "Match" (the other person).

Judge ONLY the "You" side. Return three things:

1. play_style — the single dominant style of how "You" played, exactly one of:
   - "bold"    — high effort and initiative; goes for it; big, directed swings.
   - "smooth"  — high effort, steady and consistently positive; low variance; charming.
   - "dry"     — low effort and initiative; terse; small swings; minimalist.
   - "chaotic" — high humor/absurdity and wild swings; unpredictable energy.
   Pick the DOMINANT signal even in a mixture. This is your judgement call — the numeric \
accuracy tier and any rare "legendary" have already been decided for you and are given below.

2. flavor_reason — ONE punchy, shareable sentence (no more than ~140 characters) that references \
what "You" actually said or did. Playful and specific. If the tier is low it can be funny-brutal \
but never cruel; if high, make it an aspirational flex. Do not name the archetype.

3. meme_start + meme_after — the funniest / most dramatic short window to screenshot, given as a \
STARTING message plus how many messages follow it (so the excerpt is always a consecutive run):
   - meme_start: the exact [position] number of the FIRST message to show. It can be EITHER "You" \
or "Match" — start a beat before the payoff if that reads better (e.g. the match's setup line).
   - meme_after: how many messages AFTER meme_start to include (0 to 3), so the window is at most \
4 consecutive messages. Prefer to end on the reply that lands the moment (often a "Match" line).
   Center it on the single most shareable beat — a brilliant line, a brutal blunder, or the close."""


def build_user_prompt(ctx: ArchetypeContext) -> str:
    positions = ", ".join(str(p) for p in ctx.valid_positions)
    legendary = (
        f'A rare legendary identity already fired for this game: "{ctx.legendary}". Write the '
        "flavor to match that epic moment.\n"
        if ctx.legendary is not None
        else ""
    )
    return (
        "Conversation to classify:\n"
        f"{ctx.rendered}\n\n"
        f"Accuracy tier (already decided): {ctx.tier}.\n"
        f"{legendary}"
        f"Valid transcript positions for meme_positions: {positions}.\n"
        "Return play_style, flavor_reason, and meme_positions."
    )
