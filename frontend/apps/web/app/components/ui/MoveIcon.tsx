import type { CSSProperties, ReactNode } from "react";
import { formatSwing, MOVE_CLASSES, type MoveClassKey } from "@/app/lib/game/service";
import { cn } from "@/app/lib/utils";

/**
 * Move-classification icon family, ported from mocks/MateDate Move Icons.html: a white knockout
 * glyph on a disc that reads `currentColor`, one per engine verdict (Brilliant … Blunder plus the
 * terminal checkmates). Pure SVG paths, so any size renders crisp.
 */
const GLYPHS: Record<MoveClassKey, ReactNode> = {
  // crown — you converted the king (landed the date)
  checkmate_win: (
    <>
      <path
        d="M10.5,27.5 L10.5,15 L15.7,19.2 L20,11.5 L24.3,19.2 L29.5,15 L29.5,27.5 Z"
        fill="#fff"
        strokeLinejoin="round"
      />
      <path d="M10.5,24 L29.5,24" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="20" cy="11.5" r="1.9" fill="#fff" />
    </>
  ),
  // double spark
  brilliant: (
    <>
      <path d="M17.5,9.5 L20.9,17.6 L29,21 L20.9,24.4 L17.5,32.5 L14.1,24.4 L6,21 L14.1,17.6 Z" fill="#fff" />
      <path d="M28.6,6.5 L30.2,10.4 L34,12 L30.2,13.6 L28.6,17.5 L27,13.6 L23,12 L27,10.4 Z" fill="#fff" />
    </>
  ),
  // single spark
  great: <path d="M20,7 L23.7,16.3 L33,20 L23.7,23.7 L20,33 L16.3,23.7 L7,20 L16.3,16.3 Z" fill="#fff" />,
  // check
  good: (
    <path
      d="M12,20.5 L17.8,26.5 L28.5,14"
      fill="none"
      stroke="#fff"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // wobble / tilde
  inaccuracy: (
    <path
      d="M10.5,22.5 C13.2,16.8 16.6,16.8 20,20 C23.4,23.2 26.8,23.2 29.5,17.5"
      fill="none"
      stroke="#fff"
      strokeWidth="3.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // dip / down chevron
  mistake: (
    <path
      d="M11.5,15.5 L20,25.5 L28.5,15.5"
      fill="none"
      stroke="#fff"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // cross
  blunder: <path d="M13,13 L27,27 M27,13 L13,27" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />,
  // broken heart — the date unmatched you
  checkmate_loss: (
    <>
      <path
        d="M20,30.5 C9.5,22.5 8,15.2 13,12.9 C16.4,11.3 19,13.8 20,15.8 C21,13.8 23.6,11.3 27,12.9 C32,15.2 30.5,22.5 20,30.5 Z"
        fill="#fff"
      />
      <path
        d="M20,15.8 L17,20 L21.5,23.2 L18,27 L20,30.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
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
      {GLYPHS[classKey]}
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
