import type { CSSProperties, ComponentType } from "react";
import {
  BlunderGlyph,
  BrilliantGlyph,
  CheckmateLossGlyph,
  CheckmateWinGlyph,
  GoodGlyph,
  GreatGlyph,
  InaccuracyGlyph,
  MistakeGlyph,
} from "@matedate/icons";
import { formatSwing, MOVE_CLASSES } from "../lib/grading";
import type { MoveClassKey } from "../types";
import { cn } from "../lib/cn";

/**
 * Move-classification icon family, ported from mocks/MateDate Move Icons.html: a white knockout
 * glyph on a disc that reads `currentColor`, one per engine verdict (Brilliant … Blunder plus the
 * terminal checkmates). The glyph artwork lives in `@matedate/icons`; this composes it over the
 * semantically-colored disc.
 */
const GLYPHS: Record<MoveClassKey, ComponentType> = {
  checkmate_win: CheckmateWinGlyph,
  brilliant: BrilliantGlyph,
  great: GreatGlyph,
  good: GoodGlyph,
  inaccuracy: InaccuracyGlyph,
  mistake: MistakeGlyph,
  blunder: BlunderGlyph,
  checkmate_loss: CheckmateLossGlyph,
};

interface MoveIconProps {
  classKey: MoveClassKey;
  /** Rendered square size in px (the artwork is a 40-unit disc). */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The icon for one move classification, colored by its semantic `--m-*` color
 * (override via `style.color` — the disc reads `currentColor`). Decorative:
 * always pair it with the rank label or a title on the surrounding element.
 */
export function MoveIcon({ classKey, size = 20, className, style }: MoveIconProps) {
  const Glyph = GLYPHS[classKey];
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0", className)}
      style={{ color: MOVE_CLASSES[classKey].color, ...style }}
    >
      <circle cx="20" cy="20" r="19" fill="currentColor" />
      <Glyph />
    </svg>
  );
}

interface MoveBadgeProps {
  classKey: MoveClassKey;
  swing: number;
  className?: string;
}

/** The verdict pill under a graded chat bubble: icon + rank label + eval swing. */
export function MoveBadge({ classKey, swing, className }: MoveBadgeProps) {
  const mv = MOVE_CLASSES[classKey];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full bg-white py-[2px] pl-[3px] pr-[9px] font-mono text-[11px] font-bold text-ink shadow-[var(--sh-1)]",
        className,
      )}
    >
      <MoveIcon classKey={classKey} size={20} />
      {mv.label}
      <span className="text-ink-mute">{formatSwing(swing)}</span>
    </span>
  );
}
