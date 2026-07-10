"""Persona loading. Reads the public catalog plus the RLS-gated secret (service role only)."""

import random
from dataclasses import dataclass

from supabase import AsyncClient

from .database_types import PublicPersonas, PublicPersonaSecrets

# Shown to the player under the persona name. The real hidden_type is never sent mid-game
# (SPEC §2.2 — players must *read* the type); it stays server-side for grading only.
HIDDEN_HINT = "🎭 type: hidden — read them"


@dataclass(frozen=True)
class Persona:
    id: str
    slug: str
    name: str
    opening_line: str
    hidden_type: str | None
    system_prompt: str


async def pick_persona(supabase: AsyncClient, slug: str | None = None) -> Persona:
    """Load one active persona (a specific slug, or a random active one) with its secret."""
    query = supabase.table("personas").select("*").eq("is_active", True)
    if slug:
        query = query.eq("slug", slug)
    res = await query.execute()
    rows = res.data or []
    if not rows:
        raise LookupError(f"no active persona{f' {slug!r}' if slug else ''}")
    row = random.choice(rows) if slug is None else rows[0]
    return await _with_secret(supabase, PublicPersonas.model_validate(row))


async def get_persona_by_id(supabase: AsyncClient, persona_id: str) -> Persona:
    """Load a specific persona (with its secret) by id — used to resume/continue a game."""
    row = await (
        supabase.table("personas")
        .select("*")
        .eq("id", persona_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        raise LookupError(f"persona {persona_id!r} not found")
    return await _with_secret(supabase, PublicPersonas.model_validate(row.data))


async def _with_secret(supabase: AsyncClient, persona: PublicPersonas) -> Persona:
    secret = await (
        supabase.table("persona_secrets")
        .select("*")
        .eq("persona_id", str(persona.id))
        .maybe_single()
        .execute()
    )
    if not secret or not secret.data:
        raise LookupError(f"persona {persona.slug!r} has no secret configured")
    row = PublicPersonaSecrets.model_validate(secret.data)
    return Persona(
        id=str(persona.id),
        slug=persona.slug,
        name=persona.name,
        opening_line=persona.opening_line,
        hidden_type=row.hidden_type,
        system_prompt=row.system_prompt,
    )
