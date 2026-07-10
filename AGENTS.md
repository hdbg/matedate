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
task dev        # starts local Supabase, backend (:8000), and frontend in parallel
```

`task dev` brings up Supabase once (skipped if already running), then runs the backend and
frontend concurrently. Both read their local env: `backend/.env` and `frontend/.env.local` point
at the local Supabase CLI instance (there is **no mock/real toggle** — dev uses real local
Supabase). Individual tasks: `task supabase`, `task backend`, `task frontend`. `task gen-types`
regenerates the backend's typed DB schema (`backend/app/database_types.py`) from local Supabase.

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
    `finish`{end_reason,accuracy,rating_delta,moves,title,description} · `error`{code,message}
  - client→ `move`{content}
- **Clock (SPEC §2.6):** per-move budget in ms; `solo_games.turn_deadline` persists it so the
  server is authoritative and reconnect restores the right `time_left`. `time` is the full budget
  (so resumed later turns reset correctly); `time_left` is what remains in the open turn.
- **End conditions:** whichever comes first — `SOLO_MAX_EXCHANGES` (default 6, → `scored`), the
  move clock expiring (→ `timeout`), or a **block** (→ `blocked`).
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
  classification (SPEC §3 thresholds). Never computed by the LLM or the client. Frontend
  `MoveClassKey` vocab (brilliant/great/good/inaccuracy/mistake/blunder) maps to the DB
  `move_kind` enum.
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
  with the generated `*Insert`/`*Update` TypedDicts and pass through `game.py`'s `_json_row`
  (datetime→ISO, UUID→str) because postgrest serializes payloads with plain `json.dumps`.
- **Run:** `uv run --directory backend uvicorn main:app` (or `task backend`). `uv run mypy .`
  must stay clean (typed protocol + PydanticAI). `backend/.env` (gitignored) holds the
  service-role key + OpenRouter key; see `backend/.env.example`.

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
ends on the server's `finish`. Both `mode=ranked|bot` currently use the solo backend (ranked PvH is
a later layer) — mode only affects UI labels. `app/lib/game/service.ts` remains as the shared type
re-export; its client-side grading is no longer called.

Onboarding (`/onboarding`) does real Supabase signup (or `signInAnonymously` on "Skip"), persisting
quiz answers to `profiles`.

## Testing / verification checklist

- Backend: after a schema change run `task gen-types` (regenerates `app/database_types.py`), then
  `cd backend && uv run mypy .` clean — mypy is the proof the DB layer matches the schema. Drive
  `SoloGameService` or the WS against local Supabase (bad token→4401, play→`response`, cap→`finish
  scored`, creepy line→`response`+`finish blocked`, reconnect→`game_state`, second socket→4000,
  clock expiry→`finish timeout`).
- Frontend: `cd frontend && yarn tsc --noEmit && yarn lint && yarn build` all clean.
