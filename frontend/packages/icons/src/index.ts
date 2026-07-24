/**
 * @matedate/icons — dumb SVG primitives shared by the web app and the Remotion video app.
 *
 * Rules: pure inline `<svg>` React components, zero dependencies beyond React, no theme, no
 * branding, no logic. Anything that needs a color token or conditional logic belongs in
 * `@matedate/visuals`. Nothing here may import `next/*`, `remotion`, or from `@matedate/visuals`.
 */
export type { IconProps } from "./types";
export * from "./chess";
export * from "./classification";
