"""Generate personas with a local LM Studio model, review them, then seed them.

Two-step, no direct DB writes:

    uv run python -m scripts.generate_personas generate [--model <key>] [-n N]
        # rolls the 8 personality dimensions per persona, asks the local model for a
        # full character sheet, writes generated_personas.json for review
    uv run python -m scripts.generate_personas seed [file]
        # appends the reviewed file to supabase/seed.sql as idempotent inserts
        # (then re-apply with `supabase db reset`)

Each persona starts from a random roll of the eight personality dimensions (1-10) plus a
gender; the model writes a character sheet to match — identity (name/age/job/backstory/
interests/texting style), the public half (description, opening line, suggested openers),
and the engine-facing behavior (hidden type, green flags, red flags, block triggers). The
live `system_prompt` is composed deterministically from those parts, so every generated
persona role-plays with the same structure. Difficulty and boss status are derived
deterministically from the roll, never by the model — edit the JSON before seeding if
you disagree.

`generate` needs the LM Studio server running (default http://127.0.0.1:1234, override
LMSTUDIO_BASE_URL); without --model it lists the downloaded LLMs and asks.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from scripts.lmstudio import (
    LMStudioClient,
    LMStudioError,
    PersonalityDims,
    choose_model,
    slugify,
)
from scripts.seed_sql import SEED_SQL, append_block, quote, quote_array

DEFAULT_OUT = "generated_personas.json"

Gender = Literal["man", "woman"]
GENDERS: tuple[Gender, ...] = ("man", "woman")

SYSTEM_PROMPT = """\
You are a content author for MateDate, a chess-styled dating game. The player chats with
an AI "date" persona; an engine scores the persona's interest 0-100 after every player
message and grades each message like a chess move (Brilliant, Great, Good, Inaccuracy,
Mistake, Blunder). Genuinely creepy or offensive messages make the persona block the
player and end the game. You write new personas as complete character sheets.

Craft rules:
- Be specific, never generic. "loves travel, coffee and dogs" is a failed persona;
  "collects arguments about why every city's best museum is the weird small one" is not.
- The personality dimensions you are given are law. Extreme dials (1-2 or 9-10) must
  dominate the voice; mid dials should barely show. A warmth-2 persona does not use pet
  names; a chaos-9 persona does not ask polite interview questions.
- Everything must cohere: the job, the backstory, the interests, the texting style, the
  opening line, and what they reward or punish should all feel like one person.
- The hidden "type" is a short archetype the player is supposed to infer mid-game from
  behavior (like "dry wit" or "earnest & warm") — the description may hint at it but
  must never name it.\
"""

USER_PROMPT_TEMPLATE = """\
Create one dating-app persona: a {gender} with exactly this personality (each dimension 1-10):

{dims}

Return every field of the character sheet:
- first_name: first name only — inventive, any culture, fitting a {gender}. age: 21-39.
- job: their actual job or occupation, one line, specific (not "works in marketing").
- backstory: 2-3 sentences of who they are — where their edge/softness comes from, one
  concrete detail a date would remember. Written in second person ("You grew up …"),
  it will be pasted into their role-play instructions.
- interests: 3-5 short entries, each specific enough to argue about (no "music, movies").
- texting_style: 2-3 sentences describing exactly how they type: message length,
  capitalization, punctuation, emoji habits, signature quirks (trailing "lol", tildes,
  voice-of-god full sentences, whatever fits the dials).
- description: 1-2 punchy player-facing sentences that hint at the vibe without naming
  the hidden type (compare: "Sharp, teasing, rewards conviction. Reads as dry wit until
  you commit to a bit.").
- opening_line: their first message, in their exact texting style — dating-app tone,
  ending in a hook the player has to respond to.
- suggested_messages: exactly 3 candidate player replies to that opening line — one
  bold/high-risk, one safe/solid, one lazy low-effort, in that order.
- hidden_type: the archetype, 2-4 words.
- green_flags: 3-4 kinds of player messages this persona rewards with rising interest,
  specific to this personality.
- red_flags: 3-4 kinds of player messages that drop their interest, specific to this
  personality.
- block_triggers: 1-3 things that make this persona block instantly (beyond the obvious
  creepiness every persona blocks).
Do not mention the numeric scores anywhere in the output.\
"""


class GeneratedPersona(BaseModel):
    """The character sheet the local model returns; ranges re-checked here because
    llama.cpp grammars can't express numeric bounds."""

    first_name: str = Field(min_length=2, max_length=40)
    age: int = Field(ge=21, le=39)
    job: str = Field(min_length=5)
    backstory: str = Field(min_length=60)
    interests: list[str] = Field(min_length=3, max_length=5)
    texting_style: str = Field(min_length=40)
    description: str = Field(min_length=20)
    opening_line: str = Field(min_length=10)
    suggested_messages: list[str] = Field(min_length=3, max_length=3)
    hidden_type: str = Field(min_length=3, max_length=60)
    green_flags: list[str] = Field(min_length=3, max_length=4)
    red_flags: list[str] = Field(min_length=3, max_length=4)
    block_triggers: list[str] = Field(min_length=1, max_length=3)


class PersonaRecord(BaseModel):
    """One reviewed persona in the JSON file — every field here is seedable/editable.
    `system_prompt` is the composed character sheet the live engine will role-play from;
    edit it directly if the review changes anything."""

    slug: str
    name: str
    gender: Gender
    difficulty: int = Field(ge=1, le=3)
    is_boss: bool
    description: str
    opening_line: str
    suggested_messages: list[str] = Field(min_length=3, max_length=3)
    hidden_type: str
    system_prompt: str
    dimensions: dict[str, int]


class PersonaFile(BaseModel):
    kind: Literal["personas"] = "personas"
    model: str
    generated_at: str
    personas: list[PersonaRecord]


def compose_system_prompt(gen: GeneratedPersona, dims: PersonalityDims, gender: Gender) -> str:
    """The live role-play prompt, assembled from the character sheet. Structured the same
    for every persona so the engine's behavior stays predictable; the exact dial settings
    ride along so it plays the personality the sheet was written from. This lands in
    persona_secrets (service_role-only) — never shown to players."""

    def bullets(items: list[str]) -> str:
        return "\n".join(f"- {item}" for item in items)

    return f"""\
You are {gen.first_name}, a {gen.age}-year-old {gender} ({gen.job}) on a dating app, \
talking to someone who just matched with you. Stay in character; never reveal you are \
an AI or that you are being scored.

{gen.backstory}

Your type, which the other person should be able to infer from how you behave (never \
state it): {gen.hidden_type}.

Interests you actually bring up and riff on: {"; ".join(gen.interests)}.

Texting style: {gen.texting_style}

Raise your interest when they send (green flags):
{bullets(gen.green_flags)}

Drop your interest when they send (red flags):
{bullets(gen.red_flags)}

Block them instantly if they (besides anything genuinely creepy or offensive):
{bullets(gen.block_triggers)}

Personality dials (1-10):
{dims.render()}"""


def to_record(gen: GeneratedPersona, dims: PersonalityDims, gender: Gender) -> PersonaRecord:
    return PersonaRecord(
        # Random suffix keeps the unique slug safe across repeated generations.
        slug=f"{slugify(gen.first_name)}-{secrets.token_hex(2)}",
        name=f"{gen.first_name}, {gen.age}",
        gender=gender,
        difficulty=dims.difficulty,
        is_boss=dims.is_boss,
        description=gen.description,
        opening_line=gen.opening_line,
        suggested_messages=gen.suggested_messages,
        hidden_type=gen.hidden_type,
        system_prompt=compose_system_prompt(gen, dims, gender),
        dimensions=dims.scores,
    )


async def generate(args: argparse.Namespace) -> None:
    out = Path(args.out)
    if out.exists() and not args.force:
        raise SystemExit(f"{out} already exists — seed or delete it first, or pass --force")
    client = LMStudioClient(args.base_url)
    try:
        model = await choose_model(client, args.model)
        rng = random.Random(args.seed)
        records: list[PersonaRecord] = []
        for i in range(1, args.count + 1):
            dims = PersonalityDims.roll(rng)
            gender = rng.choice(GENDERS)
            gen = await client.generate(
                model=model,
                output_type=GeneratedPersona,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=USER_PROMPT_TEMPLATE.format(dims=dims.render(), gender=gender),
                temperature=args.temperature,
            )
            record = to_record(gen, dims, gender)
            boss = " · BOSS" if record.is_boss else ""
            print(f"[{i}/{args.count}] {record.name}  ({record.slug}, {record.gender}, difficulty {record.difficulty}{boss})")
            print(f"    dims: {dims.summary()}")
            print(f"    {gen.job} · {record.hidden_type}")
            print(f"    opener: {record.opening_line}")
            records.append(record)
    finally:
        await client.aclose()
    doc = PersonaFile(model=model, generated_at=datetime.now(UTC).isoformat(), personas=records)
    out.write_text(json.dumps(doc.model_dump(), indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {len(records)} persona(s) to {out} — review/edit, then:")
    print(f"    uv run python -m scripts.generate_personas seed {out}")


def persona_sql(doc: PersonaFile) -> str:
    """Idempotent seed block in the style of the hand-written rows in seed.sql."""
    values = ",\n".join(
        "  (\n"
        f"    {quote(p.slug)},\n"
        f"    {quote(p.name)},\n"
        f"    {quote(p.gender)},\n"
        f"    {p.difficulty},\n"
        f"    {'true' if p.is_boss else 'false'},\n"
        "    true,\n"
        f"    {quote(p.description)},\n"
        f"    {quote(p.opening_line)},\n"
        f"    {quote_array(p.suggested_messages, indent='    ')}\n"
        "  )"
        for p in doc.personas
    )
    secrets_values = ",\n".join(
        f"    ({quote(p.slug)}, {quote(p.hidden_type)}, {quote(p.system_prompt)})"
        for p in doc.personas
    )
    date = doc.generated_at[:10]
    return f"""\
-- Generated personas (scripts/generate_personas.py, model {doc.model}, {date}).
insert into public.personas (slug, name, gender, difficulty, is_boss, is_active, description, opening_line, suggested_messages)
values
{values}
on conflict (slug) do nothing;

insert into public.persona_secrets (persona_id, hidden_type, system_prompt)
select p.id, s.hidden_type, s.system_prompt
from public.personas p
join (
  values
{secrets_values}
) as s(slug, hidden_type, system_prompt) on s.slug = p.slug
on conflict (persona_id) do nothing;\
"""


def seed(args: argparse.Namespace) -> None:
    source = Path(args.file)
    if not source.exists():
        raise SystemExit(f"{source} not found — run the generate step first")
    try:
        doc = PersonaFile.model_validate_json(source.read_text())
    except ValidationError as exc:
        raise SystemExit(f"{source} is not a valid persona file:\n{exc}") from exc
    if not doc.personas:
        raise SystemExit(f"{source} contains no personas")
    seed_file = Path(args.seed_file)
    append_block(persona_sql(doc), seed_file)
    slugs = ", ".join(p.slug for p in doc.personas)
    print(f"appended {len(doc.personas)} persona(s) to {seed_file}: {slugs}")
    print("apply with `supabase db reset` (from the repo root)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate personas with a local LM Studio model.")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate", help="generate personas into a JSON file for review")
    gen.add_argument("--model", help="LM Studio model key (omit to pick interactively)")
    gen.add_argument("--count", "-n", type=int, default=1, help="how many personas (default 1)")
    gen.add_argument("--temperature", type=float, default=0.8)
    gen.add_argument("--seed", type=int, help="RNG seed for reproducible dimension rolls")
    gen.add_argument("--base-url", help="LM Studio server URL (default LMSTUDIO_BASE_URL or http://127.0.0.1:1234)")
    gen.add_argument("--out", default=DEFAULT_OUT, help=f"output JSON file (default {DEFAULT_OUT})")
    gen.add_argument("--force", action="store_true", help="overwrite an existing output file")

    sd = sub.add_parser("seed", help="append a reviewed JSON file to supabase/seed.sql")
    sd.add_argument("file", nargs="?", default=DEFAULT_OUT, help=f"reviewed JSON file (default {DEFAULT_OUT})")
    sd.add_argument("--seed-file", default=str(SEED_SQL), help="seed.sql to append to")

    args = parser.parse_args()
    try:
        if args.command == "generate":
            asyncio.run(generate(args))
        else:
            seed(args)
    except LMStudioError as exc:
        raise SystemExit(f"error: {exc}") from exc


if __name__ == "__main__":
    main()
