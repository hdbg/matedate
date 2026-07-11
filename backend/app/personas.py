"""Persona loading. Reads the public catalog plus the RLS-gated secret (service role only)."""

import random
from dataclasses import dataclass

from supabase import AsyncClient

from .database_types import PublicGender, PublicPersonas, PublicPersonaSecrets

# Shown to the player under the persona name. The real hidden_type is never sent mid-game
# (SPEC §2.2 — players must *read* the type); it stays server-side for grading only.
HIDDEN_HINT = "🎭 type: hidden — read them"


@dataclass(frozen=True)
class Persona:
    id: str
    slug: str
    name: str
    gender: PublicGender
    opening_line: str
    suggested_messages: list[str]  # free opener suggestions, shown to the player
    hidden_type: str | None
    system_prompt: str


async def pick_persona(
    supabase: AsyncClient, slug: str | None = None, gender: PublicGender | None = None
) -> Persona:
    """Load one active persona with its secret.

    Filters to `gender` when given (VS-AI serves a persona of the player's sought gender, SPEC §2)
    and to `slug` when given; otherwise picks a random active persona.
    """
    query = supabase.table("personas").select("*").eq("is_active", True)
    if gender:
        query = query.eq("gender", gender)
    if slug:
        query = query.eq("slug", slug)
    res = await query.execute()
    rows = res.data or []
    if not rows:
        criteria = ", ".join(filter(None, [f"slug={slug!r}" if slug else "", f"gender={gender!r}" if gender else ""]))
        raise LookupError(f"no active persona{f' ({criteria})' if criteria else ''}")
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
        gender=persona.gender,
        opening_line=persona.opening_line,
        suggested_messages=list(persona.suggested_messages or []),
        hidden_type=row.hidden_type,
        system_prompt=row.system_prompt,
    )
