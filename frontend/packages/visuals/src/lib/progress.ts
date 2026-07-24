/**
 * The `progress` contract: every animated visual in this package is a pure function of a single
 * `progress` number (0 → 1). The web app passes `progress={1}` (the settled, fully-revealed state
 * — pixel-identical to a static render) and keeps its own CSS entrance animations; a Remotion app
 * derives `progress` from `useCurrentFrame()` to animate the card frame-by-frame.
 *
 * `stagger` maps the global 0→1 progress to a sub-range so pieces reveal in sequence:
 * `stagger(p, 0.2, 0.35)` is 0 until p=0.2, then ramps to 1 by p=0.55.
 */
export const stagger = (progress: number, start: number, span: number): number =>
  Math.min(1, Math.max(0, (progress - start) / span));
