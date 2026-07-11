"""Helpers for appending reviewed generated content to `supabase/seed.sql`.

The generation scripts never touch the database: `generate` writes a JSON file for manual
review, and `seed` turns the reviewed file into idempotent `insert … on conflict do
nothing` blocks appended here. Re-apply with `supabase db reset`.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_SQL = REPO_ROOT / "supabase" / "seed.sql"


def quote(text: str) -> str:
    """A single-quoted SQL string literal (quotes doubled; newlines pass through)."""
    return "'" + text.replace("'", "''") + "'"


def quote_array(items: list[str], indent: str = "      ") -> str:
    inner = ",\n".join(f"{indent}  {quote(item)}" for item in items)
    return f"array[\n{inner}\n{indent}]"


def append_block(block: str, seed_file: Path) -> None:
    """Append one SQL block, separated by a blank line, preserving the trailing newline."""
    existing = seed_file.read_text()
    if not existing.endswith("\n"):
        existing += "\n"
    seed_file.write_text(f"{existing}\n{block.rstrip()}\n")
