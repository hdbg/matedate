"""Runtime configuration, loaded from the environment / a local .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase — the backend uses the *service-role* key so it bypasses RLS and is the
    # sole writer of live game state. Never expose this key to the client.
    supabase_url: str
    supabase_service_role_key: str

    # LLM access is provider-agnostic via OpenRouter (no vendor lock-in).
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-sonnet-4"

    # Solo PvE tuning. The clock is a per-game Fischer clock: the player starts with
    # `solo_base_seconds` and gains `solo_increment_seconds` back after each submitted move.
    solo_base_seconds: int = 30
    solo_increment_seconds: int = 5
    solo_max_exchanges: int = 6
    # One-time pre-game grace baked into the FIRST turn's deadline so the client's "opponent found"
    # intro plays off-clock: the player still gets the full base bank once play begins. Keep this in
    # sync with the frontend intro duration (`INTRO_MS` in app/match/components/MatchIntro.tsx).
    solo_intro_grace_seconds: int = 5

    # Ranked PvP (SPEC §2.2, §2.6). Per-player Fischer clocks; the time-control pools map to
    # (base, increment) via `pvp_clock` below and are snapshotted onto the match row, so tuning
    # these never rewrites a live match. The intro grace mirrors the solo one (first turn only).
    pvp_bullet_base_seconds: int = 20
    pvp_bullet_increment_seconds: int = 3
    pvp_rapid_base_seconds: int = 40
    pvp_rapid_increment_seconds: int = 5
    pvp_classical_base_seconds: int = 60
    pvp_classical_increment_seconds: int = 8
    pvp_max_exchanges: int = 6
    pvp_intro_grace_seconds: int = 5
    pvp_elo_k: int = 32
    # Future premium: when true, opponent message content rides the live opp_move/match_state
    # frames instead of being nulled out (the wire always carries the field; this is the gate).
    pvp_live_transcript: bool = False

    # Post-game deep analysis (chess.com "game review" style). Runs on a stronger model than
    # live play, still via OpenRouter (same key). A separate worker consumes the game_analysis
    # pgmq queue. FAKE_ENGINE / an empty OPENROUTER_API_KEY switches analysis to the fake engine
    # too. The visibility timeout must exceed the model's worst-case latency, or an in-flight job
    # can be redelivered and analyzed twice.
    analysis_model: str = "anthropic/claude-opus-4.1"
    analysis_visibility_timeout_seconds: int = 300
    analysis_max_attempts: int = 3
    analysis_poll_seconds: float = 2.0

    # Archetype classification (SPEC §9.1) — the shareable-card identity. A CHEAP "lower-tier"
    # model only picks the play-style, writes the flavor line, and selects the meme moment; the
    # tier + legendary triggers are derived deterministically server-side. Runs async through its
    # own game_archetype pgmq queue (drained by the same worker as game_analysis, concurrently).
    # `archetype_timeout_seconds` bounds the single model call before the deterministic fallback.
    archetype_model: str = "anthropic/claude-haiku-4-5"
    archetype_prompt_version: str = "v1"
    archetype_timeout_seconds: float = 20.0
    archetype_visibility_timeout_seconds: int = 60
    archetype_max_attempts: int = 3
    archetype_poll_seconds: float = 2.0
    # Legendary thresholds (SPEC §9.1 "starting points" — tune against real data to keep them rare).
    archetype_brilliancy_swing: float = 4.0  # a !!-move swing this big → The Brilliancy
    archetype_comeback_low: float = 20.0  # interior eval dipping below this → near-dead
    archetype_comeback_recover: float = 70.0  # …then final eval at/above this (or a win) → Comeback
    archetype_scholars_max_messages: int = 4  # positive close within this many You-messages
    archetype_scholars_min_accuracy: float = 80.0
    archetype_massacre_max_accuracy: float = 10.0  # accuracy below this → The Massacre
    archetype_massacre_blunder_ratio: float = 0.8  # …or this share of moves are Blunders

    # Dev/test escape hatch: when true, skip the real LLM and use a deterministic
    # heuristic engine so the full WebSocket flow can be exercised without a live key.
    fake_engine: bool = False


def pvp_clock(settings: Settings, time_control: str) -> tuple[int, int]:
    """(base_seconds, increment_seconds) for a time-control pool."""
    if time_control == "bullet":
        return settings.pvp_bullet_base_seconds, settings.pvp_bullet_increment_seconds
    if time_control == "classical":
        return settings.pvp_classical_base_seconds, settings.pvp_classical_increment_seconds
    return settings.pvp_rapid_base_seconds, settings.pvp_rapid_increment_seconds


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
