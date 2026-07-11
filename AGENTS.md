# MateDate — repo guide for agents

Chess-style dating game: the player flirts with an AI persona while an engine grades their
messages like chess moves (Brilliant … Blunder). `SPEC.md` is the product spec of record.

## Layout

- `frontend/` — Next.js (App Router) + React + TypeScript. **Has its own `AGENTS.md`** — this
  Next.js has breaking changes; read `node_modules/next/dist/docs/` before writing Next code.
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
  move/reconnect), or a **block** (→ `blocked`).
- **The engine (`app/engine.py`):** one combined **PydanticAI** agent per turn returns
  `MoveVerdict{eval_after 0-100, reply, reasoning, is_blocked}` — it both role-plays the persona's
  reply and scores the player's message. Provider-agnostic via **OpenRouter** (no vendor lock-in;
  `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`). A deterministic **`FakeEngine`** is used when
  `FAKE_ENGINE=true` OR `OPENROUTER_API_KEY` is empty, so the whole WS flow runs offline (used by
  tests). `build_engine()` picks between them.
- **`is_blocked` / early end:** when the persona would block/unmatch a genuinely offensive or
  creepy line, the verdict sets `is_blocked=true`. `apply_move` then sends the persona's parting
  `response` **and then** a `finish` with `end_reason="blocked"`, so the player sees the block
  message + the blunder verdict before the game ends. `FakeEngine` triggers this on
  creep/gross/block/unmatch keywords. `blocked` is a value in the `match_end_reason` enum.
- **Grading (`app/grading.py`):** deterministic, server-side — eval delta → `swing` (= delta/10) →
  classification (SPEC §3 thresholds). Never computed by the LLM or the client. **Move quality is
  stored as the numeric eval only** (`eval_before/eval_after/eval_delta`) in every move table
  (`moves`, `match_moves`, `game_analysis_moves`); the Brilliant…Blunder rank is *derived on read*
  by `classify()` and never persisted — there is no `move_kind` enum. The frontend `MoveClassKey`
  vocab (brilliant/great/good/inaccuracy/mistake/blunder) is what the wire carries (derived by
  `_move_out`), not a stored column.
- **DB (`app/supabase_client.py`):** all reads/writes go through the **async** service-role
  Supabase client (`AsyncClient`, constructed synchronously but every `.execute()` is `await`ed,
  so DB I/O never blocks the event loop — no `asyncio.to_thread`). Service role bypasses RLS.
  Writes: `games`(mode=solo, status, end_reason, accuracy), `solo_games`(clock/exchanges/
  rating_delta), `moves`, `engine_responses`, and a rating bump on finish (`player_ratings.
  rizz_rating` + `rating_history`).
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

### Post-game analysis (`app/analysis/`, separate worker)

Deep "game review" (chess.com style) for a finished game, decoupled from live play via a durable
queue. Source-independent by design: **one** result-table pair regardless of source (solo now;
PvP rounds / screenshot uploads later), so there is no per-mode analysis table.

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
  persist). A deterministic `FakeAnalysisEngine` runs under `FAKE_ENGINE` / no key, same as
  `build_engine`.
- **Worker (`backend/worker.py` → `app/analysis/worker.py`, `task worker`, in `task dev`):** a
  standalone process polling `pgmq_read` with a visibility timeout. Failures record `last_error`
  and reset the job to `queued` (pgmq redelivers after the vt); `read_ct > ANALYSIS_MAX_ATTEMPTS`
  → job `failed` + archived (poison message parked in `pgmq.a_game_analysis`); success writes
  `game_analyses` + `game_analysis_moves` and archives.
- **Tables:** `game_analyses` (title/description/tags/model/prompt_version/raw_response, nullable
  `game_id`/`round_id` XOR source) + `game_analysis_moves` (per You move:
  `eval_before/eval_after/eval_delta` + comment/best_line + a `content` snapshot and nullable
  `move_id`; the rank is derived from `eval_delta`, never stored). Owner-read RLS; service_role writes.
  Re-analysis is allowed (no `unique(game_id)`); the current analysis is the latest `created_at`.

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
**`/analysis/[id]`** — a functional **stub** view (title/description/tags + per-move
eval/rank/comment/best-line) until a Game Review mock exists. `components/ui/LoadingScene.tsx`
(ported from `mocks/MateDate Loading.html`) is kept but **currently unused** (no `/analyzing`
route). Both `mode=ranked|bot` currently use the solo backend (ranked PvH is a later layer) — mode
only affects UI labels. `app/lib/game/service.ts` remains as the shared type re-export; its
client-side grading is no longer called.

Onboarding (`/onboarding`) does real Supabase signup (or `signInAnonymously` on "Skip"), persisting
quiz answers to `profiles`.

## Testing / verification checklist

- Backend: after a schema change run `task gen-types` (regenerates `app/database_types.py`), then
  `cd backend && uv run mypy .` clean — mypy is the proof the DB layer matches the schema. Drive
  `SoloGameService` or the WS against local Supabase (bad token→4401, play→`response`, cap→`finish
  scored`, creepy line→`response`+`finish blocked`, reconnect→`game_state`, second socket→4000,
  clock expiry→`finish timeout`).
- Frontend: `cd frontend && yarn tsc --noEmit && yarn lint && yarn build` all clean.
