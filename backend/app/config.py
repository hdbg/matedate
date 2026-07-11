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

    # Post-game deep analysis (chess.com "game review" style). Runs on a stronger model than
    # live play, still via OpenRouter (same key). A separate worker consumes the game_analysis
    # pgmq queue. FAKE_ENGINE / an empty OPENROUTER_API_KEY switches analysis to the fake engine
    # too. The visibility timeout must exceed the model's worst-case latency, or an in-flight job
    # can be redelivered and analyzed twice.
    analysis_model: str = "anthropic/claude-opus-4.1"
    analysis_visibility_timeout_seconds: int = 300
    analysis_max_attempts: int = 3
    analysis_poll_seconds: float = 2.0

    # Dev/test escape hatch: when true, skip the real LLM and use a deterministic
    # heuristic engine so the full WebSocket flow can be exercised without a live key.
    fake_engine: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
