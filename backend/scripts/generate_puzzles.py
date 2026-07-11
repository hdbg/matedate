"""Generate single-turn puzzles with a local LM Studio model, review them, then seed them.

Two-step, no direct DB writes:

    uv run python -m scripts.generate_puzzles generate [--model <key>] [-n N] [--persona <slug>]
        # writes generated_puzzles.json for review
    uv run python -m scripts.generate_puzzles seed [file]
        # appends the reviewed file to supabase/seed.sql as idempotent inserts
        # (then re-apply with `supabase db reset`)

A puzzle is a "position" — one message the player must answer — with a known best reply
(SPEC §3), like a chess tactics puzzle. Every puzzle is grounded in a concrete sender:

- standalone (default): the script rolls the 8 personality dimensions + a gender and the
  model invents the sender (a one-line sketch + the conversation context that led to the
  position) before writing the position in that sender's voice;
- persona-linked (`--persona <slug>`): if the slug is found in the personas review file
  (`--personas-file`, default generated_personas.json), the puzzle is generated from that
  persona's actual character sheet, gender, and dials, so the position reads exactly like
  them. A slug not in the file still links (the seed SQL resolves it at apply time, and
  inherits the persona's gender via coalesce), but the content falls back to an invented
  sender.

The puzzle's difficulty and the solution's `best_eval_delta` are derived
deterministically from the dimensions, never by the model. `sender`, `context`,
`trap_reply`, and `rationale` exist only for review — they justify the position and its
best move but are never seeded. Edit the JSON before seeding if you disagree with any of
it.

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

from app.grading import EVAL_PER_PAWN
from scripts.generate_personas import GENDERS, Gender, PersonaFile, PersonaRecord
from scripts.generate_personas import DEFAULT_OUT as PERSONAS_DEFAULT_OUT
from scripts.lmstudio import (
    DIMENSIONS,
    LMStudioClient,
    LMStudioError,
    PersonalityDims,
    choose_model,
    slugify,
)
from scripts.seed_sql import SEED_SQL, append_block, quote

DEFAULT_OUT = "generated_puzzles.json"

SYSTEM_PROMPT = """\
You are a content author for MateDate, a chess-styled dating game. An engine scores a
date's interest 0-100 after every message and grades each player message like a chess
move (Brilliant, Great, Good, Inaccuracy, Mistake, Blunder). You write puzzles: a single
"position" — one message from a date that the player must answer — with a known best
reply, like a chess tactics puzzle.

Craft rules:
- A good position is tactical, not generic. The message carries a trap, a test, or an
  opening — bait to overshare, a dare, an ambiguous tease, a loyalty test disguised as a
  joke, a deliberately boring question that punishes a boring answer — such that, for
  this specific sender, one kind of reply is clearly strongest and the obvious reply
  loses.
- The best move must be something a real person could type in ten seconds, not a
  paragraph of therapy-speak. It wins because it reads the sender correctly: it matches
  their humor, calls their bluff, or gives exactly the sincerity they're fishing for.
- The trap reply must be genuinely tempting — the answer most players would send — and
  wrong for a reason specific to this sender.
- Voice is everything: the position must sound like the sender, not like a quiz.\
"""

INVENTED_SENDER_TEMPLATE = """\
Create one puzzle. First invent the sender: a {gender} with exactly this personality
(each dimension 1-10):

{dims}

Return every field:
- sender: one line — name, age, and one vivid identifying detail (job, obsession, vibe).
- context: 1-2 sentences on how the conversation got here — what was said or happened
  just before the position (kept for the reviewer, never shown to players).
- prompt: the sender's message — the position the player must respond to, in the
  sender's exact voice, lowercase-casual dating-app tone, mid-conversation.
- best_move: the single strongest player reply, in a natural player voice.
- trap_reply: the tempting reply most players would send that this sender would punish.
- rationale: one sentence on why the best move wins and the trap loses for this sender.
- slug_hint: 2-4 lowercase words joined by hyphens naming the position.
Do not mention the numeric scores anywhere in the output.\
"""

PERSONA_SENDER_TEMPLATE = """\
Create one puzzle. The sender is this existing persona ({gender}), already fully
defined — do not change them, write the position exactly in their voice and test what
they specifically reward or punish:

name: {name}
player-facing description: {description}
hidden type: {hidden_type}

character sheet (their live role-play instructions, including their personality dials):
---
{system_prompt}
---

Return every field:
- sender: one line restating who they are (name plus one identifying detail).
- context: 1-2 sentences on how the conversation got here — what was said or happened
  just before the position (kept for the reviewer, never shown to players). It must not
  be their opening line; pick a later moment in the chat.
- prompt: the sender's message — the position the player must respond to, in their exact
  texting style, mid-conversation.
- best_move: the single strongest player reply — the one this persona's green flags
  reward most.
- trap_reply: the tempting reply most players would send that trips this persona's red
  flags.
- rationale: one sentence on why the best move wins and the trap loses for this persona.
- slug_hint: 2-4 lowercase words joined by hyphens naming the position.
Do not mention the numeric dial scores anywhere in the output.\
"""


class GeneratedPuzzle(BaseModel):
    """What the local model returns."""

    slug_hint: str = Field(min_length=3, max_length=60)
    sender: str = Field(min_length=10)
    context: str = Field(min_length=20)
    prompt: str = Field(min_length=10)
    best_move: str = Field(min_length=10)
    trap_reply: str = Field(min_length=10)
    rationale: str = Field(min_length=10)


class PuzzleRecord(BaseModel):
    """One reviewed puzzle in the JSON file. `sender`, `context`, `trap_reply`, and
    `rationale` are review-only — they justify the position but are never seeded."""

    slug: str
    persona_slug: str | None = None
    gender: Gender
    sender: str
    context: str
    prompt: str
    difficulty: int = Field(ge=1, le=3)
    best_move: str
    trap_reply: str
    best_eval_delta: float
    rationale: str
    dimensions: dict[str, int]


class PuzzleFile(BaseModel):
    kind: Literal["puzzles"] = "puzzles"
    model: str
    generated_at: str
    puzzles: list[PuzzleRecord]


def best_eval_delta(dims: PersonalityDims) -> float:
    """Eval delta credited to the known best move. It is by definition top-ranked —
    swing >= 2.5 ("brilliant" in app/grading.py) — and harder positions reward more."""
    return (2.5 + 0.5 * (dims.difficulty - 1)) * EVAL_PER_PAWN


def to_record(
    gen: GeneratedPuzzle, dims: PersonalityDims, persona_slug: str | None, gender: Gender
) -> PuzzleRecord:
    return PuzzleRecord(
        # Random suffix keeps the unique slug safe across repeated generations.
        slug=f"{slugify(gen.slug_hint)}-{secrets.token_hex(2)}",
        persona_slug=persona_slug,
        gender=gender,
        sender=gen.sender,
        context=gen.context,
        prompt=gen.prompt,
        difficulty=dims.difficulty,
        best_move=gen.best_move,
        trap_reply=gen.trap_reply,
        best_eval_delta=best_eval_delta(dims),
        rationale=gen.rationale,
        dimensions=dims.scores,
    )


def load_persona(personas_file: Path, slug: str) -> PersonaRecord | None:
    """The persona record from the generate_personas review file, if present there."""
    if not personas_file.exists():
        return None
    try:
        doc = PersonaFile.model_validate_json(personas_file.read_text())
    except ValidationError as exc:
        raise SystemExit(f"{personas_file} is not a valid persona file:\n{exc}") from exc
    for persona in doc.personas:
        if persona.slug == slug:
            expected = {name for name, _, _ in DIMENSIONS}
            if set(persona.dimensions) != expected:
                raise SystemExit(
                    f"persona {slug!r} in {personas_file} has unexpected dimensions "
                    f"{sorted(persona.dimensions)} (expected {sorted(expected)})"
                )
            return persona
    return None


async def generate(args: argparse.Namespace) -> None:
    out = Path(args.out)
    if out.exists() and not args.force:
        raise SystemExit(f"{out} already exists — seed or delete it first, or pass --force")
    persona: PersonaRecord | None = None
    if args.persona:
        persona = load_persona(Path(args.personas_file), args.persona)
        if persona is None:
            print(
                f"note: {args.persona!r} not found in {args.personas_file} — puzzles still "
                "link to it at seed time, but the content uses an invented sender"
            )
    client = LMStudioClient(args.base_url)
    try:
        model = await choose_model(client, args.model)
        rng = random.Random(args.seed)
        records: list[PuzzleRecord] = []
        for i in range(1, args.count + 1):
            if persona is not None:
                # The persona's own dials drive the content, difficulty, and reward.
                dims = PersonalityDims(scores=persona.dimensions)
                gender: Gender = persona.gender
                user_prompt = PERSONA_SENDER_TEMPLATE.format(
                    gender=gender,
                    name=persona.name,
                    description=persona.description,
                    hidden_type=persona.hidden_type,
                    system_prompt=persona.system_prompt,
                )
            else:
                dims = PersonalityDims.roll(rng)
                gender = rng.choice(GENDERS)
                user_prompt = INVENTED_SENDER_TEMPLATE.format(dims=dims.render(), gender=gender)
            gen = await client.generate(
                model=model,
                output_type=GeneratedPuzzle,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=args.temperature,
            )
            record = to_record(gen, dims, args.persona, gender)
            print(f"[{i}/{args.count}] {record.slug}  ({record.gender}, difficulty {record.difficulty})")
            print(f"    sender: {record.sender}")
            print(f"    context: {record.context}")
            print(f"    position: {record.prompt}")
            print(f"    best move: {record.best_move}  (+{record.best_eval_delta})")
            print(f"    trap: {record.trap_reply}")
            print(f"    why: {record.rationale}")
            records.append(record)
    finally:
        await client.aclose()
    doc = PuzzleFile(model=model, generated_at=datetime.now(UTC).isoformat(), puzzles=records)
    out.write_text(json.dumps(doc.model_dump(), indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {len(records)} puzzle(s) to {out} — review/edit, then:")
    print(f"    uv run python -m scripts.generate_puzzles seed {out}")


def puzzle_sql(doc: PuzzleFile) -> str:
    """Idempotent seed block; persona slugs resolve to ids at apply time."""

    def persona_ref(slug: str | None) -> str:
        if slug is None:
            return "null"
        return f"(select id from public.personas where slug = {quote(slug)})"

    def gender_ref(z: PuzzleRecord) -> str:
        # A linked puzzle inherits its persona's gender; otherwise (or if the slug is missing) it
        # falls back to the gender rolled at generate time.
        literal = f"{quote(z.gender)}::public.gender"
        if z.persona_slug is None:
            return literal
        return f"coalesce((select gender from public.personas where slug = {quote(z.persona_slug)}), {literal})"

    values = ",\n".join(
        "  (\n"
        f"    {quote(z.slug)},\n"
        f"    {persona_ref(z.persona_slug)},\n"
        f"    {gender_ref(z)},\n"
        f"    {quote(z.prompt)},\n"
        f"    {z.difficulty},\n"
        "    true\n"
        "  )"
        for z in doc.puzzles
    )
    solution_values = ",\n".join(
        f"    ({quote(z.slug)}, {quote(z.best_move)}, {z.best_eval_delta:.2f})"
        for z in doc.puzzles
    )
    date = doc.generated_at[:10]
    return f"""\
-- Generated puzzles (scripts/generate_puzzles.py, model {doc.model}, {date}).
insert into public.puzzles (slug, persona_id, gender, prompt, difficulty, is_active)
values
{values}
on conflict (slug) do nothing;

-- The known best move per puzzle (service_role-only table, like persona_secrets).
insert into public.puzzle_solutions (puzzle_id, best_move, best_eval_delta)
select z.id, s.best_move, s.best_eval_delta
from public.puzzles z
join (
  values
{solution_values}
) as s(slug, best_move, best_eval_delta) on s.slug = z.slug
on conflict (puzzle_id) do nothing;\
"""


def seed(args: argparse.Namespace) -> None:
    source = Path(args.file)
    if not source.exists():
        raise SystemExit(f"{source} not found — run the generate step first")
    try:
        doc = PuzzleFile.model_validate_json(source.read_text())
    except ValidationError as exc:
        raise SystemExit(f"{source} is not a valid puzzle file:\n{exc}") from exc
    if not doc.puzzles:
        raise SystemExit(f"{source} contains no puzzles")
    seed_file = Path(args.seed_file)
    append_block(puzzle_sql(doc), seed_file)
    slugs = ", ".join(z.slug for z in doc.puzzles)
    print(f"appended {len(doc.puzzles)} puzzle(s) to {seed_file}: {slugs}")
    print("apply with `supabase db reset` (from the repo root)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate puzzles with a local LM Studio model.")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate", help="generate puzzles into a JSON file for review")
    gen.add_argument("--model", help="LM Studio model key (omit to pick interactively)")
    gen.add_argument("--count", "-n", type=int, default=1, help="how many puzzles (default 1)")
    gen.add_argument("--persona", help="slug of an existing persona to link the puzzles to")
    gen.add_argument(
        "--personas-file",
        default=PERSONAS_DEFAULT_OUT,
        help="personas review file to pull --persona's character sheet from "
        f"(default {PERSONAS_DEFAULT_OUT})",
    )
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
