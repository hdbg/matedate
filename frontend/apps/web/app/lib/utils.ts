// `cn` now lives in @matedate/visuals (shared with the video app); re-exported here so the ~30
// existing `@/app/lib/utils` importers keep resolving.
export { cn } from "@matedate/visuals";

/** Compact relative timestamp for list rows: "just now" → "5h ago" → "yesterday" → "Jul 12". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(then);
  } catch {
    return "";
  }
}
