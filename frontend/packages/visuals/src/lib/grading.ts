import type { MoveClass, MoveClassKey } from "../types";

/**
 * Deterministic move grading — mirrors the server's `classify()` thresholds (backend
 * `app/grading.py`). Quality is stored as the numeric eval; the Brilliant…Blunder label is derived
 * on read, never persisted. The `--m-*` colors resolve against the shared theme tokens.
 */

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
