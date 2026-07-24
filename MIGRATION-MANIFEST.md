# MIGRATION-MANIFEST — shared-visuals extraction audit (Phase 0)

Audit of every extraction candidate for the `@matedate/icons` / `@matedate/visuals`
workspace split. **No files have been moved or modified.** All paths below are relative to
`frontend/` unless noted.

---

## ⚠️ Finding 0 — the app is NOT at the repo root

The prompt assumes "the repo is a single Next.js app", but the Next.js app lives in
**`frontend/`** inside a multi-service repo:

```
/ (repo root — no package.json)
├── frontend/     ← the Next.js app (yarn 4.15, PnP, --webpack pinned)
├── backend/      ← FastAPI (uv)
├── supabase/  bot/  mocks/  content/
├── Taskfile.yml  ← `task frontend` runs `yarn dev` inside frontend/
└── SPEC.md, mise.toml, AGENTS.md
```

Two ways to get the target layout — **needs your call before step 1**:

| Option | Shape | Trade-offs |
|---|---|---|
| **A (recommended)** | `frontend/` becomes the workspaces root: `frontend/package.json` gets `workspaces`, the app moves to `frontend/apps/web/`, packages at `frontend/packages/*`, Remotion later at `frontend/apps/video/` | JS toolchain stays self-contained in `frontend/`; Taskfile only needs its inner path updated (`frontend` task cwd → still `frontend/`, script becomes `yarn workspace web dev` or cwd `frontend/apps/web`); backend/supabase untouched |
| B | Repo root becomes the workspaces root: `frontend/` → `apps/web/`, `packages/` at root | Matches the prompt's diagram literally, but plants `package.json`/`.pnp.cjs`/`.yarn/` at the root of a polyglot repo and touches every Taskfile/README/AGENTS path that says `frontend/` |

Also relevant: **Yarn 4.15 PnP** (Turbopack broken with PnP; dev/build pinned to `--webpack`
— see `next.config.ts` comment). `workspace:*` protocol and workspaces are fully supported
by Yarn 4/PnP, and webpack resolves `.pnp.cjs` correctly, so the plan is compatible — but
step 1's verification must re-run `yarn dev --webpack` + `yarn build` under PnP.

---

## Main manifest

Destinations: `icons` = `@matedate/icons` · `visuals` = `@matedate/visuals` · `web` = stays
in `apps/web` · `split` = file must be divided.

### `app/components/ui/`

| File | Destination | Reason | Blockers |
|---|---|---|---|
| `Logo.tsx` (`Logo` + `LogoMark`) | `visuals/brand` | Brand mark used on ShareCard + modals; needed by videos | `<img src="/assets/white-king.svg">` → inline `KingIcon`; `@/` alias; `cn` from `app/lib/utils` |
| `Wordmark.tsx` | `visuals/brand` | Logotype; used by Logo, onboarding BrandPanel | `@/` alias + `cn` only. Uses `font-sans` token (font var supplied by app — OK) |
| `MoveIcon.tsx` (`MoveIcon` + `MoveBadge`) | `split` → glyph paths to `icons/classification`, `MoveIcon`/`MoveBadge` to `visuals/game` | The 8 classification glyphs are pure SVG (icons); the disc + `MOVE_CLASSES[k].color` + badge pill are themed (visuals) | Imports `formatSwing`/`MOVE_CLASSES` from **`service.ts` (Supabase-bound hub)** — re-point to extracted types; `cn`; `--m-*`/`--sh-1` CSS vars (come with theme.css) |
| `Avatar.tsx` | `split` | Pawn-placeholder + round-image shell is presentational (videos will show avatars); URL resolution is Supabase | `"use client"` (droppable); `avatarPublicUrl` → resolve in web, pass `src` as prop; `<img src="/assets/white-pawn.svg">` → `PawnIcon` |
| `ProgressBar.tsx` | `web` | Onboarding-only; not used by card or any shareable visual | (`transition-[width]` — irrelevant if it stays) |
| `HeroScene.tsx` | `visuals/brand` | The signature queen-checks-king scene (Welcome, FeaturedCard) — prime marketing visual, zero logic, no animation | Two `/assets/*.svg` `<img>`s → `QueenIcon`/`KingIcon`; `cn` |
| `LoadingScene.tsx` | `web` (flag: optional later extraction) | "Analyzing…" loader; app UI, not card content. 5 infinite keyframes make it the most expensive conversion for the least video value | If ever extracted: `queen-loom`, `king-bob`, `king-shake`, `bang-burst`, `floor-pulse`, `loading-dot` keyframes + 2 `/assets` imgs |
| `Button.tsx`, `Field.tsx`, `SelectOption.tsx`, `TabBar.tsx`, `TopBar.tsx`, `AppShell.tsx`, `AuthShell.tsx`, `NotificationsBell.tsx` | `web` | Interactive app chrome (routing, `next/link`, `next/navigation`, Supabase notifications, hover transitions) | n/a |

### `app/match/components/`

| File | Destination | Reason | Blockers |
|---|---|---|---|
| `ShareCard.tsx` (+ inner `MemeBubble`) | `visuals/card` | The centerpiece. Already a pure function of props (no `"use client"`, no state, no effects) | ① `WireMove` type imported from `live.ts` (`"use client"` + Supabase) — type must move; ② `formatSwing` via `service.ts` hub; ③ `SITE_DOMAIN` reads `process.env.NEXT_PUBLIC_SITE_DOMAIN`; ④ `animate-legendary-glow` keyframe → progress; ⑤ `@/` aliases |
| `EvalGraph.tsx` | `visuals/card` | Pure SVG polyline from `moves` — already static (no draw animation exists today; the progress-driven draw in step 6 is **new** work, not a conversion) | `WireMove` from `live.ts`; hard-coded `#100e0c` panel + `rgba` strokes (fine, but candidates for `theme.ts`) |
| `EvalBar.tsx` | `visuals/game` | Pure props (`interest`, `personaName`); the interest meter is core gameplay imagery for videos | `transition-[width] duration-[600ms]` → progress-driven width |
| `VerdictFlash.tsx` | `visuals/game` | Pure render of `{classKey, swing}`; the verdict pop is the signature gameplay beat for TikTok | `animate-verdict-pop` keyframe → progress; `VerdictState` type imported from `useMatchGame.ts` (web) — accept `classKey`/`swing` props or move the 3-field type; `service.ts` hub import |
| `MessageThread.tsx` | `split` | `MessageBubble` + `TypingIndicator` are pure and video-essential; the thread container auto-scrolls | Container: `"use client"`, `useEffect` + `scrollIntoView` (stays web). Bubbles: `animate-bubble-in` keyframe + inline `animation: typing-dot …` → progress; `Message` type from `useMatchGame.ts` (web) |
| `Composer.tsx` | `web` (flag: optional shell extraction) | Interactive input (`useState`, handlers). If videos need the composer visual, extract a stateless shell later | `"use client"`, state, hover transitions |
| `ShareCardModal.tsx` | `web` | Data-bound wrapper: Supabase, `useArchetypeBySource`, `loadShareCardData`, keydown listener, modal chrome | n/a (consumer of `visuals`) |
| `useShareCard.ts` | `web` | Canvas capture: `html-to-image`, `navigator.share`, `requestAnimationFrame`, `document` | n/a |
| `AfterGameModal.tsx`, `PvpResultModal.tsx` | `web` | Modal wrappers: `useArchetype` (Supabase realtime), keydown, `animate-after-game-pop`; consume ShareCard/Logo/LoadingScene | Also reference `/assets/black-queen.svg` → switch to `QueenIcon` |
| `MatchIntro.tsx` | `web` | Timers (`setTimeout`/`setInterval`), `playSound`, 11 `intro-*` keyframes, clock-grace coupling to backend | Uses `/assets/black-queen.svg` → `QueenIcon` |
| `MatchHeader.tsx`, `OpponentPanel.tsx`, `CompetitiveStrip.tsx`, `PvpWaiting.tsx` | `web` | Live-gameplay chrome (clock pulse, clipboard, `animate-pulse`, wire types) | `MatchHeader`/`OpponentPanel` will import `QueenIcon`/`MoveIcon`/`Avatar` from packages |

### `app/lib/game/` and `app/lib/`

| File | Destination | Reason | Blockers |
|---|---|---|---|
| `archetypes.ts` | `visuals/lib` | Pure vocab: 20 keys → titles + legendary flag, `Archetype` interface | None |
| `tiers.ts` | `visuals/lib` | Pure `tierFor()` ladder math | None |
| `cardHelpers.ts` | `visuals/lib` | Pure card helpers (`titleParts`, `memeMoves`, `isSoloWin`, `soloResultBadge`) | `WireMove` type from `live.ts`; **`SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "matedate.gg"`** — Next-inlined env var; in the package make it a plain constant with an override prop on ShareCard (recommended) or leave a guarded `process.env` read |
| `types.ts` | `split` | `MoveClassKey`, `MoveClass`, `MOVE_CLASSES`, `formatSwing`, `classifySwing`, `classifyEvalDelta` → `visuals` (they're the color/label/grading authority the card renders from). `Persona`, `GameService`, `Suggestion`, `TIME_CONTROL_*`, `VersusMode` → stay web | `MOVE_CLASSES` colors are `var(--m-*)` strings — theme.css must travel with it |
| `shareCardData.ts` | `split` | `ShareCardData` interface + `toWireMoves()` (pure mapping) → `visuals` as the card-props authority; `loadGame`/`loadMatch`/`loadShareCardData` (Supabase queries) → stay web | `SupabaseClient` import; `ArchetypeSource` type from `useArchetype.ts` (loader-side, stays web) |
| `useArchetype.ts` | `web` | Supabase realtime hook with state/timeouts. Web resolves, passes `Archetype` (already defined in `archetypes.ts`) as props | n/a |
| `service.ts` | `web` | Supabase persona reads. **But it `export * from "./types"` — it's the accidental import hub**: MoveIcon, VerdictFlash, ShareCard, MatchIntro, PvpResultModal, PvpWaiting all import grading vocab *through* it. Every such import re-points to `@matedate/visuals` | n/a |
| `live.ts` / `pvpLive.ts` | `split` (types only) | WebSocket clients stay web; **`WireMove`** (and `WireOppMove` if gameplay visuals need it) must move to `visuals` — ShareCard, EvalGraph, cardHelpers, shareCardData all consume it | `"use client"` + Supabase in the module the type currently lives in |
| `engine.ts` | `web` | Interim client-side grader (legacy seam) | n/a |
| `app/lib/utils.ts` | `split` | `cn()` → `visuals` (needed by nearly every moved component; **not** icons — icons stay zero-dep). `formatRelativeTime` → stays web | None |
| `app/lib/avatar.ts` | `web` | Supabase storage + canvas encode. `avatarPublicUrl` resolution stays web; Avatar shell takes `src` prop | n/a |
| `app/lib/sound.ts` | `web` | Audio — explicitly excluded | n/a |

### Assets

| File | Destination | Reason | Blockers |
|---|---|---|---|
| `public/assets/white-king.svg` (1.2 KB) | `icons/chess` → `KingIcon` | Used by Logo, HeroScene, LoadingScene, MatchIntro, FeaturedCard | Stock 45×45 chess piece with inline `style=` attrs — convert style attrs to props/attributes during JSX-ification |
| `public/assets/black-queen.svg` (1.6 KB) | `icons/chess` → `QueenIcon` | HeroScene, LoadingScene, MatchIntro, AfterGameModal, MatchHeader, FeaturedCard | Same |
| `public/assets/white-pawn.svg` (0.6 KB) | `icons/chess` → `PawnIcon` | Avatar placeholder | Same |
| `public/assets/icon.svg` / `icon.png` | `web` | **Referenced by no component** (grep-verified) — likely favicon leftovers; leave in place | n/a |
| `public/assets/*.mp3` (7 files) | `web` | Audio stays in web public | n/a |
| `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` | `web` | Next metadata routes | n/a |
| Keep the `/public` copies of the 3 chess SVGs after inlining | `web` | Cheap insurance; delete once no `<img>` references remain (final grep in step 2) | — |

### Theme (`app/globals.css`)

| Block (lines) | Destination |
|---|---|
| `:root` design tokens (8–47): colors, `--m-*` ramp, radii, shadows | `visuals/src/theme.css` + mirrored in `theme.ts` |
| `@theme inline` (49–81) mapping tokens → Tailwind utilities | `visuals/src/theme.css` — **except** `--font-sans: var(--font-bricolage)` / `--font-mono: var(--font-space-mono)`: those reference `next/font` variables from `app/layout.tsx`. theme.css should map fonts to app-agnostic vars (`var(--font-display)`, `var(--font-body)` per the spec) and each app defines them (web via next/font, Remotion via its own font loading) |
| `body`/`html` styles, `.font-mono` helper, `.no-scrollbar` (83–110) | `web` globals.css (app chrome) — note `.no-scrollbar` is used by Composer (stays web) |
| All `@keyframes` + `.animate-*`/`.intro-*` classes (112–430) | `web` — except the ones consumed by moved components, which are **deleted and replaced** by progress interpolation (see inventory) |

---

## CSS animation inventory (candidates only)

Must become `progress`-driven (component is moving to `packages/`):

| Animation | Where | Conversion |
|---|---|---|
| `@keyframes legendary-glow` (`animate-legendary-glow`) | ShareCard legendary title | background-position + text-shadow ← progress (looping sweep → Remotion loops progress; web `progress=1` shows a fixed mid-glow — **minor visual delta risk on legendary cards, will pick the frame matching today's average rest state**) |
| `@keyframes verdict-pop` (`animate-verdict-pop`) | VerdictFlash | opacity/translate/scale ← progress |
| `@keyframes bubble-in` (`animate-bubble-in`) | MessageThread bubbles | opacity/translateY/scale ← progress |
| `typing-dot` (inline `style={{animation}}`) | TypingIndicator | per-dot phase offset ← progress |
| `transition-[width] duration-[600ms]` | EvalBar fill | width ← progress-interpolated value |
| *(none)* | EvalGraph | no animation exists today — stroke-dashoffset draw is **new** in step 6 |

Stay in web (component not moving): `after-game-pop` (3 modals), `clock-pulse` (MatchHeader),
`screen-in`/`page-in` (navigation), `queen-loom`/`king-bob`/`king-shake`/`bang-burst`/
`floor-pulse`/`loading-dot` (LoadingScene), the 11 `intro-*` keyframes (MatchIntro),
Tailwind `animate-pulse` (PvpWaiting, OpponentPanel), hover/active transitions (Button,
Composer, TopBar, SelectOption, ProgressBar, NotificationsBell, OpponentPanel accuracy bar).

## `/public` assets referenced by candidate components

- `/assets/white-king.svg` — Logo.tsx, HeroScene.tsx, LoadingScene.tsx *(+ web-side: MatchIntro, FeaturedCard)*
- `/assets/black-queen.svg` — HeroScene.tsx, LoadingScene.tsx *(+ web-side: MatchHeader, MatchIntro, AfterGameModal, FeaturedCard)*
- `/assets/white-pawn.svg` — Avatar.tsx
- No candidate references `/assets/icon.svg`, `icon.png`, or any mp3.

## Shared components you didn't name (discovered)

- **`LogoMark`** (exported from `Logo.tsx`) — used standalone by AfterGameModal + PvpResultModal. Moves with Logo.
- **`MoveBadge`** (exported from `MoveIcon.tsx`) — the verdict pill; used by MessageThread **and** `app/analysis/components/ReviewThread.tsx`. Moves with MoveIcon.
- **`HeroScene`** — Welcome/BrandPanel/FeaturedCard; you listed neither it nor its consumers.
- **`toWireMoves`** (`shareCardData.ts`) — the pure rows→`WireMove[]` mapping, needed anywhere historic data feeds the card (Remotion will want it).
- **Web-side consumers that must re-point imports** (no move, just import updates): `app/analysis/components/{AnalysisPanel,ReviewThread}.tsx`, `app/(main)/profile/{GameHistory.tsx,profileData.ts}`, `app/(main)/play/components/FeaturedCard.tsx`, `app/onboarding/components/{WelcomeScreen,BrandPanel,DoneScreen}.tsx`, `MatchIntro`, `MatchHeader`, `OpponentPanel`, `VerdictFlash` consumers in `useMatchGame`-land.

## Structural notes vs. the target diagram

1. **ShareCard is currently monolithic.** `ArchetypeTitle`, `ChatBubbleMini` (≈ `MemeBubble`), `LockedBestMove`, `RatingFooter` exist only as inline JSX sections; splitting them out is new componentization (sensible to do in step 5/6 when threading `progress`). **`AccuracyDial` does not exist** — accuracy renders as plain text in the card header. Confirm whether the dial is aspirational (new component) or the plain text stays.
2. **`icons/ui/` (Lock/Chevron/Shield)** — no such standalone SVGs exist today; locks/chevrons are emoji/text glyphs (`🔒`, `→`, `♟`, `◆`). Nothing to extract unless you want them redrawn as SVGs.
3. **`constants.ts` (CARD_WIDTH/CARD_HEIGHT)** — the card is currently fluid (`max-w-[392px]`/`[440px]` set by the *modals*). Fixed dimensions would be new, Remotion-motivated constants.
4. **Tailwind v4 content scanning:** v4 auto-detects sources but **ignores anything outside the CSS file's project root**; `apps/web/app/globals.css` will need explicit `@source "../../packages/icons/src"; @source "../../packages/visuals/src";` directives so package classes aren't purged.
5. **`process.env` in packages:** only one occurrence (`SITE_DOMAIN`). Everything else is env-free.
6. **`forwardRef` on ShareCard** stays — web's `useShareCard` captures via ref; harmless under Remotion.

## Risk register

- **Yarn PnP + workspaces + webpack**: expected to work, but step 1 gets its own verification gate before any code moves.
- **Legendary-glow freeze frame** (see inventory) — only place `progress=1` isn't trivially identical to today's animated web render.
- **`service.ts` hub**: 6+ components import grading vocab through a Supabase-importing module; re-pointing is mechanical but touches many files — done in step 3 with `yarn tsc --noEmit` as the gate.
- **Chess SVGs carry `style=""` attributes** and `stroke:#000` fills — JSX conversion must preserve them exactly (pixel-identical requirement); they also receive CSS `filter: drop-shadow` outlines from consumers (prop-compatible, stays on the consumer).

## Open questions (blocking step 1)

1. **Workspace root**: Option A (`frontend/` becomes the workspaces root) or Option B (repo root)? A recommended.
2. **AccuracyDial**: new component, or keep the existing plain-text accuracy?
3. **EvalBar / VerdictFlash / MessageThread bubbles**: I've classified these into `visuals` on the assumption TikTok videos will recreate live gameplay (not just the share card). Confirm — if videos only ever show the card, they can stay in web and shrink the surface.
