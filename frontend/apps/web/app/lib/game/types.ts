/** Shared gameplay types for the Match screen. */

export type TimeControl = "bullet" | "rapid" | "classical";
export type VersusMode = "ranked" | "bot";

/** Frontend move-classification vocabulary (mirrors the backend's `app/grading.py`).
 * The checkmates are terminal: the eval hit a mating square (100 = date landed, 0 = blocked)
 * and the game ended on that move (SPEC §3). */
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

export interface Persona {
  slug: string;
  name: string;
  /** The "type: hidden — read them" hint shown under the name. */
  hint: string;
  openingLine: string;
  /** Up to three free opener suggestions offered in the composer. */
  suggestions: string[];
}

/** The engine's verdict on a single move. */
export interface GradedMove {
  classKey: MoveClassKey;
  /** Eval swing in "pawns", e.g. +2.4 / −3.2. */
  swing: number;
}

/** A canned, pre-graded reply offered in the composer's suggestion strip. */
export interface Suggestion extends GradedMove {
  text: string;
}

export const TIME_CONTROL_SECONDS: Record<TimeControl, number> = {
  bullet: 20,
  rapid: 40,
  classical: 60,
};

export const TIME_CONTROL_LABEL: Record<TimeControl, string> = {
  bullet: "Bullet",
  rapid: "Rapid",
  classical: "Classical",
};

/** Classification metadata, keyed by move class. */
export const MOVE_CLASSES: Record<MoveClassKey, MoveClass> = {
  checkmate_win: { key: "checkmate_win", glyph: "#", label: "Checkmate", color: "var(--m-checkmate-win)", quality: 100 },
  brilliant: { key: "brilliant", glyph: "!!", label: "Brilliant", color: "var(--m-brilliant)", quality: 96 },
  great: { key: "great", glyph: "!", label: "Great", color: "var(--m-great)", quality: 85 },
  good: { key: "good", glyph: "✓", label: "Good", color: "var(--m-good)", quality: 70 },
  inaccuracy: { key: "inaccuracy", glyph: "?!", label: "Inaccuracy", color: "var(--m-inaccuracy)", quality: 50 },
  mistake: { key: "mistake", glyph: "?", label: "Mistake", color: "var(--m-mistake)", quality: 30 },
  blunder: { key: "blunder", glyph: "??", label: "Blunder", color: "var(--m-blunder)", quality: 10 },
  checkmate_loss: { key: "checkmate_loss", glyph: "#", label: "Checkmate", color: "var(--m-checkmate-loss)", quality: 0 },
};

export function formatSwing(swing: number): string {
  return `${swing >= 0 ? "+" : ""}${swing.toFixed(1)}`;
}

/**
 * Derive a move's rank from its pawn-scale swing. Mirrors the server's `classify()` thresholds
 * (backend `app/grading.py`) — quality is stored as the numeric eval, the label is derived on
 * read. When `evalAfter` is supplied and sits on a mating square (≥100 / ≤0), the move is a
 * terminal checkmate regardless of the swing.
 */
export function classifySwing(swing: number, evalAfter?: number | null): MoveClassKey {
  if (evalAfter != null && evalAfter >= 100) return "checkmate_win";
  if (evalAfter != null && evalAfter <= 0) return "checkmate_loss";
  if (swing >= 2.5) return "brilliant";
  if (swing >= 1.2) return "great";
  if (swing >= 0.2) return "good";
  if (swing >= -0.8) return "inaccuracy";
  if (swing >= -2.0) return "mistake";
  return "blunder";
}

/** Same, from a raw eval delta (0–100 interest scale; swing = delta / 10). */
export function classifyEvalDelta(evalDelta: number | null, evalAfter?: number | null): MoveClassKey {
  return classifySwing((evalDelta ?? 0) / 10, evalAfter);
}

/**
 * The gameplay data source. Personas come from Supabase; move scoring is graded
 * client-side by the interim engine until a real analysis backend exists.
 */
export interface GameService {
  getPersona(slug?: string): Promise<Persona>;
  getSuggestions(): Suggestion[];
  gradeMove(text: string): Promise<GradedMove>;
  getPersonaReply(): Promise<string>;
}
