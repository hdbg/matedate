/**
 * Move-classification glyphs, ported from mocks/MateDate Move Icons.html — one per engine verdict
 * (Brilliant … Blunder plus the terminal checkmates).
 *
 * These are **not** standalone icons: each returns the white knockout paths meant to sit inside a
 * 40×40 `<svg>` whose `color` is the classification's semantic color. `checkmate_win` and
 * `checkmate_loss` deliberately paint detail strokes with `currentColor` (the disc color showing
 * through), so they must render in that colored context — see `MoveIcon` in `@matedate/visuals`,
 * which draws the disc and overlays one of these. Kept here as reusable primitives so any consumer
 * (web, video) composes the same badge.
 */

/** Crown — you converted the king (landed the date). */
export function CheckmateWinGlyph() {
  return (
    <>
      <path
        d="M10.5,27.5 L10.5,15 L15.7,19.2 L20,11.5 L24.3,19.2 L29.5,15 L29.5,27.5 Z"
        fill="#fff"
        strokeLinejoin="round"
      />
      <path d="M10.5,24 L29.5,24" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="20" cy="11.5" r="1.9" fill="#fff" />
    </>
  );
}

/** Double spark. */
export function BrilliantGlyph() {
  return (
    <>
      <path d="M17.5,9.5 L20.9,17.6 L29,21 L20.9,24.4 L17.5,32.5 L14.1,24.4 L6,21 L14.1,17.6 Z" fill="#fff" />
      <path d="M28.6,6.5 L30.2,10.4 L34,12 L30.2,13.6 L28.6,17.5 L27,13.6 L23,12 L27,10.4 Z" fill="#fff" />
    </>
  );
}

/** Single spark. */
export function GreatGlyph() {
  return <path d="M20,7 L23.7,16.3 L33,20 L23.7,23.7 L20,33 L16.3,23.7 L7,20 L16.3,16.3 Z" fill="#fff" />;
}

/** Check. */
export function GoodGlyph() {
  return (
    <path
      d="M12,20.5 L17.8,26.5 L28.5,14"
      fill="none"
      stroke="#fff"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Wobble / tilde. */
export function InaccuracyGlyph() {
  return (
    <path
      d="M10.5,22.5 C13.2,16.8 16.6,16.8 20,20 C23.4,23.2 26.8,23.2 29.5,17.5"
      fill="none"
      stroke="#fff"
      strokeWidth="3.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Dip / down chevron. */
export function MistakeGlyph() {
  return (
    <path
      d="M11.5,15.5 L20,25.5 L28.5,15.5"
      fill="none"
      stroke="#fff"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Cross. */
export function BlunderGlyph() {
  return <path d="M13,13 L27,27 M27,13 L13,27" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />;
}

/** Broken heart — the date unmatched you. */
export function CheckmateLossGlyph() {
  return (
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
  );
}
