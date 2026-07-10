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
 * The gameplay data source. The mock implementation grades client-side; the
 * Supabase implementation reads real personas but defers grading to the (not
 * yet built) analysis engine. Selected at runtime by NEXT_PUBLIC_USE_MOCK.
 */
export interface GameService {
  getPersona(slug?: string): Promise<Persona>;
  getSuggestions(): Suggestion[];
  gradeMove(text: string): Promise<GradedMove>;
  getPersonaReply(): Promise<string>;
}
