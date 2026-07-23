import type { WireMove } from "../types";

/** Public site domain shown in the shareable card's "Score yours → <domain>" CTA.
 * Read from `NEXT_PUBLIC_SITE_DOMAIN` when present (Next inlines it at build); the `typeof process`
 * guard keeps this safe in bundlers that don't provide `process` (e.g. Remotion's browser bundle),
 * where it falls back to the default. */
const envDomain =
  typeof process !== "undefined" && process.env ? process.env.NEXT_PUBLIC_SITE_DOMAIN : undefined;
export const SITE_DOMAIN = envDomain ?? "matedate.gg";

/** Whether a solo result is a win, from the server's end reason + rating delta. */
export function isSoloWin(endReason: string, ratingDelta: number): boolean {
  if (endReason === "date_landed") return true;
  if (endReason === "blocked" || endReason === "timeout") return false;
  return ratingDelta >= 0;
}

/** Short result badge for a solo card footer (replaces the old "Anonymized" badge). */
export function soloResultBadge(endReason: string, win: boolean): string {
  switch (endReason) {
    case "date_landed":
      return "♟ Checkmate · Won";
    case "blocked":
      return "♟ Checkmate · Lost";
    case "timeout":
      return "⏱ Flagged · Lost";
    default:
      return win ? "♟ Scored · Won" : "♟ Scored · Lost";
  }
}

/** Split an archetype title so a leading "The " stays muted and the identity gets the accent. */
export function titleParts(title: string): [string, string] {
  if (title.startsWith("The ")) return ["The ", title.slice(4)];
  return ["", title];
}

/** The meme excerpt: the conversation slice at the archetype's `meme_positions`. The backend
 * derives those from a start + downstream count, so the window is already a **consecutive** run
 * (the best exchange + the reply that lands it) — we just render them in order. Falls back to the
 * last few moves when there's no archetype (a failed/absent classification). */
export function memeMoves(moves: WireMove[], positions: number[] | null): WireMove[] {
  const ordered = [...moves].sort((a, b) => a.position - b.position);
  if (positions && positions.length) {
    const set = new Set(positions);
    return ordered.filter((m) => set.has(m.position)).slice(0, 4);
  }
  return ordered.slice(-4);
}
