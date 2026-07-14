-- MateDate — initial schema
--
-- Covers the four launch domains plus the engine's output surface:
--   1. Auth        — profiles mirrored off auth.users, 18+ gate, referral code.
--   2. Ratings     — player_ratings (read-only to the owner via RLS) + a change log.
--   3. Matchmaking — personas, queue, per-mode match tables (pvp / ai / ghost), invites, moves.
--   4. Analysis    — a durable pgmq queue for deep analysis + a jobs table for lifecycle/observability.
--   5. Engine      — the classify / eval output, for single-player games and PvP moves alike.
--   6. Reveals     — the paid best-move + persona/puzzle secrets, split into their own
--                    tables so row-level RLS alone gates them (no column-level security).
--
-- Conventions:
--   * All application data lives in `public`; RLS is on for every table.
--   * Clients read/write only their own rows; the FastAPI analysis service uses the
--     service_role key (which bypasses RLS) to write scoring results and match state.
--   * Enum spellings mirror the Rust engine's serde output (MoveKind / Side) so engine
--     responses map straight onto columns with no translation layer.
--   * Raw screenshots are never stored (see SPEC §5.3); only cleaned/redacted text lands here.

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists pgmq;     -- durable pull queue for analysis jobs

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

-- Move quality is stored as a numeric eval score, never a category label: every move table
-- keeps eval_before/eval_after/eval_delta and the human-facing rank (Brilliant…Blunder) is
-- derived from the swing at read time (backend `app/grading.py`). So there is no move_kind enum.

-- Which party sent a message, in the card's You/Match framing (SPEC §5.1, §9).
-- The engine emits Side::They / Side::Us; the API maps They->Match, Us->You.
create type public.message_side as enum ('Match', 'You');

-- Which single-player mode a game is. Doubles as the discriminator that says which
-- per-mode child table (solo_games / screenshot_games / puzzle_attempts) holds the rest.
create type public.game_mode as enum ('solo', 'screenshot', 'puzzle');

-- Lifecycle of a single-player game. Live solo (PvE) play is server-driven over a
-- WebSocket; 'active' is the resumable in-progress state, and a partial unique index on
-- games enforces at most one active game per user (SPEC §2.1).
create type public.game_status as enum ('active', 'completed', 'abandoned');

-- Which ELO a rating change applies to.
create type public.rating_kind as enum ('elo', 'ranked', 'casual');

-- Onboarding quiz answers (SPEC §8, funnel). dating_goal is single-select;
-- texting_style is multi-select and stored as an array of these values.
create type public.dating_goal as enum ('serious', 'casual', 'confidence', 'practice');
create type public.texting_style as enum ('drywit', 'playful', 'dark', 'earnest');

-- Gender identity + preference, both single-select ("men or women"). A player carries their own
-- `gender` and a `seeking` (the gender they want to date); personas and puzzles carry the gender
-- they portray. Matchmaking (SPEC §2): VS-AI and puzzles serve a persona/puzzle whose gender = the
-- player's `seeking`; PvP pairs two players with the same `gender` who share the same `seeking`, and
-- gives them a persona of that sought gender. Intentionally binary — the pairing/persona mapping is
-- defined over two sides.
create type public.gender as enum ('man', 'woman');

-- A versus match's lifecycle. Matches are born 'active': one is only created once both
-- competitors exist (a matchmaking pair or an accepted friend invite), and grading is live
-- per move, so there is no queued/scoring state.
create type public.match_status as enum ('active', 'completed', 'abandoned');

-- Which versus format a match is. Each has its own table (no shared discriminator rows):
-- pvp = human vs human, ai = human vs disclosed AI, ghost = human vs a recorded replay.
-- Only pvp and ghost affect ranked ELO; ai affects the casual rating (SPEC §2.4).
create type public.match_mode as enum ('pvp', 'ai', 'ghost');

-- The two sides of a match. Side 'a' is always the primary human whose match this is;
-- 'b' is the opponent (a second human, the AI, or the replayed ghost).
create type public.match_side as enum ('a', 'b');

-- Time-control pool for a versus match (flaking prevention, SPEC §2.6). Each pool maps to a
-- per-player Fischer clock (base + increment, snapshotted on the match row by the backend);
-- letting the bank hit zero forfeits. Players pair only within the same pool.
create type public.time_control as enum ('bullet', 'rapid', 'classical');

-- How a match ended. 'scored' = played to completion; 'timeout' = a player flagged;
-- 'blocked' = the persona blocked/unmatched the player (checkmate loss, SPEC §3);
-- 'date_landed' = the persona agreed to a date (checkmate win) — both end the game early.
create type public.match_end_reason as enum ('scored', 'timeout', 'resignation', 'abandoned', 'blocked', 'date_landed');

-- Lifecycle of a queued analysis / scoring job.
create type public.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- What an analysis job scores. 'game_analysis' is the source-independent post-game deep
-- review (chess.com "game review" style); 'screenshot' is the earlier lifecycle kind.
-- Both flow through analysis_jobs + a pgmq queue.
create type public.job_kind as enum ('screenshot', 'game_analysis');

-- Where a best-move unlock came from (SPEC §7.2–7.4).
create type public.unlock_source as enum ('subscription', 'credit', 'referral', 'admin');

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. AUTH — profiles
-- ===========================================================================

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  -- Handle, chosen at onboarding or later in the profile editor. Lowercase slug; the client
  -- mirrors this exact pattern (frontend/app/lib/username.ts) — keep the two in sync.
  username          text unique check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  display_name      text,

  -- Profile picture: a path inside the public `avatars` storage bucket
  -- ('{uid}/avatar-<ts>.webp'), never a full URL — the client derives the public URL from it.
  -- Null means no photo; the UI falls back to the pawn placeholder.
  avatar_path       text,

  -- 18+ gate (SPEC §8.3). We store the attested date of birth and when the gate
  -- was cleared; we deliberately do not collect data that would trigger COPPA.
  date_of_birth     date,
  age_verified_at   timestamptz,

  -- Onboarding quiz answers (SPEC §8). Tune AI dates / puzzles to the player.
  -- dating_goal is single-select; texting_style is multi-select (default empty).
  dating_goal       public.dating_goal,
  texting_style     public.texting_style[] not null default '{}',

  -- Gender identity + who they're looking for (SPEC §8, collected at onboarding). `gender` is the
  -- player's own identity; `seeking` is the gender they want to date. Both are nullable until the
  -- player answers the onboarding step; together they drive matchmaking (SPEC §2).
  gender            public.gender,
  seeking           public.gender,

  -- Ratings live in player_ratings (its own table) so RLS alone can make them
  -- read-only to the owner while the rest of the profile stays user-editable —
  -- a client can never PATCH its own ELO.

  -- Growth loop (SPEC §7.4).
  referral_code     text unique default encode(extensions.gen_random_bytes(6), 'hex'),
  referred_by       uuid references public.profiles (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Mirror every new auth user into a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  insert into public.player_ratings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 2. RATINGS — player_ratings (read-only to owner) + append-only change log
-- ===========================================================================

-- Split out of profiles so RLS alone protects them: the owner may SELECT this row,
-- but there is no update policy, so only the service_role can move a rating.
create table public.player_ratings (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  elo_rating    integer not null default 1000, -- PvE / screenshot ladder
  ranked_elo    integer not null default 1000, -- PvH global ladder
  casual_rating integer not null default 1000, -- disclosed-AI practice ladder
  ranked_tier   text,                          -- computed app-side from ranked_elo
  ranked_wins   integer not null default 0,
  ranked_losses integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint elo_rating_nonneg   check (elo_rating   >= 0),
  constraint ranked_elo_nonneg    check (ranked_elo    >= 0),
  constraint casual_rating_nonneg check (casual_rating >= 0)
);

create trigger player_ratings_set_updated_at
  before update on public.player_ratings
  for each row execute function public.set_updated_at();

create table public.rating_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.rating_kind not null,
  rating_before integer not null,
  rating_after  integer not null,
  delta         integer not null,
  -- Loose provenance: a game or a match that produced this change. Kept as an
  -- unconstrained uuid so we don't couple the log to one source table's lifecycle.
  source_kind  text,   -- 'game' | 'match' | 'admin' | ...
  source_id    uuid,
  created_at   timestamptz not null default now()
);

create index rating_history_user_created_idx
  on public.rating_history (user_id, created_at desc);

-- ===========================================================================
-- 3. MATCHMAKING — personas, queue, matches, invites, moves
-- ===========================================================================

-- Reusable AI dates. Used by solo, practice, and ranked (both players get the same one).
create table public.personas (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  -- The gender this AI date presents as (shown to players; not a secret). Matchmaking serves a
  -- persona whose gender = the player's `seeking` (SPEC §2).
  gender        public.gender not null,
  difficulty    smallint not null default 1,
  is_boss       boolean not null default false,
  is_active     boolean not null default true,
  description   text,
  opening_line  text not null, -- shown to both players; not a secret
  -- Up to three canned opener suggestions, shown to both players for free (readable by any signed-in
  -- user via personas_select_active — never gated). Not secrets; distinct from the paid best move.
  suggested_messages text[] not null default '{}' check (cardinality(suggested_messages) <= 3),
  created_at    timestamptz not null default now()
);

create index personas_active_idx on public.personas (is_active) where is_active;
-- Pick an active persona of the sought gender (VS-AI / PvP persona selection, SPEC §2).
create index personas_active_gender_idx on public.personas (gender) where is_active;

-- The secret half of a persona: the hidden "type" players must read (into hiking /
-- dark humor / dry wit) and the system prompt. Split out so RLS alone protects it —
-- this table has no client policy, so only the service_role (the engine) can read it.
create table public.persona_secrets (
  persona_id    uuid primary key references public.personas (id) on delete cascade,
  hidden_type   text,          -- the type players must infer, never exposed mid-game
  system_prompt text not null
);

-- Players waiting to be paired for a ranked match.
create table public.matchmaking_queue (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  ranked_elo      integer not null, -- snapshot at enqueue time, for pairing windows
  -- Pairing keys snapshotted at enqueue (like ranked_elo): PvP pairs only players with the same
  -- `gender` who share the same `seeking`, and gives the pair a persona of that sought gender
  -- (SPEC §2.2). Kept on the row so the pairing query filters without joining profiles.
  gender          public.gender not null,
  seeking         public.gender not null,
  time_control    public.time_control not null default 'rapid', -- players pair within a pool
  status          public.job_status not null default 'queued',
  enqueued_at     timestamptz not null default now(),
  matched_at      timestamptz,
  match_id        uuid,             -- set once paired (FK added after matches table)
  unique (user_id) -- a player sits in the queue at most once
);

-- Pair players within the same time-control + gender/seeking pool, closest ELO / longest wait first.
create index matchmaking_queue_open_idx
  on public.matchmaking_queue (time_control, gender, seeking, ranked_elo, enqueued_at)
  where status = 'queued';

-- Shared parent for every versus match. Every column here is always present regardless
-- of mode; the mode-specific sides and result columns live in the per-mode child tables
-- below, so no table ever carries half-filled, discriminator-dependent columns. Both
-- competitors play the same persona / scenario / opening line, each in their OWN parallel
-- conversation, in lockstep alternation (side 'a' always moves first; content is hidden
-- mid-match, so the first-mover information edge is negligible). A match is a single
-- contest: it ends on a checkmate (blocked / date_landed), a timeout, or both sides
-- completing max_exchanges — whoever graded higher accuracy wins ('scored'); an exact tie
-- is a draw (winner_side stays null).
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  mode          public.match_mode not null, -- which child table holds the two sides
  persona_id    uuid not null references public.personas (id),
  status        public.match_status not null default 'active',
  -- Per-player Fischer clock snapshot (SPEC §2.6). The pools map to (base, increment) in
  -- backend config — bullet 20+3, rapid 40+5, classical 60+8 — and are snapshotted here so
  -- config tuning never rewrites a live match; the DB checks positivity only.
  time_control      public.time_control not null default 'rapid',
  base_seconds      smallint not null,
  increment_seconds smallint not null,
  max_exchanges     smallint not null default 6, -- per-player exchange cap, snapshotted
  rated         boolean not null default true,   -- friend-invite matches are unrated
  opening_line  text not null, -- snapshotted from the persona so it stays stable
  winner_side   public.match_side, -- null until the match is decided; stays null on a draw
  end_reason    public.match_end_reason, -- null until the match ends
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint clock_positive check (base_seconds > 0 and increment_seconds >= 0),
  constraint max_exchanges_positive check (max_exchanges > 0)
);

create index matches_status_idx  on public.matches (status);
create index matches_persona_idx on public.matches (persona_id);

alter table public.matchmaking_queue
  add constraint matchmaking_queue_match_fk
  foreign key (match_id) references public.matches (id) on delete set null;

-- Human vs human (SPEC §2.2). Both sides are real accounts; ranked (matchmade) matches
-- stake ranked ELO, friend-invite matches are unrated (matches.rated = false).
create table public.pvp_matches (
  match_id            uuid primary key references public.matches (id) on delete cascade,
  player_a            uuid not null references public.profiles (id) on delete cascade,
  player_b            uuid not null references public.profiles (id) on delete cascade,

  -- Lockstep turn state (server-authoritative, written only by the backend). turn_side is
  -- the player on the move; turn_deadline = now() + that player's bank when their turn
  -- opened (null while the engine grades a submitted move and after the match ends), so the
  -- on-move player's live bank is turn_deadline - now(). The bank columns hold each
  -- player's Fischer bank AT REST (ms); the mover's bank is re-persisted (remaining +
  -- increment) when their move is accepted. Exchange counts derive from match_moves
  -- (count of speaker = 'You' rows per side) — not duplicated here.
  turn_side        public.match_side not null default 'a',
  turn_deadline    timestamptz,
  player_a_bank_ms integer not null,
  player_b_bank_ms integer not null,

  -- Result snapshot (written at finish; accuracy is the mean move quality, like games).
  player_a_accuracy   numeric(5,2),
  player_b_accuracy   numeric(5,2),
  player_a_elo_before integer, -- rating columns stay null on unrated matches
  player_a_elo_after  integer,
  player_b_elo_before integer,
  player_b_elo_after  integer,
  constraint pvp_distinct_players check (player_a <> player_b),
  constraint pvp_banks_nonneg check (player_a_bank_ms >= 0 and player_b_bank_ms >= 0)
);

create index pvp_matches_player_a_idx on public.pvp_matches (player_a);
create index pvp_matches_player_b_idx on public.pvp_matches (player_b);

-- Human vs a disclosed AI opponent (SPEC §2.3). Always badged as AI; affects the casual
-- rating only, never ranked ELO. Side 'a' is the player, side 'b' is the bot.
create table public.ai_matches (
  match_id             uuid primary key references public.matches (id) on delete cascade,
  player               uuid not null references public.profiles (id) on delete cascade,
  ai_label             text not null, -- e.g. "🤖 RizzBot-1400", always shown as AI
  ai_rating            integer,       -- the bot's displayed casual rating
  player_casual_before integer,
  player_casual_after  integer
);

create index ai_matches_player_idx on public.ai_matches (player);

-- Human vs a recorded replay of a past attempt (SPEC §2.4 ghost/replay duels). Real,
-- time-shifted human competition, so it does affect ranked ELO. Side 'a' is the live
-- challenger; side 'b's messages are copied in from the recorded source match.
create table public.ghost_matches (
  match_id          uuid primary key references public.matches (id) on delete cascade,
  player            uuid not null references public.profiles (id) on delete cascade,
  source_match_id   uuid not null references public.matches (id) on delete restrict,
  ghost_player      uuid references public.profiles (id) on delete set null, -- "StrangerX", for attribution
  player_elo_before integer,
  player_elo_after  integer
);

create index ghost_matches_player_idx on public.ghost_matches (player);
create index ghost_matches_source_idx on public.ghost_matches (source_match_id);

-- Friend-challenge invites (unrated PvP): the creator gets a shareable link carrying an
-- unguessable code; only someone holding the link can join. Codes are resolved server-side
-- over the WS (service_role) — there is deliberately no client lookup-by-code path, so
-- codes can't be enumerated via PostgREST. An invite lives only while the creator's socket
-- is waiting on it: disconnect/cancel flips it to 'cancelled', a successful join to
-- 'completed' (+ match_id).
create table public.match_invites (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null, -- secrets.token_urlsafe(12), backend-generated
  creator       uuid not null references public.profiles (id) on delete cascade,
  time_control  public.time_control not null default 'rapid',
  status        public.job_status not null default 'queued', -- queued=open, completed=matched
  match_id      uuid references public.matches (id) on delete set null, -- set once joined
  created_at    timestamptz not null default now(),
  matched_at    timestamptz
);

create index match_invites_open_code_idx on public.match_invites (code) where status = 'queued';

-- One message inside a competitor's conversation with the persona, plus the engine's
-- verdict on it — the two-dimensional mirror of `moves`: `side` says WHOSE conversation
-- the row belongs to (competitor a or b, resolved to an identity via the per-mode child
-- table), `speaker` says who spoke ('You' = that competitor, 'Match' = the persona).
-- Both players talk to the same persona in parallel; grading is live per move (no scoring
-- worker), and the match clock lives on pvp_matches, so there is no per-move deadline.
create table public.match_moves (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches (id) on delete cascade,
  side           public.match_side not null,   -- whose conversation this row belongs to
  position       integer not null,             -- 0-based order within that side's conversation
  speaker        public.message_side not null, -- 'You' = the competitor, 'Match' = the persona
  content        text not null,

  -- Engine response ('You' rows only). Quality is the numeric eval only; the
  -- Brilliant…Blunder rank is derived from the swing (eval_delta) at read time, never stored.
  eval_before    numeric(5,2), -- hidden 0..100 interest state before this move
  eval_after     numeric(5,2),
  eval_delta     numeric(6,2) generated always as (eval_after - eval_before) stored, -- derived, never written
  -- best_move lives in match_move_reveals (RLS-gated by an unlock; see section 6).

  created_at     timestamptz not null default now(),
  unique (match_id, side, position)
);

create index match_moves_match_idx on public.match_moves (match_id);

-- ===========================================================================
-- 4. ANALYSIS QUEUE — durable pgmq queue + a jobs tracking table
-- ===========================================================================

-- Durable pull queue (visibility timeouts, acks, retries). Python workers call
-- pgmq.read / pgmq.archive via the security-definer wrappers below; they never subscribe to
-- Realtime for intake (SPEC §5.2). Screenshot review stays synchronous and does NOT use this.
-- PvP grading is live per move (no scoring queue).
--   game_analysis — post-game deep analysis (solo now; PvP/screenshot sources later).
select pgmq.create('game_analysis');

-- pgmq lives in its own schema, which PostgREST does NOT expose (config.toml exposes only
-- `public` + `graphql_public`), so supabase-py can't call pgmq.* directly. These security-definer
-- wrappers in `public` let the worker drive the queue via client.rpc(). They run as the migration
-- owner (which has pgmq access) and are locked to service_role only — never anon/authenticated.
create or replace function public.pgmq_send(queue_name text, msg jsonb, delay_seconds integer default 0)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select * from pgmq.send(queue_name, msg, delay_seconds);
$$;

create or replace function public.pgmq_read(queue_name text, vt_seconds integer, qty integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language sql
security definer
set search_path = ''
as $$
  select msg_id, read_ct, enqueued_at, vt, message from pgmq.read(queue_name, vt_seconds, qty);
$$;

create or replace function public.pgmq_archive(queue_name text, msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive(queue_name, msg_id);
$$;

create or replace function public.pgmq_delete(queue_name text, msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete(queue_name, msg_id);
$$;

revoke execute on function
  public.pgmq_send(text, jsonb, integer),
  public.pgmq_read(text, integer, integer),
  public.pgmq_archive(text, bigint),
  public.pgmq_delete(text, bigint)
  from public, anon, authenticated;
grant execute on function
  public.pgmq_send(text, jsonb, integer),
  public.pgmq_read(text, integer, integer),
  public.pgmq_archive(text, bigint),
  public.pgmq_delete(text, bigint)
  to service_role;

-- Application-level view of analysis work, for observability, retries, and idempotency.
-- Mirrors the pgmq message it was enqueued as (queue_msg_id), and dedupes on
-- idempotency_key so a retried request never double-scores.
create table public.analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            public.job_kind not null,
  status          public.job_status not null default 'queued',
  user_id         uuid references public.profiles (id) on delete set null,
  -- The thing being scored: a match (pvp, deferred) or a game.
  match_id        uuid references public.matches (id) on delete cascade,
  game_id         uuid,  -- FK added after games table
  queue_msg_id    bigint, -- pgmq message id, when enqueued on game_analysis
  idempotency_key text unique,
  -- Pre-generated game_analyses.id: request_game_analysis() mints it up front and returns it to
  -- the client so it can await exactly that row over realtime; the worker inserts with this id.
  analysis_id     uuid,
  attempts        smallint not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create index analysis_jobs_status_idx on public.analysis_jobs (status, created_at);
create index analysis_jobs_user_idx   on public.analysis_jobs (user_id);

create trigger analysis_jobs_set_updated_at
  before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 5. ENGINE RESPONSES — single-player games (one table per mode) + raw output
-- ===========================================================================
-- The three single-player modes (solo PvE, screenshot review, puzzle) have
-- genuinely different shapes, so each gets its own table. `games` is the shared
-- parent holding the fields common to all of them (owner, engine verdict,
-- shareable card); `moves`, `engine_responses`, and `analysis_jobs` all hang off
-- the parent so the engine-output plumbing stays uniform. PvH lives in matches/*.

-- Shared parent: fields common to every single-player analysis.
create table public.games (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete cascade,
  mode        public.game_mode not null, -- which child table holds the mode-specific rest
  -- Engine top-line verdict (nullable where a mode doesn't produce one, e.g. puzzles).
  title       text,
  description text,
  accuracy    numeric(5,2),  -- 0..100 vs. the best-move line
  -- Live-play lifecycle (server-authoritative). 'active' games are resumable; the engine
  -- flips this to 'completed'/'abandoned' on finish and stamps end_reason + ended_at.
  status      public.game_status not null default 'active',
  end_reason  public.match_end_reason, -- 'scored' | 'timeout' | 'blocked' | 'date_landed' | …; null until ended
  ended_at    timestamptz,
  -- Shareable card (SPEC §9). Rendered to PNG at a stable URL from this slug.
  share_slug  text unique default encode(extensions.gen_random_bytes(8), 'hex'),
  created_at  timestamptz not null default now()
);

create index games_user_created_idx on public.games (user_id, created_at desc);
create index games_mode_idx         on public.games (mode);

-- At most one live game per user (SPEC §2.1: one active solo game at a time). Solo PvE is
-- the only writer of active games today; extend the pool if other live modes are added.
create unique index games_one_active_per_user on public.games (user_id) where status = 'active';

alter table public.analysis_jobs
  add constraint analysis_jobs_game_fk
  foreign key (game_id) references public.games (id) on delete cascade;

-- Solo PvE vs. an AI date. Practice (disclosed-AI, badged) is the same shape, flagged
-- here; it affects the casual rating instead of elo and never touches ranked ELO.
create table public.solo_games (
  game_id      uuid primary key references public.games (id) on delete cascade,
  persona_id   uuid references public.personas (id) on delete set null,
  is_practice  boolean not null default false, -- disclosed-AI practice opponent (SPEC §2.3)
  rating_delta integer not null default 0,     -- elo, or casual when is_practice
  -- Live-play clock (SPEC §2.6): a per-GAME Fischer clock. base_seconds is the player's
  -- starting time bank (snapshotted at game start); increment_seconds is added to the bank
  -- after each submitted move (rewards quick answers). turn_deadline is the absolute instant
  -- the running bank hits zero for the open turn — set to now() + remaining_bank when the turn
  -- opens, cleared while it's the persona's turn or the game is over — so the remaining bank is
  -- turn_deadline - now(). exchanges counts completed player↔persona rounds.
  base_seconds      smallint not null default 30,
  increment_seconds smallint not null default 5,
  turn_deadline     timestamptz,
  exchanges         smallint not null default 0
);

-- Screenshot review (SPEC §2.5, §6). Only the cleaned/redacted transcript survives;
-- the raw image is processed in memory and dropped within the request (SPEC §5.3).
create table public.screenshot_games (
  game_id            uuid primary key references public.games (id) on delete cascade,
  transcript_hash    text,   -- hash of the confirmed redacted transcript (dedup/idempotency)
  attested_consent   boolean not null default false, -- both-parties-agreed checkbox (SPEC §6)
  provisional_rating integer -- a number to chase/share for solo users
);

create index screenshot_games_hash_idx on public.screenshot_games (transcript_hash);

-- Curated single-turn puzzle positions with a known best move (SPEC §3).
create table public.puzzles (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  persona_id      uuid references public.personas (id) on delete set null,
  -- The gender of the implied sender of this position. Puzzles are served like VS-AI: only those
  -- whose gender = the player's `seeking` (SPEC §2). Matches the linked persona's gender when set.
  gender          public.gender not null,
  prompt          text not null, -- the position: the line the player must respond to
  difficulty      smallint not null default 1,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index puzzles_active_idx on public.puzzles (is_active) where is_active;
-- Serve an active puzzle of the sought gender (SPEC §2, like VS-AI).
create index puzzles_active_gender_idx on public.puzzles (gender) where is_active;

-- The puzzle answer, split out so RLS alone protects it. No client policy → only the
-- service_role can read it, so the known best line never ships to the client.
create table public.puzzle_solutions (
  puzzle_id       uuid primary key references public.puzzles (id) on delete cascade,
  best_move       text not null,
  best_eval_delta numeric(6,2)
);

-- A player's attempt at a puzzle, graded by eval delta against the known best move.
create table public.puzzle_attempts (
  game_id    uuid primary key references public.games (id) on delete cascade,
  puzzle_id  uuid not null references public.puzzles (id),
  guess      text not null,
  eval_delta numeric(6,2), -- grade of the guess
  solved     boolean not null default false
);

create index puzzle_attempts_puzzle_idx on public.puzzle_attempts (puzzle_id);

-- One message in a game, plus the engine's verdict on it. Content is the cleaned,
-- redacted text only — raw screenshots never reach the database (SPEC §5.3).
create table public.moves (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games (id) on delete cascade,
  position       integer not null, -- 0-based order within the conversation
  side           public.message_side not null,
  content        text not null,

  -- Engine response. Quality is the numeric eval only; the Brilliant…Blunder rank is derived
  -- from the swing (eval_delta) at read time, never stored.
  eval_before    numeric(5,2),
  eval_after     numeric(5,2),
  eval_delta     numeric(6,2) generated always as (eval_after - eval_before) stored, -- derived, never written
  -- best_move lives in move_reveals (RLS-gated by an unlock; see section 6).

  created_at     timestamptz not null default now(),
  unique (game_id, position)
);

create index moves_game_idx on public.moves (game_id);

-- Raw engine output kept for tuning (thresholds/prompts change constantly, SPEC §3).
-- Attaches to whichever unit produced it — a single-player game, or one side's turn in a
-- versus match (side says whose conversation the graded turn belongs to).
create table public.engine_responses (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid references public.games (id) on delete cascade,
  match_id       uuid references public.matches (id) on delete cascade,
  side           public.match_side, -- set for match turns, null for games
  model          text not null,
  prompt_version text,
  raw_response   jsonb not null,
  latency_ms     integer,
  created_at     timestamptz not null default now(),
  constraint engine_response_target check (
    (game_id is not null) <> (match_id is not null)
  ),
  constraint engine_response_side_scope check (side is null or match_id is not null)
);

create index engine_responses_game_idx  on public.engine_responses (game_id);
create index engine_responses_match_idx on public.engine_responses (match_id);

-- Post-game deep analysis (chess.com "game review" style). SOURCE-INDEPENDENT: one result
-- shape whatever the source — a solo game, a screenshot upload, or (later) one side of a
-- PvP match — so there is no per-mode analysis table. Written only by the analysis worker
-- (service_role); the stronger model RE-classifies every move itself rather than trusting
-- the live grades. The source ref is a nullable game_id / match_id XOR (side says whose
-- conversation was analyzed), mirroring engine_responses/analysis_jobs.
create table public.game_analyses (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references public.analysis_jobs (id) on delete set null,
  game_id        uuid references public.games (id) on delete cascade,
  match_id       uuid references public.matches (id) on delete cascade,
  side           public.match_side, -- set for match sources, null for games
  title          text not null,
  description    text not null,
  tags           text[] not null default '{}',
  model          text not null,
  prompt_version text not null,
  raw_response   jsonb not null,       -- full verdict kept for tuning (prompts/models change)
  latency_ms     integer,
  created_at     timestamptz not null default now(),
  -- Re-analysis is allowed (models/prompts iterate): no unique(game_id). The "current"
  -- analysis is the latest created_at; accidental duplicates are prevented one level up by
  -- analysis_jobs.idempotency_key. Exactly one source per row.
  constraint game_analysis_source check ((game_id is not null) <> (match_id is not null)),
  constraint game_analysis_side_scope check (side is null or match_id is not null)
);

create index game_analyses_game_idx  on public.game_analyses (game_id, created_at desc);
create index game_analyses_match_idx on public.game_analyses (match_id);

-- The re-scored per-USER-move verdicts ("You" side only): the analysis model's fresh eval and
-- the comment, plus (unless the move is top-graded) a "best line" (a better message the user
-- could have sent). Quality is the numeric eval only — the Brilliant…Blunder rank is derived
-- from the swing (eval_delta) at read time, exactly like the live `moves` table; the analysis
-- re-evaluates independently of the source's live eval. content is snapshotted so a row is
-- displayable without joining the source-specific move table (moves for game sources,
-- match_moves for future PvP), which is why move_id stays nullable.
create table public.game_analysis_moves (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid not null references public.game_analyses (id) on delete cascade,
  position       integer not null,             -- matches the source move's position ordering
  side           public.message_side not null default 'You',
  move_id        uuid references public.moves (id) on delete set null,
  content        text not null,
  eval_before    numeric(5,2),                  -- hidden 0..100 interest state before this move
  eval_after     numeric(5,2),
  eval_delta     numeric(6,2) generated always as (eval_after - eval_before) stored, -- swing = /10 → rank
  comment        text not null,
  -- The "best line" is the paid best move — it lives in game_analysis_move_reveals (RLS-gated by an
  -- unlock; see section 6), never here, so it can't reach an unentitled client.
  created_at     timestamptz not null default now(),
  unique (analysis_id, position)
);

create index game_analysis_moves_analysis_idx on public.game_analysis_moves (analysis_id);

-- ===========================================================================
-- 6. GATED REVEALS & UNLOCKS — best-move split out so RLS alone can gate it
-- ===========================================================================
-- The paid "best move" (SPEC §7.2) is pulled out of moves/match_moves into its own
-- tables. The engine (service_role) always writes the reveal; whether the owner can
-- SELECT it is decided purely by RLS against an unlock row — no unlock, no row, so the
-- value never reaches a client that hasn't paid / subscribed / referred for it.

-- Per-game unlock (a subscription, a $1.99 credit, or the referral gate all mint one).
create table public.game_reveal_unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  source      public.unlock_source not null default 'credit',
  unlocked_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.match_reveal_unlocks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  match_id    uuid not null references public.matches (id) on delete cascade,
  source      public.unlock_source not null default 'credit',
  unlocked_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- The reveal itself for a single-player move. game_id is denormalized so the RLS
-- predicate is a straight unlock lookup with no extra join back through moves.
create table public.move_reveals (
  move_id   uuid primary key references public.moves (id) on delete cascade,
  game_id   uuid not null references public.games (id) on delete cascade,
  best_move text not null
);

create index move_reveals_game_idx on public.move_reveals (game_id);

-- The reveal for a PvP move; match_id denormalized for the same reason.
create table public.match_move_reveals (
  match_move_id uuid primary key references public.match_moves (id) on delete cascade,
  match_id      uuid not null references public.matches (id) on delete cascade,
  best_move     text not null
);

create index match_move_reveals_match_idx on public.match_move_reveals (match_id);

-- The reveal for an analysis "You" move — the paid best line, split out of game_analysis_moves so
-- RLS alone gates it. analysis_id is denormalized so the RLS predicate resolves the source
-- (game/round) + unlock without joining back through game_analysis_moves.
create table public.game_analysis_move_reveals (
  analysis_move_id uuid primary key references public.game_analysis_moves (id) on delete cascade,
  analysis_id      uuid not null references public.game_analyses (id) on delete cascade,
  best_line        text not null
);

create index game_analysis_move_reveals_analysis_idx on public.game_analysis_move_reveals (analysis_id);

-- ===========================================================================
-- RLS
-- ===========================================================================
-- Clients see and touch only their own data. The analysis service uses the
-- service_role key to write scoring results / match state and bypasses RLS.

alter table public.profiles          enable row level security;
alter table public.player_ratings    enable row level security;
alter table public.rating_history    enable row level security;
alter table public.personas          enable row level security;
alter table public.persona_secrets   enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.matches           enable row level security;
alter table public.pvp_matches       enable row level security;
alter table public.ai_matches        enable row level security;
alter table public.ghost_matches     enable row level security;
alter table public.match_invites     enable row level security;
alter table public.match_moves       enable row level security;
alter table public.analysis_jobs     enable row level security;
alter table public.games             enable row level security;
alter table public.solo_games        enable row level security;
alter table public.screenshot_games  enable row level security;
alter table public.puzzles           enable row level security;
alter table public.puzzle_solutions  enable row level security;
alter table public.puzzle_attempts   enable row level security;
alter table public.moves             enable row level security;
alter table public.engine_responses  enable row level security;
alter table public.game_analyses       enable row level security;
alter table public.game_analysis_moves enable row level security;
alter table public.game_reveal_unlocks  enable row level security;
alter table public.match_reveal_unlocks enable row level security;
alter table public.move_reveals       enable row level security;
alter table public.match_move_reveals enable row level security;
alter table public.game_analysis_move_reveals enable row level security;

-- profiles: read/update your own row (insert is handled by the trigger).
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- player_ratings: read your own; no write policy, so the service_role alone moves ratings.
create policy player_ratings_select_own on public.player_ratings
  for select using (auth.uid() = user_id);

-- rating_history: read your own.
create policy rating_history_select_own on public.rating_history
  for select using (auth.uid() = user_id);

-- persona_secrets & puzzle_solutions: intentionally have NO policy. RLS is on and no
-- policy grants access, so only the service_role (the engine) can ever read them.

-- personas: the active catalog is readable by any signed-in user. The secret half (hidden_type +
-- system_prompt) is NOT here — it lives in persona_secrets, which has no client GRANT or policy, so
-- there is no per-column filtering to do on this table.
create policy personas_select_active on public.personas
  for select using (is_active);

-- matchmaking_queue: read your own spot only. Queueing is entirely service-mediated: the
-- backend joins/leaves the queue over the WS with the service_role key and snapshots the
-- pairing keys (ranked_elo/gender/seeking) from the player's *real* rating and profile
-- itself, so there is no client INSERT (or DELETE) path to forge an easy-pairing snapshot.
create policy matchmaking_queue_select_own on public.matchmaking_queue
  for select using (auth.uid() = user_id);

-- match_invites: the creator can see (and poll) their own invite; there is deliberately NO
-- lookup-by-code or insert policy — codes are created and resolved over the WS by the
-- backend (service_role), so a client can never enumerate or forge invites via PostgREST.
create policy match_invites_select_own on public.match_invites
  for select using (auth.uid() = creator);

-- Helper: is the current user a competitor in this match? Checks each per-mode table.
create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.pvp_matches m
    where m.match_id = p_match_id and auth.uid() in (m.player_a, m.player_b)
  ) or exists (
    select 1 from public.ai_matches m
    where m.match_id = p_match_id and m.player = auth.uid()
  ) or exists (
    select 1 from public.ghost_matches m
    where m.match_id = p_match_id and m.player = auth.uid()
  );
$$;

-- Helper: which side ('a' / 'b') is the current user in this match? Side 'a' is always the primary
-- human (the player in ai/ghost matches, player_a in pvp); 'b' is the pvp opponent. Null if not a
-- participant. Used to gate match_moves so a player sees the opponent's line only after it's scored.
create or replace function public.my_match_side(p_match_id uuid)
returns public.match_side
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when exists (
      select 1 from public.pvp_matches m where m.match_id = p_match_id and m.player_b = auth.uid()
    ) then 'b'::public.match_side
    when public.is_match_participant(p_match_id) then 'a'::public.match_side
    else null
  end;
$$;

-- matches and everything under them: visible to their competitors.
create policy matches_select_participant on public.matches
  for select using (public.is_match_participant(id));

-- Per-mode match rows: your own, checked directly against the side columns.
create policy pvp_matches_select on public.pvp_matches
  for select using (auth.uid() in (player_a, player_b));
create policy ai_matches_select on public.ai_matches
  for select using (auth.uid() = player);
create policy ghost_matches_select on public.ghost_matches
  for select using (auth.uid() = player);

-- match_moves: a participant sees their OWN conversation at any time, but the opponent's
-- line only once the match is over. This preserves the "same persona, results become
-- arguable/shareable after the match" model (SPEC §2.2) while stopping a player from
-- reading the opponent's messages + hidden evals mid-match and copying them. (A future
-- premium live-reveal rides the WS — the backend is service_role — so this client-read
-- gate stays intact either way.)
create policy match_moves_select on public.match_moves
  for select using (
    public.is_match_participant(match_id)
    and (
      side = public.my_match_side(match_id)
      or exists (
        select 1 from public.matches m
        where m.id = match_moves.match_id
          and m.status in ('completed', 'abandoned')
      )
    )
  );

-- analysis_jobs: read your own (writes go through the service_role).
create policy analysis_jobs_select_own on public.analysis_jobs
  for select using (auth.uid() = user_id);

-- games: read-only to the owner. There is deliberately NO client INSERT/UPDATE/DELETE — every
-- server-authoritative column (status/accuracy/end_reason/title) is written only by the service_role
-- backend (live solo play over the WS; screenshot/puzzle via the FastAPI service, SPEC §5.1). A
-- client INSERT would let a user forge a "completed" game with a fabricated accuracy/share card, and
-- a DELETE would let them tamper with server-owned history; both go through the backend, matching
-- "the service role is the sole writer of game state".
create policy games_select_own on public.games
  for select using (auth.uid() = user_id);

-- Helper: does the current user own this game? (Used by the per-mode child tables.)
create or replace function public.owns_game(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.user_id = auth.uid()
  );
$$;

-- Per-mode child rows: read-only if you own the parent game. Like `games`, these carry
-- server-authoritative fields the client must not set — solo_games.rating_delta, the Fischer clock,
-- screenshot_games.provisional_rating, puzzle_attempts.solved/eval_delta (the grade). They are
-- written only by the service_role backend, so grading/clock/rating stay server-authoritative
-- (SPEC §3) and can't be forged by a direct PostgREST insert.
create policy solo_games_select on public.solo_games
  for select using (public.owns_game(game_id));

create policy screenshot_games_select on public.screenshot_games
  for select using (public.owns_game(game_id));

create policy puzzle_attempts_select on public.puzzle_attempts
  for select using (public.owns_game(game_id));

-- puzzles: the active catalog is readable by any signed-in user. The answer (best_move) is NOT
-- here — it lives in puzzle_solutions, which has no client GRANT or policy, so only the service_role
-- (the engine) ever reads it.
create policy puzzles_select_active on public.puzzles
  for select using (is_active);

-- moves: readable if you own the parent game.
create policy moves_select_own on public.moves
  for select using (public.owns_game(game_id));

-- engine_responses: intentionally has NO client policy (and no client GRANT below). This is raw
-- engine output kept for tuning — its `raw_response` holds the model's private `reasoning` and the
-- hidden 0-100 `eval_after` the player is meant to *read*, not be handed (SPEC §2.2, §3). Only the
-- service_role reads/writes it, exactly like persona_secrets / puzzle_solutions. The client sees the
-- derived swing/classification over the wire (and eval_delta on `moves`), never this row.

-- game_analyses: readable if you own the parent game or are in the parent match. Writes go
-- through the service_role worker only. Mirrors the engine_responses source-XOR predicate.
create policy game_analyses_select on public.game_analyses
  for select using (
    (game_id is not null and public.owns_game(game_id))
    or
    (match_id is not null and public.is_match_participant(match_id))
  );

-- Helper: may the current user read this analysis? (Owns the source game / is in the match.)
-- Definer-scoped so the per-move policy stays a cheap single lookup.
create or replace function public.can_read_analysis(p_analysis_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.game_analyses a
    where a.id = p_analysis_id
      and (
        (a.game_id is not null and public.owns_game(a.game_id))
        or (a.match_id is not null and public.is_match_participant(a.match_id))
      )
  );
$$;

create policy game_analysis_moves_select on public.game_analysis_moves
  for select using (public.can_read_analysis(analysis_id));

-- Client entrypoint to request a deep review (the after-game "Deep analysis" button). Runs as
-- the definer (so it can touch analysis_jobs + the pgmq schema, both closed to authenticated),
-- but authorizes against auth.uid(): you may only analyze your own, completed game. It mints the
-- game_analyses.id up front and returns it so the client can await exactly that row via realtime;
-- the worker later inserts game_analyses with this id. Idempotent per game via idempotency_key.
create or replace function public.request_game_analysis(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_owner    uuid;
  v_status   text;
  v_key      text := 'game_analysis:' || p_game_id::text;
  v_job_id   uuid;
  v_analysis uuid;
  v_msg_id   bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select user_id, status::text into v_owner, v_status
  from public.games where id = p_game_id;
  if not found or v_owner is distinct from v_user then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if v_status <> 'completed' then
    raise exception 'game % is %, not completed', p_game_id, v_status using errcode = 'P0001';
  end if;

  -- Idempotent: one job per game. Reuse the pre-generated analysis id if already requested.
  select id, analysis_id into v_job_id, v_analysis
  from public.analysis_jobs where idempotency_key = v_key;
  if found then
    return v_analysis;
  end if;

  v_analysis := gen_random_uuid();
  insert into public.analysis_jobs (kind, status, user_id, game_id, idempotency_key, analysis_id)
  values ('game_analysis', 'queued', v_user, p_game_id, v_key, v_analysis)
  returning id into v_job_id;

  select pgmq.send(
    'game_analysis',
    jsonb_build_object('job_id', v_job_id, 'game_id', p_game_id, 'analysis_id', v_analysis)
  ) into v_msg_id;
  update public.analysis_jobs set queue_msg_id = v_msg_id where id = v_job_id;

  return v_analysis;
end;
$$;

revoke execute on function public.request_game_analysis(uuid) from public, anon;
grant execute on function public.request_game_analysis(uuid) to authenticated;

-- Unlocks: you can see what you've unlocked; the service_role mints them on purchase.
create policy game_reveal_unlocks_select_own on public.game_reveal_unlocks
  for select using (auth.uid() = user_id);
create policy match_reveal_unlocks_select_own on public.match_reveal_unlocks
  for select using (auth.uid() = user_id);

-- Helper: may the current user see the best-move reveals for this game / match?
-- (Owns / participates AND holds an unlock row.)
create or replace function public.can_reveal_game(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.owns_game(p_game_id)
     and exists (
       select 1 from public.game_reveal_unlocks u
       where u.user_id = auth.uid() and u.game_id = p_game_id
     );
$$;

create or replace function public.can_reveal_match(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_match_participant(p_match_id)
     and exists (
       select 1 from public.match_reveal_unlocks u
       where u.user_id = auth.uid() and u.match_id = p_match_id
     );
$$;

-- Reveals: returned only with an unlock. No unlock → the row isn't visible at all,
-- so the paid best-move never reaches an unentitled client (RLS-only gate, no CLS).
create policy move_reveals_select on public.move_reveals
  for select using (public.can_reveal_game(game_id));
create policy match_move_reveals_select on public.match_move_reveals
  for select using (public.can_reveal_match(match_id));

-- Helper: may the current user see the best-line reveals for this analysis? Resolves the analysis's
-- source (game/match XOR) and defers to the same per-game / per-match unlock that gates live moves,
-- so one unlock covers both the live best move and the game-review best line.
create or replace function public.can_reveal_analysis(p_analysis_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.game_analyses a
    where a.id = p_analysis_id
      and (
        (a.game_id is not null and public.can_reveal_game(a.game_id))
        or (a.match_id is not null and public.can_reveal_match(a.match_id))
      )
  );
$$;

create policy game_analysis_move_reveals_select on public.game_analysis_move_reveals
  for select using (public.can_reveal_analysis(analysis_id));

-- ===========================================================================
-- GRANTS — table privileges for the Data API role (RLS still gates the rows)
-- ===========================================================================
-- Supabase's default is to NOT auto-expose new tables, so nothing is reachable via
-- the Data API until granted. persona_secrets and puzzle_solutions are deliberately
-- left ungranted *to client roles*: with no privilege there, only the service_role can
-- touch them (service_role bypasses RLS but NOT table privileges, so it is granted full
-- schema access at the end of this section). This is a table privilege, not column-level security —
-- the three fixes stay RLS-only. Grants here decide *which tables*; RLS decides
-- *which rows*; player_ratings gets SELECT but not UPDATE, so its rows are read-only.

grant usage on schema public to authenticated;

-- Supabase's bootstrap (roles.sql default privileges) hands anon/authenticated ALL privileges on
-- every table `postgres` creates in `public` — so each table above lands with TRUNCATE, REFERENCES,
-- and TRIGGER already granted to both client roles, on top of anything we intend. TRUNCATE in
-- particular bypasses RLS (it's a whole-table wipe, not a DELETE), so no client role should hold it.
-- Strip the whole default surface here, then re-grant below exactly the SELECT/INSERT/UPDATE each
-- client role needs. anon ends with no table privileges at all (the app only ever acts as an
-- authenticated user, incl. anonymous sign-ins). Not reachable through the PostgREST Data API today,
-- but this keeps the grant surface honest and least-privilege. Function grants are untouched (the
-- request_game_analysis / pgmq_* EXECUTE grants are set explicitly elsewhere).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Read-only surfaces (RLS scopes them to the caller's own rows / entitlements). engine_responses is
-- NOT here: it's service_role-only raw tuning output (private reasoning + the hidden eval).
grant select on
  public.player_ratings, public.rating_history, public.personas,
  public.matches, public.pvp_matches, public.ai_matches, public.ghost_matches,
  public.match_invites, public.match_moves,
  public.analysis_jobs, public.puzzles, public.moves,
  public.game_analyses, public.game_analysis_moves,
  public.game_reveal_unlocks, public.match_reveal_unlocks,
  public.move_reveals, public.match_move_reveals, public.game_analysis_move_reveals
  to authenticated;

-- Profile is readable + editable (no rating columns live here anymore).
grant select, update on public.profiles to authenticated;

-- Matchmaking queue: read your own spot only; joining/leaving is service-mediated over the
-- WS (see the policy note), so clients get no INSERT/DELETE.
grant select on public.matchmaking_queue to authenticated;

-- Single-player game state is read-only to the client. Every row (games + the per-mode children)
-- is authored by the service_role backend so grading/clock/rating/status stay server-authoritative
-- and can't be forged or deleted via a direct PostgREST call. No client INSERT/UPDATE/DELETE.
grant select on
  public.games,
  public.solo_games, public.screenshot_games, public.puzzle_attempts
  to authenticated;

-- The backend engine authenticates as service_role and is the sole writer of live game
-- state (games/moves/ratings) and the only reader of the RLS-gated secrets. service_role
-- bypasses RLS but still needs table privileges, so grant it the full schema. RLS remains
-- the client-facing boundary; these grants never touch anon/authenticated.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- ===========================================================================
-- REALTIME — clients watch their analysis work land asynchronously
-- ===========================================================================
-- After requesting a deep review the client does NOT block on it: the main screen's notifications
-- bell subscribes to analysis_jobs and raises a notification when a game_analysis job reaches a
-- terminal state (completed → review ready, failed → couldn't finish). analysis_jobs uses REPLICA
-- IDENTITY FULL so realtime can evaluate the owner RLS (analysis_jobs_select_own) against UPDATEs
-- reliably. game_analyses stays published too (owner-read RLS) for awaiting a specific row — used
-- by the loading-screen flow. RLS still decides who receives each change, so a user only ever sees
-- their own work.
alter table public.analysis_jobs replica identity full;
alter publication supabase_realtime add table public.analysis_jobs;
alter publication supabase_realtime add table public.game_analyses;

-- The Play screen also watches games live: the client's LiveGameProvider subscribes to its own
-- games rows so it can block the queue buttons and offer "resume" while a game is active, and clear
-- that state the instant the engine flips status to completed/abandoned. REPLICA IDENTITY FULL lets
-- realtime evaluate the owner RLS (games_select_own) against UPDATEs (status → completed) as well as
-- the INSERT that opens a game.
alter table public.games replica identity full;
alter publication supabase_realtime add table public.games;

-- ===========================================================================
-- STORAGE — profile pictures
-- ===========================================================================
-- One public bucket for avatars. Objects live under a per-user prefix ('{uid}/avatar-<ts>.webp',
-- recorded on profiles.avatar_path); reads ride the public-bucket flag (anyone with the URL — the
-- path embeds the uid, accepted trade-off pre-launch), while writes are RLS-scoped to the caller's
-- own folder. Only `create policy` here: `alter table storage.objects` fails on hosted Supabase
-- (the table is owned by the platform), policies are the supported extension point.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
