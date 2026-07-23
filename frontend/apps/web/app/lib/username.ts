/**
 * Username rules, mirrored by the DB check constraint on profiles.username
 * (supabase/migrations/20260710111217_initial.sql) — keep the two in sync.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Lowercase and strip anything the pattern would reject, for as-you-type normalizing. */
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

/** Inline error for a username save, or null for anything unrecognized. */
export function usernameSaveError(code: string | undefined): string | null {
  if (code === "23505") return "That username is taken.";
  if (code === "23514") return "3–20 characters: lowercase letters, numbers, underscores.";
  return null;
}
