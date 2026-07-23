# MateDate — repo guide for agents

Chess-style dating game: the player flirts with an AI persona while an engine grades their
messages like chess moves (Brilliant … Blunder). `SPEC.md` is the product spec of record.

## Layout

- `frontend/` — a **Yarn workspaces** root (Yarn 4 + PnP; the single install lives here). Contains
  `apps/web/` (the Next.js App Router + TS + Tailwind v4 app — **has its own `AGENTS.md`**: this
  Next.js has breaking changes, read `node_modules/next/dist/docs/` before writing Next code) and
  `packages/{icons,visuals}/` — the shared visual system (`@matedate/icons` inline-SVG primitives,
  `@matedate/visuals` branded card/components + theme + logic) that the web app renders and a future
  Remotion video app (`apps/video/`) will reuse pixel-identically. Run yarn from `frontend/`
  (`yarn dev`/`build`/`check` delegate to the `web` workspace via root scripts, so `task dev` is
  unchanged). See `frontend/README.md` for the layout + **package boundary rules**: `packages/*`
  must stay Remotion-renderable (no `next/*`/`remotion`/`framer-motion`/`@/` imports, no
  `"use client"`, no raw CSS `@keyframes`/`animation:`/`transition:` — motion is `progress`-driven;
  enforced by `yarn check:packages`). Shared theme tokens: `packages/visuals/src/theme.css`.
- `backend/` — FastAPI + PydanticAI solo-PvE game engine over WebSocket (details below).
- `supabase/` — schema, seed, config. **Single pre-launch migration** convention: edit the one
  file `supabase/migrations/20260710111217_initial.sql`, don't add new migrations; re-apply with
  `supabase db reset`.
- `bot/`, `mocks/` — auxiliary; not part of the live game path.
- `Taskfile.yml` — dev orchestration (see below).

## Dev workflow

Toolchain is pinned via `mise.toml` (task, uv, yarn, supabase, rust). `task` provides:

```
task dev        # starts local Supabase, backend (:8000), analysis worker, and frontend in parallel
```

`task dev` brings up Supabase once (skipped if already running), then runs the backend, the
analysis worker, and the frontend concurrently. Both read their local env: `backend/.env` and
`frontend/.env.local` point at the local Supabase CLI instance (there is **no mock/real toggle** —
dev uses real local Supabase). Individual tasks: `task supabase`, `task backend`, `task worker`,
`task frontend`, `task enqueue-analysis -- <game-id>|--latest`. `task gen-types` regenerates the
backend's typed DB schema (`backend/app/database_types.py`) from local Supabase.

Content authoring (`task gen-personas` / `task gen-puzzles`, → `backend/scripts/generate_*.py`)
runs against a **local LM Studio** server (default `http://127.0.0.1:1234`, override
`LMSTUDIO_BASE_URL`), never the DB: `generate` rolls 8 personality dimensions (1-10) + a gender
per item and writes a JSON file for manual review; `seed` appends the reviewed file to
`supabase/seed.sql` as idempotent inserts (apply with `supabase db reset`). Difficulty, boss
status, and `best_eval_delta` are derived from the dimension roll, never by the model. Run the
scripts as `uv run python -m scripts.<name>` (module form — file-path invocation breaks `app.*`
imports).

Local Supabase needs Docker Desktop running. Keys come from `supabase status`; the local
service-role/anon keys are static demo keys (safe to use locally, never production secrets).

## Backend — solo PvE (player vs AI date)

FastAPI service implementing **solo PvE** (SPEC §2.1): one authenticated WebSocket per user, one
active game per user, reconnect-safe. `main.py` → `app/ws.py`.

- **Transport:** `GET /ws?token=<supabase access_token>` (browsers can't set an `Authorization`
  header on a WS, so the token rides as a query param). `/health` for liveness.
- **Auth (`app/auth.py`):** verifies the bearer token via `supabase.auth.get_user(jwt)`; invalid →
  close **4401**. Works for anonymous sessions (`signInAnonymously`).
- **One socket per user (`app/ws.py`):** `ConnectionManager` closes a user's prior socket with
  code **4000** when a new one connects.
- **Protocol (typed in `app/protocol.py`):**
  - the `persona` payload (`PersonaOut`) carries `suggested_messages` — up to three **free** opener
    suggestions from `personas.suggested_messages` (readable by any signed-in user), shown in the
    composer; distinct from the paid best move.
  - server→ `new_game`{persona,time} · `game_state` (reconnect: persona+moves+time+time_left) ·
    `response`{content,classification,swing,time_left} ·
    `finish`{end_reason,accuracy,rating_delta,moves,title,description,**game_id**} · `error`{code,message}
  - client→ `move`{content}
  - **The socket ends with the game:** once a turn resolves to a `finish`, `ws.py` stops reading
    and the connection closes (both server- and client-side). A deep review is requested
    **out-of-band** (Supabase RPC, below), never over this socket — that's why `finish` carries
    `game_id`.
- **Clock (SPEC §2.6):** a per-game **Fischer** clock, not a per-move budget. The player starts
  with `solo_games.base_seconds` (`SOLO_BASE_SECONDS`, default 30) and gains
  `solo_games.increment_seconds` (`SOLO_INCREMENT_SECONDS`, default 5) back after each submitted
  move — a single bank that **depletes across turns**, so quick answers are rewarded. The running
  bank is encoded as `turn_deadline` (= `now + remaining_bank` when a turn opens), so
  `time_left = turn_deadline - now` and reconnect restores it exactly. The clock is **paused across
  the persona's reply**: the next turn's deadline is anchored to reply-send time (`_now()` after
  the engine call), so LLM latency is never charged to the player. Wire fields: `time` = base bank
  (ms); `time_left` = ms in the bank for the open/upcoming turn (on `response`, that's
  leftover + increment). Every open turn also arms a **background timeout task**
  (`SoloGameService._arm`/`_run_timeout`, using the transport's `send` callback) so an idle player
  is finished with `timeout` *at* the deadline, not only on their next message; a per-connection
  `asyncio.Lock` serializes the timer against the request path so a game finishes at most once.
  `ws.py` serializes all sends and calls `service.aclose()` to cancel the timer when the socket
  closes.
- **End conditions:** whichever comes first — `SOLO_MAX_EXCHANGES` (default 6, → `scored`), the
  move clock expiring (→ `timeout`, fired proactively by the timer or reactively on the next
  move/reconnect), a **block** (→ `blocked`, checkmate loss), or a **landed date**
  (→ `date_landed`, checkmate win — flat `+25` rating delta).
- **The engine (`app/engine.py`):** one combined **PydanticAI** agent per turn returns
  `MoveVerdict{eval_after 0-100, reply, reasoning, is_blocked, is_date_landed}` — it both
  role-plays the persona's reply and scores the player's message. Provider-agnostic via
  **OpenRouter** (no vendor lock-in; `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`). A deterministic
  **`FakeEngine`** is used when `FAKE_ENGINE=true` OR `OPENROUTER_API_KEY` is empty, so the whole
  WS flow runs offline (used by tests). `build_engine()` picks between them.
- **Checkmates / early end (SPEC §3):** the eval bounds are terminal "mating squares", and only
  the verdict flags may put a move on them — `apply_move` forces `eval_after` to `0` on
  `is_blocked` (persona blocks/unmatches a genuinely offensive or creepy line), to `100` on
  `is_date_landed` (persona explicitly agrees to the date), and pinches everything else to
  `[1, 99]`. A move on a bound classifies as `checkmate_loss`/`checkmate_win` and ends the game:
  `apply_move` sends the persona's parting `response` **and then** the `finish`
  (`end_reason="blocked"` / `"date_landed"`), so the player sees the block message or the "yes"
  plus the verdict before the game ends. `FakeEngine` triggers these on creep/gross/block/unmatch
  and date/dinner/drinks/coffee keywords (block wins). Both are `match_end_reason` enum values.
- **Grading (`app/grading.py`):** deterministic, server-side — eval delta → `swing` (= delta/10) →
  classification (SPEC §3 thresholds). Never computed by the LLM or the client. **Move quality is
  stored as the numeric eval only** in every move table (`moves`, `match_moves`,
  `game_analysis_moves`): the backend writes `eval_before`/`eval_after`, and **`eval_delta` is a
  generated column** (`eval_after - eval_before`, `stored`) — never written (PostgREST rejects it).
  The Brilliant…Blunder rank is *derived on read* by `classify()` and never persisted — there is no
  `move_kind` enum. `classify(swing, eval_after)` grades the terminal checkmates off the eval
  bounds (`eval_after >= 100` → `checkmate_win`, `<= 0` → `checkmate_loss`) before the delta ramp.
  The frontend `MoveClassKey` vocab (checkmate_win/brilliant/great/good/inaccuracy/mistake/
  blunder/checkmate_loss) is what the wire carries (derived by `_move_out`), not a stored column.
- **DB (`app/supabase_client.py`):** all reads/writes go through the **async** service-role
  Supabase client (`AsyncClient`, constructed synchronously but every `.execute()` is `await`ed,
  so DB I/O never blocks the event loop — no `asyncio.to_thread`). Service role bypasses RLS.
  Writes: `games`(mode=solo, status, end_reason, accuracy), `solo_games`(clock/exchanges/
  rating_delta), `moves`, `engine_responses`, and a rating bump on finish (`player_ratings.
  elo_rating` + `rating_history`).
- **Typed schema (`app/database_types.py`):** generated from the live local DB by
  `task gen-types` (`supabase gen types --lang=python --local`) — **do not hand-edit**;
  regenerate after any schema change (edit the single migration → `supabase db reset` →
  `task gen-types`). Reads are parsed into the generated `Public*` pydantic Base models
  (they coerce the REST JSON into `datetime`/`UUID`/`float`); writes annotate their payloads
  with the generated `*Insert`/`*Update` TypedDicts and pass through `app/db.py`'s `json_row`
  (datetime→ISO, UUID→str) because postgrest serializes payloads with plain `json.dumps`.
- **Run:** `uv run --directory backend uvicorn main:app` (or `task backend`). `uv run mypy .`
  must stay clean (typed protocol + PydanticAI). `backend/.env` (gitignored) holds the
  service-role key + OpenRouter key; see `backend/.env.example`.

### Ranked PvP (`app/pvp.py` + `app/match_ws.py`, endpoint `/ws/match`)

Player-vs-player per SPEC §2.2: both players get the **same persona + opening line** and each
plays their own parallel conversation, in **move-by-move lockstep** (side `a` always first: `a`
submits exchange N, then `b`, then N+1). A match is a **single contest** — there are no rounds.
Grading is live per move (same engine as solo), so there is **no scoring queue/worker**.

- **Transport (`app/match_ws.py`):** `GET /ws/match?token=` — same auth (4401) and the same
  global `ConnectionManager` as solo (one socket per user across both endpoints, 4000 replace).
  On connect the server resumes an active match (`match_state`); otherwise the client sends one
  intent — `queue`{time_control} · `create_invite`{time_control} · `join_invite`{code} — then
  `move`/`cancel` frames. Intents error `active_game` while a solo game is live. The socket ends
  with the match (`match_finish` closes it; the idle opponent's socket is closed by the session).
- **Two ways in:** **vs stranger** — `MatchmakingService` pairs same time_control + gender +
  seeking (SPEC §2.7) under one in-process asyncio.Lock (single-process invariant; the
  `matchmaking_queue` row status is the future multi-process CAS seam). Queue writes are
  **service-mediated** — clients have no INSERT on `matchmaking_queue`; the backend snapshots
  real profile values itself. Rows whose socket died are swept as stale on sight. **Vs friend** —
  `InviteService` mints `match_invites.code` (`secrets.token_urlsafe`), shared as `/join/<code>`;
  codes resolve only over the WS (no client lookup path → not enumerable), the invite lives
  exactly as long as the creator's waiting socket, matches are **unrated**, and the persona
  gender = the creator's `seeking`.
- **Coordination (`app/pvp.py`):** a module-level `MatchRegistry` maps a live match to its
  `MatchSession` (both sides' send/close callbacks, one lock, one timeout task) and rebuilds a
  session from the DB after a backend restart. The **session, not the connection, owns the
  clock**: disconnecting doesn't pause it, and the timeout finish is pushed to whoever is
  attached. Lockstep state persists on `pvp_matches` (`turn_side`, `turn_deadline`,
  `player_{a,b}_bank_ms`); per-player **Fischer** clocks with pools mapped in config
  (bullet 20+3 / rapid 40+5 / classical 60+8; `PVP_*` env knobs) and the solo-style intro grace
  on side `a`'s first turn. `turn_deadline` is **cleared while the engine grades** (SPEC §2.6 —
  LLM latency is never charged) and re-set when the turn passes.
- **End conditions:** `is_blocked` → instant loss for the mover; `is_date_landed` → instant win;
  deadline → `timeout` loss (proactive timer, like solo); side `b` completing
  `matches.max_exchanges` → `scored`, higher mean move quality (accuracy) wins, exact tie =
  draw (`winner_side` null). Rated matches move `player_ratings.ranked_elo` by standard Elo
  (K=`PVP_ELO_K`=32, draw 0.5, floor 0) + `ranked_wins/losses` + `rating_history(kind='ranked')`
  + the elo before/after snapshot on `pvp_matches`; unrated matches touch nothing.
- **Opponent visibility:** mid-match the opponent's frames (`opp_move`, `match_state.opp_moves`)
  carry classification/swing but **`content: null`** — the `pvp_live_transcript` setting (a
  future premium reveal) is the gate; the wire always has the field. The full transcript rides
  `match_finish`, matching the `match_moves` RLS (own side anytime; opponent's side only once
  the match is over). `match_moves` mirrors solo `moves` two-dimensionally: `(match_id, side,
  position, speaker You|Match, content, evals)`.
- **Protocol additions (`app/protocol.py`):** client→ `queue`/`create_invite`/`join_invite`/
  `cancel` (+ shared `move`); server→ `queued` · `cancelled` · `invite_created`{code} ·
  `match_found`{your_side, rated, persona, opponent, clock snapshot} · `match_state` (reconnect)
  · shared `response` (own graded turn) · `opp_move`{move, reply} · `turn`{you|opponent,
  time_left} · `match_finish`{result win|loss|draw, both accuracies, rating_delta, both full
  transcripts, opponent}.

### Post-game analysis (`app/analysis/`, separate worker)

Deep "game review" (chess.com style) for a finished game, decoupled from live play via a durable
queue. Source-independent by design: **one** result-table pair regardless of source (solo now;
PvP sides / screenshot uploads later), so there is no per-mode analysis table.

- **Queue:** pgmq queue `game_analysis`. pgmq isn't PostgREST-exposed, so the migration installs
  `security definer` wrappers `public.pgmq_send/read/archive/delete` (EXECUTE granted to
  `service_role` only) that the async client drives via `db.rpc()` — see `app/analysis/queue.py`.
- **Jobs:** the existing `analysis_jobs` table is the lifecycle/idempotency view (`kind='game_analysis'`,
  `queue_msg_id`, `idempotency_key='game_analysis:<game_id>'`, `attempts`, `last_error`).
- **Enqueue + a pre-generated id.** Two enqueue paths, both idempotent per game and both minting
  the `game_analyses.id` **up front** (stored on `analysis_jobs.analysis_id`, carried in the pgmq
  message) so a caller can await exactly that row before it exists:
  - **Client:** the after-game "Deep analysis" button calls the Postgres RPC
    `public.request_game_analysis(game_id)` (security-definer, `grant`ed to `authenticated`;
    authorizes via `auth.uid()` — your own `completed` game only). It inserts the job, `pgmq.send`s
    the message, and **returns the pre-generated analysis id**.
  - **Dev/service-role:** `enqueue_game_analysis(db, game_id, force=?)` in `app/analysis/service.py`
    (`scripts/enqueue_analysis.py` / `task enqueue-analysis`) mirrors it in Python.
  - **PvP:** `public.request_match_analysis(match_id)` (participants of a `completed` match,
    rated or friendly) enqueues **both sides** — one job per side, idempotent on
    `game_analysis:match:<match_id>:<side>` — so the review screen's side switch always has a
    fully annotated opposing board. The caller's side job carries their `user_id` (drives the
    bell); the opposing side's job is minted with `user_id = null` (no surprise notification)
    and *adopted* when that player requests later. Returns the caller's side's analysis id.
    The worker loads one side via `load_match_transcript(db, match_id, side)` (same
    `Transcript` shape; `move_id` stays null — that FK references `moves` only) and persists
    `game_analyses(match_id, side)`.
  The worker inserts `game_analyses` with that id (`_persist_analysis(..., analysis_id)`).
- **Fire-and-forget + notifications.** Requesting a review does not block the player: the RPC
  queues it and returns. The main screen's notifications bell watches for the result over realtime.
  Both `analysis_jobs` and `game_analyses` are in the `supabase_realtime` publication (owner RLS
  gates delivery; `analysis_jobs` uses `replica identity full` so RLS evaluates on UPDATEs). The
  bell keys off `analysis_jobs` reaching a **terminal** state — `completed` (→ review ready, links
  to its `analysis_id`) or `failed`. The pre-generated-id + `game_analyses` realtime path is still
  wired for awaiting one specific row (used by the currently-unused Loading screen).
- **Engine (`app/analysis/engine.py`):** a PydanticAI agent returns `GameAnalysisVerdict`
  {title, description, tags, per-**You**-move {`eval_after` 0-100, comment, best_line}}. It
  **re-scores** every move with a *stronger* model (`ANALYSIS_MODEL`, default an Opus-class slug) —
  a fresh numeric interest eval, not a category, and it does not trust the live grades (screenshot
  sources have none). `grade_moves` chains those evals off `START_EVAL` (Match replies carry none)
  into deltas and derives each rank via `app/grading.py`, exactly like live play. `validate_verdict`
  enforces that the annotated positions match the You-side moves and that non-top (non-brilliant)
  moves carry a best line (as a PydanticAI output validator → one in-run retry, and again before
  persist). On persist the best line is written to the **RLS-gated** `game_analysis_move_reveals`
  (the paid best move), never onto the move row. A deterministic `FakeAnalysisEngine` runs under
  `FAKE_ENGINE` / no key, same as `build_engine`.
- **Worker (`backend/worker.py` → `app/analysis/worker.py`, `task worker`, in `task dev`):** a
  standalone process polling `pgmq_read` with a visibility timeout. Failures record `last_error`
  and reset the job to `queued` (pgmq redelivers after the vt); `read_ct > ANALYSIS_MAX_ATTEMPTS`
  → job `failed` + archived (poison message parked in `pgmq.a_game_analysis`); success writes
  `game_analyses` + `game_analysis_moves` and archives.
- **Tables:** `game_analyses` (title/description/tags/model/prompt_version/raw_response, nullable
  `game_id`/`match_id` XOR source + nullable `side` for match sources) + `game_analysis_moves` (per You move:
  `eval_before/eval_after` + generated `eval_delta` + comment + a `content` snapshot and nullable
  `move_id`; the rank is derived from `eval_delta`, never stored) + `game_analysis_move_reveals`
  (the paid best line, gated by `can_reveal_analysis` → the same per-game/match unlock as live
  best moves). Owner-read RLS; service_role writes.
  Re-analysis is allowed (no `unique(game_id)`); the current analysis is the latest `created_at`.

### Archetype classification (`app/archetype/`, SPEC §9.1)

The shareable-card identity: after a game/match finishes, a cheap model assigns one of **20 fixed
identities** (16-cell tier×style grid + 4 legendaries), a one-line flavor sentence, and picks the
**meme moment** (≤4 message positions). Runs async on its own pgmq queue `game_archetype`, drained
by the **same worker process** as `game_analysis` (`backend/worker.py` runs both `run_loop`s
concurrently — the fast archetype pass shouldn't wait behind a slow deep review). Fires
automatically at finish (not a client RPC): solo `game.py::_finish` → `enqueue_game_archetype`;
PvP `pvp.py::_finish` → `enqueue_match_archetype` for **both sides** (each player awaits their own).

- **Hybrid classification (`classify.py` + `engine.py`):** the backend derives the **accuracy
  tier** + the **4 legendary triggers** deterministically (thresholds are `ARCHETYPE_*` config
  knobs; win/block read off the eval mating squares, so it's source-independent). The model
  (`ARCHETYPE_MODEL`, default a Haiku-class slug) only returns the **play-style** (1 of 4, which
  with the tier indexes the grid via `vocab.py`), the **flavor**, and the **meme window** (a
  `meme_start` position + a downstream count, which the server expands into the consecutive
  `meme_positions` it stores) — it never names an archetype. Priority when several legendaries fire: **Brilliancy → Scholar's
  Mate → Comeback → Massacre** (Brilliancy is a mid-game `!!` line, not the closing move). On any
  model failure/timeout (`archetype_timeout_seconds`) a **deterministic fallback** is persisted, so
  a `game_archetypes` row ALWAYS lands and the client's loader never hangs. `FakeArchetypeEngine`
  under `FAKE_ENGINE`/no key. Enqueue mints `game_archetypes.id` up front (like the analysis RPC).
- **Wire:** the finish frame carries no archetype content — it adds `archetype_id` (the row to
  await), `rating` (post-finish elo for the card's "prev + Δ"), and `eval_after` on each `MoveOut`
  (drives the card eval graph). The client awaits the `game_archetypes` INSERT over realtime.
- **Tables:** `game_archetypes` (archetype enum / is_legendary / tier / style / flavor_reason /
  meme_positions / model / raw_response, nullable `game_id`/`match_id` XOR + `side`; `unique(game_id)`
  and `unique(match_id, side)`) + `archetype_jobs` (lifecycle/idempotency, `replica identity full`
  for the loader's `failed` safety-net UPDATE). Owner/participant-read RLS; service_role writes.
  Frontend: `app/lib/game/archetypes.ts` maps the enum key → display title + legendary flag (the
  backend deals only in keys, like `MoveClassKey`); `useArchetype` awaits the row and the card slot
  shows the inline `LoadingScene` until it arrives. The exportable card is one component
  (`app/match/components/ShareCard.tsx`) reused by the after-game modal, the PvP result modal, and
  the profile "Share Card" flow (`ShareCardModal` + `useArchetypeBySource` + `shareCardData.ts`,
  opened from a ⋮ menu on each history row — PvP rows let the viewer flip sides). The CTA band is
  captured into the shared PNG only (`useShareCard`'s `capturing` flag), never shown in the modal.
- **Backfill:** `20260718000000_archetype_backfill.sql` enqueues an archetype job (idempotent) for
  every pre-existing completed solo game + PvP match side, so historical cards exist too.

### Security invariants (do not violate)

- Grading, the clock, and rating are **server-authoritative** — never trust client-reported time
  or scores.
- The **service role is the sole writer** of game state; the service-role key must never reach the
  client.
- `persona_secrets` / `puzzle_solutions` are RLS-gated and read only by the backend — never send a
  persona's hidden type or system prompt to the client.
- **service_role bypasses RLS but NOT table privileges** — the migration explicitly
  `grant`s privileges on all tables/sequences in `public` to `service_role`. Without those grants
  every backend query fails with `permission denied` (42501).

## Frontend — Match screen

> **Paths in this section are under `frontend/apps/web/`** (the app moved into the workspace).
> The **shared visuals were extracted** to `@matedate/visuals` (`frontend/packages/visuals`) and
> `@matedate/icons`: the `ShareCard` tree, `EvalGraph`, `MoveIcon`/`MoveBadge`, `Logo`/`Wordmark`,
> `EvalBar`, `VerdictFlash`, `ChatBubble`, the grading vocab (`MOVE_CLASSES`/`formatSwing`/
> `classify*`/`MoveClassKey`), `WireMove`/`ShareCardData`/`toWireMoves`, and `archetypes`/`tiers`/
> `cardHelpers` now live there and are imported from `@matedate/visuals` (chess pieces + move
> glyphs from `@matedate/icons`). The web keeps the data/session/hook layer (`useArchetype`,
> `useShareCard`, `loadShareCardData`, the WS clients, `MessageThread`'s scroll container) and thin
> re-export bridges at `app/lib/game/{types,live,shareCardData}.ts` + `app/lib/utils.ts`, so the
> descriptions below still read correctly. See `frontend/README.md` for the package boundary rules.

`app/match/useMatchGame.ts` drives gameplay off the backend WS via `app/lib/game/live.ts`
(`NEXT_PUBLIC_BACKEND_WS_URL`, default `ws://127.0.0.1:8000/ws`). It resolves a Supabase access
token (falling back to `signInAnonymously`) for the `?token=` handshake. Persona, grading, replies,
and the per-move clock are all server-authoritative; `useMatchClock` is display-only and the game
ends on the server's `finish` (at which point the hook **closes the socket**). On `finish` the hook
stashes a `GameResult` (incl. `gameId`) that renders `components/AfterGameModal.tsx` (share card +
result banner, ported from `mocks/MateDate After-Game.html`). Its "Deep analysis" button is
**fire-and-forget**: it calls the `request_game_analysis` **Supabase RPC** (not the WS), then
disables ("Review requested ✓") — no waiting, no redirect. The result surfaces on the main screen:
`/play` mounts `components/ui/NotificationsBell.tsx` (driven by
`lib/notifications/useAnalysisNotifications.ts`), which catch-up-queries + subscribes to realtime on
`analysis_jobs` and shows a notification when a review finishes; a ready one links to
**`/analysis/[id]`** — the full **Game Review** screen (`app/analysis/[id]/`, ported from
`mocks/MateDate Game Review.html`): a chess-style replay player (scrubber + transport + autoplay in
`useReviewReplay`, `←`/`→`/space, `localStorage` step), a summary strip (accuracy · brilliant ·
blunder · elo Δ), a live eval meter, and a per-move analysis panel (overview at step 0, else the
derived rank + comment + best line). The best line is now a **real RLS gate**: it comes from
`game_analysis_move_reveals`, which only returns rows for an unlocked game, so a non-top move with
no reveal renders locked (the unlock button is a paid-reveal placeholder — no purchase flow yet).
It reads `game_analyses`/`game_analysis_moves` (+ the reveals) plus the source
`games`/`solo_games`/`personas`/`moves` (all owner-RLS), matching analysis↔thread by `position` and
deriving each rank from `eval_delta` via `classifySwing` (`app/lib/game/types.ts`).
`components/ui/LoadingScene.tsx`
(ported from `mocks/MateDate Loading.html`) is kept but **currently unused** (no `/analyzing`
route). `app/lib/game/service.ts` remains as the shared type re-export; its
client-side grading is no longer called.

**PvP frontend:** `/match` branches on `mode` — `bot` keeps the solo screen above;
`ranked`/`friend` render `app/match/PvpMatchScreen.tsx` on `app/match/usePvpGame.ts` +
`app/lib/game/pvpLive.ts` (`NEXT_PUBLIC_BACKEND_WS_MATCH_URL`, default
`ws://127.0.0.1:8000/ws/match`). Query contract: `?mode=ranked&tc=` queues,
`?mode=friend&tc=` creates an invite (`components/PvpWaiting.tsx` shows the copyable
`/join/<code>` link; `app/join/[code]/page.tsx` is the landing that hands the code back to
`/match?mode=friend&code=`), searching shows a cancelable overlay until `match_found` plays the
`MatchIntro` face-off with the real human opponent (avatar/elo; "Friendly" when unrated). During
play `components/OpponentPanel.tsx` renders everything the player may see of the opponent —
status, clock, glyph row, eval bar, accuracies — never content (`OppMoveOut.content` is null
until the finish); the composer locks outside your turn ("Waiting for <opponent>…"). On
`match_finish` the hook stashes a `PvpResult` for `components/PvpResultModal.tsx` (W/L/D, both
accuracies, ±elo or "friendly", and the opponent-transcript reveal — plus a "Deep analysis"
button that fires the `request_match_analysis` RPC). Profile history fills the `ranked`
category from `pvp_matches` + embedded `matches` (result from `winner_side` vs own side;
friend matches labeled "friendly") and links completed match reviews. The `/analysis/[id]`
review screen handles match sources: `review.ts` loads the side's `match_moves` thread +
per-side accuracy/elo from `pvp_matches`, and a **Board switch** (You | Opponent) navigates
to the other side's analysis (each side is its own `game_analyses` row, found by
`(match_id, side)`). Matches WITHOUT a deep review open **`/analysis/match/[matchId]`**
(`loadReviewByMatch`, `?board=a|b`, defaults to your own side) — a live-eval replay with a
request-review card, the match twin of `/analysis/game/[gameId]`; the board switch falls back
to the other side's live replay when its analysis doesn't exist yet. Profile history routes
ranked rows there when no completed review is linked.

**Session guard:** every route except `/`, `/onboarding`, and `/join/*` requires a Supabase
session. One source of truth — `app/lib/auth/sessionGuard.ts` (`isPublicPath` /
`onboardingPath` / `safeNext`) — enforced twice: server-side in
`app/lib/supabase/middleware.ts` (via `proxy.ts`, covers full loads AND client navigations'
RSC fetches) and client-side by `app/providers/SessionGate.tsx` (inside AppProviders; catches
a session dying on an already-rendered page). Signed-out visitors land on
`/onboarding?next=<original destination>`; the Done screen pushes `next` (validated,
internal paths only) after signup or the anonymous Skip — this is how a sessionless friend
clicking a `/join/<code>` link still ends up in the match after onboarding.

Onboarding (`/onboarding`) does real Supabase signup (or `signInAnonymously` on "Skip"), persisting
quiz answers to `profiles` — including the player's `gender` and who they're `seeking` (the
Identity step). Those drive gender matching (SPEC §2.7): solo/VS-AI serves a persona whose gender =
the player's `seeking` (`pick_persona(gender=…)` in `app/personas.py`, from `profiles.seeking`),
puzzles the same, and ranked PvP pairs same-gender players who seek the same gender (the persona is
that sought gender). `matchmaking_queue` snapshots gender/seeking server-side (queueing is
service-mediated over the WS — clients have no INSERT) so pairing filters without a join.

## Testing / verification checklist

- Backend: after a schema change run `task gen-types` (regenerates `app/database_types.py`), then
  `cd backend && uv run mypy .` clean — mypy is the proof the DB layer matches the schema. Drive
  `SoloGameService` or the WS against local Supabase (bad token→4401, play→`response`, cap→`finish
  scored`, creepy line→`response`+`finish blocked`, date ask e.g. "coffee saturday?"→`response`+
  `finish date_landed`, reconnect→`game_state`, second socket→4000, clock expiry→`finish timeout`).
- PvP: `uv run python -m scripts.pvp_smoke` (backend on :8000 with `FAKE_ENGINE=true`, local
  Supabase up) drives two real WS clients end-to-end: pairing isolation (tc/gender/seeking),
  lockstep (`not_your_turn`), content-gated `opp_move`, all four end states pushed to the idle
  opponent + both sockets closing, reconnect → gated `match_state`, invite create/join/bad-code/
  self-join/cancel, and no rating rows on unrated matches.
- Frontend: `cd frontend && yarn tsc --noEmit && yarn lint && yarn build` all clean.
