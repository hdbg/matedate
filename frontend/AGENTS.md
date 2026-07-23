# frontend/ — Yarn workspaces root

This is a Yarn 4 + PnP workspaces root, not a plain Next.js app. See `README.md` for the full
layout and commands. Run all `yarn` commands from here.

- **`apps/web/`** — the Next.js app. It has its **own `AGENTS.md`** (this Next.js has breaking
  changes — read `node_modules/next/dist/docs/` before writing Next code). Everything browser-,
  session-, or data-bound lives here.
- **`packages/icons/`** (`@matedate/icons`) — pure inline-SVG primitives, zero deps beyond React.
- **`packages/visuals/`** (`@matedate/visuals`) — branded card/components + theme + card logic;
  depends only on `@matedate/icons`.

## Editing `packages/*` — hard rules (enforced by `yarn check:packages`)

Both packages must render frame-by-frame under Remotion, so they may **not** contain: imports of
`next/*` / `remotion` / `framer-motion` / the `@/` alias (use relative imports); a `"use client"`
directive; or raw CSS `@keyframes` / `animation:` / `transition:`. All motion is driven by a single
`progress` prop (`stagger()` in `visuals/src/lib/progress.ts`) — the web app passes `progress={1}`
(static, pixel-identical) and supplies its own CSS animation classes to the components via a
className prop (the `@keyframes` stay in `apps/web/app/globals.css`). Tailwind classes like
`animate-foo` / `transition-[width]` are fine; only *raw CSS* is rejected.

`visuals` is the authority for the grading vocabulary, archetypes/tiers, card shapes, and the theme;
`apps/web` keeps thin re-export bridges (`app/lib/game/{types,live,shareCardData}.ts`,
`app/lib/utils.ts`) so existing imports resolve. Add new shared visuals to `@matedate/visuals` and
import them from `@matedate/visuals`, not via the bridges.
