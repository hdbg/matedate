/** Shared gameplay types for the Match screen. */

export type TimeControl = "bullet" | "rapid" | "classical";
export type VersusMode = "ranked" | "bot";

/** Frontend move-classification vocabulary (mirrors the mocks' ramp). */
export type MoveClassKey =
  | "brilliant"
  | "great"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveClass {
  key: MoveClassKey;
  /** Chess-style glyph shown in the verdict/tag, e.g. "!!" or "??". */
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
  brilliant: { key: "brilliant", glyph: "!!", label: "Brilliant", color: "var(--m-brilliant)", quality: 100 },
  great: { key: "great", glyph: "!", label: "Great", color: "var(--m-great)", quality: 88 },
  good: { key: "good", glyph: "✓", label: "Good", color: "var(--m-good)", quality: 74 },
  inaccuracy: { key: "inaccuracy", glyph: "?!", label: "Inaccuracy", color: "var(--m-inaccuracy)", quality: 52 },
  mistake: { key: "mistake", glyph: "?", label: "Mistake", color: "var(--m-mistake)", quality: 35 },
  blunder: { key: "blunder", glyph: "??", label: "Blunder", color: "var(--m-blunder)", quality: 12 },
};

export function formatSwing(swing: number): string {
  return `${swing >= 0 ? "+" : ""}${swing.toFixed(1)}`;
}

/**
 * Derive a move's rank from its pawn-scale swing. Mirrors the server's `classify()` thresholds
 * (backend `app/grading.py`) — quality is stored as the numeric eval, the label is derived on read.
 */
export function classifySwing(swing: number): MoveClassKey {
  if (swing >= 2.0) return "brilliant";
  if (swing >= 1.0) return "great";
  if (swing >= 0.2) return "good";
  if (swing >= -1.0) return "inaccuracy";
  if (swing >= -2.5) return "mistake";
  return "blunder";
}

/** Same, from a raw eval delta (0–100 interest scale; swing = delta / 10). */
export function classifyEvalDelta(evalDelta: number | null): MoveClassKey {
  return classifySwing((evalDelta ?? 0) / 10);
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
