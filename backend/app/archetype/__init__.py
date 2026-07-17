"""Archetype classification (SPEC §9.1): the fixed shareable-card identity.

A cheap "lower-tier" model picks the play-style, writes the one-line flavor, and selects the
meme moment; the accuracy tier + legendary triggers are derived deterministically. Runs async
through the `game_archetype` pgmq queue (drained by the same worker as `game_analysis`).
"""
