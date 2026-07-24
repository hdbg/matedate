/** Shared gameplay types for the Match screen.
 *
 * The move-classification vocabulary (`MoveClassKey`, `MoveClass`, `MOVE_CLASSES`, `formatSwing`,
 * `classifySwing`, `classifyEvalDelta`) now lives in `@matedate/visuals` (shared with the video
 * app) and is re-exported here so existing `@/app/lib/game/{types,service}` imports keep resolving.
 */

import type { MoveClassKey } from "@matedate/visuals";

export type { MoveClassKey, MoveClass } from "@matedate/visuals";
export { MOVE_CLASSES, formatSwing, classifySwing, classifyEvalDelta } from "@matedate/visuals";

export type TimeControl = "bullet" | "rapid" | "classical";
export type VersusMode = "ranked" | "bot";

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
