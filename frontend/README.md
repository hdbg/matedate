# MateDate frontend — Yarn workspaces

The MateDate web app plus the shared visual packages it renders (and that a Remotion video app
will reuse to render TikTok marketing videos frame-by-frame, pixel-identical to the web card).

```
frontend/                     # workspaces root (Yarn 4 + PnP; the single install lives here)
├── apps/
│   └── web/                  # the Next.js app (App Router, TS, Tailwind v4, Supabase)
│       └── app/ …            # routes, providers, gameplay hooks, Supabase/session/audio
└── packages/
    ├── icons/                # @matedate/icons  — dumb inline-SVG primitives
    │   └── src/{chess,classification}/
    └── visuals/              # @matedate/visuals — branded, composed visuals + theme + logic
        └── src/{brand,card,game,lib}/ + theme.css + theme.ts
```

`apps/video/` (Remotion) is a **separate, future** app — the packages are already shaped so it can
import them cleanly.

## Commands (run from `frontend/`)

```
yarn install          # one PnP install for the whole workspace
yarn dev              # -> yarn workspace web dev   (Next dev, :3000, --webpack)
yarn build            # -> yarn workspace web build
yarn lint             # -> web ESLint
yarn check:packages   # guardrail: packages stay Remotion-renderable (see below)
yarn check            # check:packages + web tsc + web lint
```

The repo `Taskfile.yml` (`task dev` / `task frontend`) runs `yarn dev` here, unchanged — the root
`dev` script delegates to the `web` workspace.

> Dev/build are pinned to `--webpack`: Yarn PnP + Turbopack don't resolve here. Local dev reads
> `apps/web/.env.local` (local Supabase + backend WS). See `apps/web/AGENTS.md` for the Next.js
> version caveat.

## Package boundaries

**`@matedate/icons`** — pure inline-`<svg>` React components (chess pieces, move-classification
glyphs). Props limited to `size`/`color`/`className`/`style`. **Zero deps beyond React.** No theme,
no branding, no logic. (The classification glyphs are path-group primitives meant to sit inside
`MoveIcon`'s colored disc — some paint `currentColor` detail strokes — so they're not standalone.)

**`@matedate/visuals`** — depends on `@matedate/icons` + its own theme. Owns the grading vocabulary,
archetype/tier logic, card-data shapes, the theme (`theme.css` + `theme.ts`), and the
Logo/Wordmark/MoveIcon/ShareCard/EvalGraph/EvalBar/VerdictFlash/ChatBubble/LoadingScene tree. Still
pure presentational.

**`apps/web`** — everything browser-, session-, or data-bound: Supabase, sound, routing, layout
shells, the hooks (`useArchetype`, `useShareCard`), the WS clients. It keeps thin re-export bridges
(`app/lib/game/{types,live,shareCardData}.ts`, `app/lib/utils.ts`) so existing imports resolve while
the authority lives in `@matedate/visuals`.

### Hard rules for `packages/*` (enforced by `yarn check:packages`)

Both packages must stay renderable frame-by-frame by Remotion, so they may **not** contain:

- imports of `next/*`, `remotion`, `framer-motion`, or the `@/` path alias (use relative imports)
- a `"use client"` directive
- raw CSS `@keyframes` / `animation:` / `transition:` — all motion is driven by a single
  `progress: number` (0→1) prop (`stagger()` in `visuals/src/lib/progress.ts`). The web app passes
  `progress={1}` (settled/static, pixel-identical) and keeps its own CSS animations, which it
  supplies to the moved components via a className prop (the `@keyframes` stay in
  `apps/web/app/globals.css`). Tailwind utility classes like `transition-[width]` / `animate-foo`
  are fine — only *raw CSS* is rejected.

### Theme / Tailwind v4

Shared tokens live in `packages/visuals/src/theme.css` (palette, radii, shadows) and are mirrored in
`theme.ts` for JS. `apps/web/app/globals.css` imports the CSS via a **relative** path (Tailwind v4's
bare-specifier `@import` isn't PnP-aware) and adds `@source` directives so Tailwind scans the
packages for classes. Fonts stay app-specific (web maps `--font-sans`/`--font-mono` to its
`next/font` variables).
