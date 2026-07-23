import { classifyEvalDelta } from "./grading";
import type { WireMove } from "../types";

/** A move row as stored in the source tables (`moves` / `match_moves`), before it's shaped into a
 * `WireMove` for the card. Kept here (not in the web loaders) so the video app can feed historic
 * data through the same mapping. */
export interface EvalRow {
  position: number;
  side: "You" | "Match";
  content: string;
  eval_delta: number | null;
  eval_after: number | null;
}

/** Map stored eval rows to `WireMove`s: You moves get a derived classification + pawn-scale swing;
 * Match replies carry no eval. */
export function toWireMoves(rows: EvalRow[]): WireMove[] {
  return rows.map((r) =>
    r.side === "You"
      ? {
          position: r.position,
          side: "You" as const,
          content: r.content,
          classification: classifyEvalDelta(r.eval_delta, r.eval_after),
          swing: r.eval_delta != null ? Math.round((r.eval_delta / 10) * 10) / 10 : null,
          eval_after: r.eval_after,
        }
      : { position: r.position, side: "Match" as const, content: r.content },
  );
}
