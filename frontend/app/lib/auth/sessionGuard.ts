/**
 * The single source of truth for which routes require a Supabase session.
 *
 * Used by BOTH halves of the guard:
 *  - `app/lib/supabase/middleware.ts` (via proxy.ts) — redirects sessionless requests
 *    server-side on every navigation, before any protected UI is served;
 *  - `app/providers/SessionGate.tsx` — catches the SPA-only edge (session signed out or
 *    deleted while the user sits on an already-rendered page).
 *
 * Signed-out users land on `/onboarding?next=<where they were going>`; onboarding sends
 * them back there once a session exists (signup or the anonymous skip).
 */

/** Routes a signed-out visitor may see. Everything else redirects to onboarding. */
const PUBLIC_PATHS = ["/", "/onboarding"];

/** Route prefixes that stay public (e.g. friend-challenge landing pages). */
const PUBLIC_PREFIXES = ["/join/"];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** The onboarding redirect for a guarded location, carrying it as `?next=`. */
export function onboardingPath(pathname: string, search: string = ""): string {
  const next = `${pathname}${search}`;
  return `/onboarding?next=${encodeURIComponent(next)}`;
}

/** Validate a `?next=` value before navigating: internal app paths only (no open redirect). */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}
