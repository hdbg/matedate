"""The 20 fixed archetypes (SPEC §9.1) — the single source of truth for the grid + legendaries.

Keys are stable slugs (the DB `archetype` enum + the frontend map mirror this list). Display
titles live on the frontend (`app/lib/game/archetypes.ts`), like the Brilliant…Blunder vocab —
the backend only ever deals in keys, so there's no title to keep in sync here.
"""

from __future__ import annotations

from typing import Literal, get_args

from ..database_types import PublicArchetype, PublicArchetypeStyle, PublicArchetypeTier

ArchetypeKey = PublicArchetype  # the 20-value Literal generated from the DB enum
Tier = PublicArchetypeTier  # "low" | "shaky" | "solid" | "high"
Style = PublicArchetypeStyle  # "bold" | "smooth" | "dry" | "chaotic"

LegendaryKey = Literal["scholars_mate", "the_comeback", "the_brilliancy", "the_massacre"]

# The 16 core cells: GRID[style][tier] → the fixed identity (SPEC §9.1 table).
GRID: dict[Style, dict[Tier, ArchetypeKey]] = {
    "bold": {
        "low": "all_gas_no_brakes",
        "shaky": "loose_cannon",
        "solid": "the_gambler",
        "high": "the_closer",
    },
    "smooth": {
        "low": "certified_cornball",
        "shaky": "the_overthinker",
        "solid": "the_diplomat",
        "high": "smooth_operator",
    },
    "dry": {
        "low": "ghosted_loading",
        "shaky": "one_word_wonder",
        "solid": "the_minimalist",
        "high": "the_enigma",
    },
    "chaotic": {
        "low": "the_trainwreck",
        "shaky": "feral_texter",
        "solid": "certified_menace",
        "high": "chaos_charmer",
    },
}

# When several legendaries fire, the first here wins (SPEC §9.1 resolution rule).
LEGENDARY_PRIORITY: tuple[LegendaryKey, ...] = (
    "the_brilliancy",
    "scholars_mate",
    "the_comeback",
    "the_massacre",
)

LEGENDARY_KEYS: frozenset[str] = frozenset(get_args(LegendaryKey))
STYLES: tuple[Style, ...] = get_args(Style)
