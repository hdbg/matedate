/**
 * Move-classification vocabulary + card data shapes — the TS authority shared by the web app and
 * the video app. Mirrors the backend's `app/grading.py`. The checkmates are terminal: the eval hit
 * a mating square (100 = date landed, 0 = blocked) and the game ended on that move (SPEC §3).
 */

export type MoveClassKey =
  | "checkmate_win"
  | "brilliant"
  | "great"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "checkmate_loss";

export interface MoveClass {
  key: MoveClassKey;
  /** Chess-style text fallback, e.g. "!!" or "??" — UI renders `MoveIcon` instead. */
  glyph: string;
  label: string;
  /** CSS var reference for the classification color, for inline styles. */
  color: string;
  /** 0–100 quality weight used to compute running accuracy. */
  quality: number;
}

/**
 * One move on the wire (solo/PvP backend protocol) — also the ShareCard / EvalGraph input.
 * `eval_after` is the 0–100 interest after a You move (server-authoritative); it drives the eval
 * graph, falling back to the swing when absent.
 */
export interface WireMove {
  position: number;
  side: "You" | "Match";
  content: string;
  classification?: MoveClassKey | null;
  swing?: number | null;
  eval_after?: number | null;
}

/**
 * Everything (besides the archetype) the ShareCard needs to render a historic game/match side.
 * Loaded by the web app from the owner/participant-readable source tables.
 */
export interface ShareCardData {
  moves: WireMove[];
  accuracy: number;
  accuracySub: string;
  ratingLabel: string;
  ratingValue: number | null;
  ratingDelta: number;
  unratedLabel?: string;
  resultLabel: string;
  resultColor: string;
  /** Fallback for the share-sheet text before the archetype resolves. */
  titleFallback: string;
}
