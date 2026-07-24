import type { CSSProperties } from "react";

/**
 * Props shared by the standalone SVG icons in this package. Kept deliberately tiny — an icon is a
 * pure function of these props, with zero dependencies beyond React (no theme, no branding, no
 * logic). Anything needing a color token or conditional logic belongs in `@matedate/visuals`.
 *
 * `size` sets both `width` and `height` (px); omit it to let `className`/`style` control the box
 * (e.g. a Tailwind `h-[134px] w-auto` that scales width from the viewBox aspect ratio, matching the
 * `<img>` these replace). The chess pieces are two-tone artwork with baked fills, so they take no
 * `color`.
 */
export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; when omitted the icon renders `aria-hidden` (decorative). */
  title?: string;
}
