"""A single async service-role Supabase client (bypasses RLS; the only writer of game state)."""

from functools import lru_cache

from supabase import AsyncClient

from .config import get_settings


@lru_cache
def get_supabase() -> AsyncClient:
    settings = get_settings()
    # AsyncClient constructs synchronously; its queries are awaited so DB I/O never blocks
    # the event loop.
    return AsyncClient(settings.supabase_url, settings.supabase_service_role_key)
