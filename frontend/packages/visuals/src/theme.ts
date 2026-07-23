/**
 * The MateDate design tokens as TypeScript constants — the same values as `theme.css`, for
 * components that need a raw color/number in JS (graph geometry, canvas math) rather than a CSS
 * `var()`. Keep in sync with `theme.css`.
 */

export const COLORS = {
  cream: "#f1e8d9",
  cream2: "#e7dcc8",
  paper: "#f7f0e3",
  ink: "#272320",
  inkSoft: "#4a443c",
  inkMute: "#8a8175",
  king: "#fbf6ec",

  rosy: "#d6536a",
  rosyDeep: "#b8324c",
  rosyTint: "#f3d9de",

  gold: "#c99a33",
} as const;

/** Move-classification ramp (checkmates are the terminal bounds, SPEC §3). Keyed to `MoveClassKey`
 * so `MOVE_CLASSES[key].color` (a `var(--m-*)`) and `MOVE_COLORS[key]` (the raw hex) stay aligned. */
export const MOVE_COLORS = {
  checkmate_win: "#4e8c46",
  brilliant: "#1f9e8a",
  great: "#3a7ca5",
  good: "#5f9a55",
  inaccuracy: "#c99a33",
  mistake: "#cf7a3c",
  blunder: "#b8324c",
  checkmate_loss: "#a3283f",
} as const;

export const RADII = {
  sm: "8px",
  md: "12px",
  lg: "18px",
  xl: "26px",
  pill: "999px",
} as const;

export const SHADOWS = {
  sh1: "0 2px 6px rgba(39, 35, 32, 0.08)",
  sh2: "0 8px 22px rgba(39, 35, 32, 0.12)",
  sh3: "0 18px 40px rgba(39, 35, 32, 0.16)",
} as const;
