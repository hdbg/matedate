-- MateDate — initial schema
--
-- Covers the four launch domains plus the engine's output surface:
--   1. Auth        — profiles mirrored off auth.users, 18+ gate, referral code.
--   2. Ratings     — player_ratings (read-only to the owner via RLS) + a change log.
--   3. Matchmaking — personas, queue, per-mode match tables (pvp / ai / ghost), rounds, moves.
--   4. Analysis    — a durable pgmq queue for PvP scoring + a jobs table for lifecycle/observability.
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
create extension if not exists pgmq;     -- durable pull queue for PvP scoring jobs

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

-- Move classification. Spelling matches the engine's MoveKind serde output.
create type public.move_kind as enum (
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Miss',
  'Mistake',
  'Blunder',
  'SuperRisky',
  'Risky',
  'Book'
);

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
create type public.rating_kind as enum ('rizz', 'ranked', 'casual');

-- Onboarding quiz answers (SPEC §8, funnel). dating_goal is single-select;
-- texting_style is multi-select and stored as an array of these values.
create type public.dating_goal as enum ('serious', 'casual', 'confidence', 'practice');
create type public.texting_style as enum ('drywit', 'playful', 'dark', 'earnest');

-- A ranked match's lifecycle.
create type public.match_status as enum ('queued', 'active', 'scoring', 'completed', 'abandoned');

-- Which versus format a match is. Each has its own table (no shared discriminator rows):
-- pvp = human vs human, ai = human vs disclosed AI, ghost = human vs a recorded replay.
-- Only pvp and ghost affect ranked ELO; ai affects the casual rating (SPEC §2.4).
create type public.match_mode as enum ('pvp', 'ai', 'ghost');

-- The two sides of a match. Side 'a' is always the primary human whose match this is;
-- 'b' is the opponent (a second human, the AI, or the replayed ghost).
create type public.match_side as enum ('a', 'b');

-- Move time limit for a ranked match (flaking prevention, SPEC §2.6). Bullet/rapid/
-- classical map to 20/40/60 seconds per move; letting the clock hit zero forfeits.
create type public.time_control as enum ('bullet', 'rapid', 'classical');

-- How a match ended. 'scored' = played to completion; 'timeout' = a player flagged;
-- 'blocked' = the persona blocked/unmatched the player, ending the game early.
create type public.match_end_reason as enum ('scored', 'timeout', 'resignation', 'abandoned', 'blocked');

-- Lifecycle of a queued analysis / scoring job.
create type public.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- What an analysis job scores. 'game_analysis' is the source-independent post-game deep
-- review (chess.com "game review" style); 'screenshot'/'pvp_round' are the earlier lifecycle
-- kinds. All three flow through analysis_jobs + a pgmq queue.
create type public.job_kind as enum ('screenshot', 'pvp_round', 'game_analysis');

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
  username          text unique,
  display_name      text,

  -- 18+ gate (SPEC §8.3). We store the attested date of birth and when the gate
  -- was cleared; we deliberately do not collect data that would trigger COPPA.
  date_of_birth     date,
  age_verified_at   timestamptz,

  -- Onboarding quiz answers (SPEC §8). Tune AI dates / puzzles to the player.
  -- dating_goal is single-select; texting_style is multi-select (default empty).
  dating_goal       public.dating_goal,
  texting_style     public.texting_style[] not null default '{}',

  -- Ratings live in player_ratings (its own table) so RLS alone can make them
  -- read-only to the owner while the rest of the profile stays user-editable —
  -- a client can never PATCH its own ELO.

  -- Growth loop (SPEC §7.4).
  referral_code     text unique default encode(gen_random_bytes(6), 'hex'),
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
  rizz_rating   integer not null default 1000, -- PvE / screenshot ladder
  ranked_elo    integer not null default 1000, -- PvH global ladder
  casual_rating integer not null default 1000, -- disclosed-AI practice ladder
  ranked_tier   text,                          -- computed app-side from ranked_elo
  ranked_wins   integer not null default 0,
  ranked_losses integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint rizz_rating_nonneg   check (rizz_rating   >= 0),
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
-- 3. MATCHMAKING — personas, queue, matches, rounds, moves
-- ===========================================================================

-- Reusable AI dates. Used by solo, practice, and ranked (both players get the same one).
create table public.personas (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  difficulty    smallint not null default 1,
  is_boss       boolean not null default false,
  is_active     boolean not null default true,
  description   text,
  opening_line  text not null, -- shown to both players; not a secret
  created_at    timestamptz not null default now()
);

create index personas_active_idx on public.personas (is_active) where is_active;

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
  time_control    public.time_control not null default 'rapid', -- players pair within a pool
  status          public.job_status not null default 'queued',
  enqueued_at     timestamptz not null default now(),
  matched_at      timestamptz,
  match_id        uuid,             -- set once paired (FK added after matches table)
  unique (user_id) -- a player sits in the queue at most once
);

-- Pair players within the same time-control pool, closest ELO / longest wait first.
create index matchmaking_queue_open_idx
  on public.matchmaking_queue (time_control, ranked_elo, enqueued_at)
  where status = 'queued';

-- Shared parent for every versus match. Every column here is always present regardless
-- of mode; the mode-specific sides and result columns live in the per-mode child tables
-- below, so no table ever carries half-filled, discriminator-dependent columns. Both
-- competitors play the same persona / scenario / opening line.
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  mode          public.match_mode not null, -- which child table holds the two sides
  persona_id    uuid not null references public.personas (id),
  status        public.match_status not null default 'queued',
  best_of       smallint not null default 3,
  -- Time control (flaking prevention, SPEC §2.6). move_seconds is the per-move budget,
  -- snapshotted here and kept consistent with time_control by the check below.
  time_control  public.time_control not null default 'rapid',
  move_seconds  smallint not null default 40,
  opening_line  text not null, -- snapshotted from the persona so it stays stable
  winner_side   public.match_side, -- null until the match is decided
  end_reason    public.match_end_reason, -- null until the match ends
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint best_of_positive check (best_of > 0),
  constraint move_seconds_matches_control check (
    (time_control = 'bullet'    and move_seconds = 20) or
    (time_control = 'rapid'     and move_seconds = 40) or
    (time_control = 'classical' and move_seconds = 60)
  )
);

create index matches_status_idx  on public.matches (status);
create index matches_persona_idx on public.matches (persona_id);

alter table public.matchmaking_queue
  add constraint matchmaking_queue_match_fk
  foreign key (match_id) references public.matches (id) on delete set null;

-- Human vs human (SPEC §2.2). Both sides are real accounts; both stake ranked ELO.
create table public.pvp_matches (
  match_id            uuid primary key references public.matches (id) on delete cascade,
  player_a            uuid not null references public.profiles (id) on delete cascade,
  player_b            uuid not null references public.profiles (id) on delete cascade,
  player_a_elo_before integer,
  player_a_elo_after  integer,
  player_b_elo_before integer,
  player_b_elo_after  integer,
  constraint pvp_distinct_players check (player_a <> player_b)
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

-- A round within a match (best-of-N exchanges).
create table public.match_rounds (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  round_number  smallint not null,
  prompt        text,   -- the persona's line that opens this round
  status        public.match_status not null default 'active',
  winner_side   public.match_side, -- which side took the round; null until scored
  created_at    timestamptz not null default now(),
  scored_at     timestamptz,
  unique (match_id, round_number)
);

create index match_rounds_match_idx on public.match_rounds (match_id);

-- A competitor's message within a round, plus the engine's verdict on it. `side`
-- identifies which competitor (a or b) — resolved to an identity via the per-mode child
-- table (pvp_matches/ai_matches/ghost_matches). Exactly one move per side per round.
create table public.match_moves (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.match_rounds (id) on delete cascade,
  side           public.match_side not null,
  content        text, -- null while the turn is pending; filled once submitted/replayed

  -- Move clock (flaking prevention, SPEC §2.6). The turn opens with deadline =
  -- now() + matches.move_seconds; responded_at is set on submit. If the deadline
  -- passes with responded_at still null, timed_out is set and the player forfeits.
  deadline       timestamptz,
  responded_at   timestamptz,
  timed_out      boolean not null default false,

  -- Engine response (written by the scoring service).
  classification public.move_kind,
  eval_before    numeric(5,2), -- hidden 0..100 interest state before this move
  eval_after     numeric(5,2),
  eval_delta     numeric(6,2),
  -- best_move lives in match_move_reveals (RLS-gated by an unlock; see section 6).

  created_at     timestamptz not null default now(),
  scored_at      timestamptz,
  unique (round_id, side)
);

create index match_moves_round_idx on public.match_moves (round_id);

-- ===========================================================================
-- 4. ANALYSIS QUEUE — durable pgmq queue + a jobs tracking table
-- ===========================================================================

-- Durable pull queues (visibility timeouts, acks, retries). Python workers call
-- pgmq.read / pgmq.archive via the security-definer wrappers below; they never subscribe to
-- Realtime for intake (SPEC §5.2). Screenshot review stays synchronous and does NOT use these.
--   pvp_scoring   — PvP round scoring.
--   game_analysis — post-game deep analysis (solo now; PvP/screenshot sources later).
select pgmq.create('pvp_scoring');
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
  -- The thing being scored: a round (pvp) or a game (screenshot lifecycle tracking).
  round_id        uuid references public.match_rounds (id) on delete cascade,
  game_id         uuid,  -- FK added after games table
  queue_msg_id    bigint, -- pgmq message id, when enqueued on pvp_scoring
  idempotency_key text unique,
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
  end_reason  public.match_end_reason, -- 'scored' | 'timeout' | 'resignation' | 'abandoned'; null until ended
  ended_at    timestamptz,
  -- Shareable card (SPEC §9). Rendered to PNG at a stable URL from this slug.
  share_slug  text unique default encode(gen_random_bytes(8), 'hex'),
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
-- here; it affects the casual rating instead of rizz and never touches ranked ELO.
create table public.solo_games (
  game_id      uuid primary key references public.games (id) on delete cascade,
  persona_id   uuid references public.personas (id) on delete set null,
  is_practice  boolean not null default false, -- disclosed-AI practice opponent (SPEC §2.3)
  rating_delta integer not null default 0,     -- rizz, or casual when is_practice
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
  prompt          text not null, -- the position: the line the player must respond to
  difficulty      smallint not null default 1,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index puzzles_active_idx on public.puzzles (is_active) where is_active;

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

  -- Engine response.
  classification public.move_kind not null default 'Book',
  eval_before    numeric(5,2),
  eval_after     numeric(5,2),
  eval_delta     numeric(6,2),
  -- best_move lives in move_reveals (RLS-gated by an unlock; see section 6).

  created_at     timestamptz not null default now(),
  unique (game_id, position)
);

create index moves_game_idx on public.moves (game_id);

-- Raw engine output kept for tuning (thresholds/prompts change constantly, SPEC §3).
-- Attaches to whichever unit produced it — a single-player game or a PvP round.
create table public.engine_responses (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid references public.games (id) on delete cascade,
  round_id       uuid references public.match_rounds (id) on delete cascade,
  model          text not null,
  prompt_version text,
  raw_response   jsonb not null,
  latency_ms     integer,
  created_at     timestamptz not null default now(),
  constraint engine_response_target check (
    (game_id is not null) <> (round_id is not null)
  )
);

create index engine_responses_game_idx  on public.engine_responses (game_id);
create index engine_responses_round_idx on public.engine_responses (round_id);

-- Post-game deep analysis (chess.com "game review" style). SOURCE-INDEPENDENT: one result
-- shape whatever the source — a solo game, a screenshot upload, or (later) a PvP round — so
-- there is no per-mode analysis table. Written only by the analysis worker (service_role);
-- the stronger model RE-classifies every move itself rather than trusting the live grades.
-- The source ref is a nullable game_id / round_id XOR, mirroring engine_responses/analysis_jobs.
create table public.game_analyses (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references public.analysis_jobs (id) on delete set null,
  game_id        uuid references public.games (id) on delete cascade,
  round_id       uuid references public.match_rounds (id) on delete cascade,
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
  constraint game_analysis_source check ((game_id is not null) <> (round_id is not null))
);

create index game_analyses_game_idx  on public.game_analyses (game_id, created_at desc);
create index game_analyses_round_idx on public.game_analyses (round_id);

-- The re-classified per-USER-move verdicts ("You" side only): the comment and, unless the
-- move is top-graded, a "best line" (a better message the user could have sent). content is
-- snapshotted so a row is displayable without joining the source-specific move table
-- (moves for game sources, match_moves for future PvP), which is why move_id stays nullable.
create table public.game_analysis_moves (
  id             uuid primary key default gen_random_uuid(),
  analysis_id    uuid not null references public.game_analyses (id) on delete cascade,
  position       integer not null,             -- matches the source move's position ordering
  side           public.message_side not null default 'You',
  move_id        uuid references public.moves (id) on delete set null,
  content        text not null,
  classification public.move_kind not null,    -- re-graded here; independent of moves.classification
  comment        text not null,
  best_line      text,                          -- a better message; null when the move is top-graded
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
alter table public.match_rounds      enable row level security;
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

-- personas: the active catalog is readable by any signed-in user. The hidden_type
-- and system_prompt columns must be filtered by the API layer for in-progress play.
create policy personas_select_active on public.personas
  for select using (is_active);

-- matchmaking_queue: manage your own spot in line.
create policy matchmaking_queue_select_own on public.matchmaking_queue
  for select using (auth.uid() = user_id);
create policy matchmaking_queue_insert_own on public.matchmaking_queue
  for insert with check (auth.uid() = user_id);
create policy matchmaking_queue_delete_own on public.matchmaking_queue
  for delete using (auth.uid() = user_id);

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

create policy match_rounds_select on public.match_rounds
  for select using (public.is_match_participant(match_id));

create policy match_moves_select on public.match_moves
  for select using (
    exists (
      select 1 from public.match_rounds mr
      where mr.id = match_moves.round_id
        and public.is_match_participant(mr.match_id)
    )
  );

-- analysis_jobs: read your own (writes go through the service_role).
create policy analysis_jobs_select_own on public.analysis_jobs
  for select using (auth.uid() = user_id);

-- games: full ownership of your own analyses (parent row).
create policy games_select_own on public.games
  for select using (auth.uid() = user_id);
create policy games_insert_own on public.games
  for insert with check (auth.uid() = user_id);
create policy games_delete_own on public.games
  for delete using (auth.uid() = user_id);

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

-- Per-mode child rows: readable/insertable if you own the parent game.
-- (Deletes cascade from the parent, whose delete policy already guards ownership.)
create policy solo_games_select on public.solo_games
  for select using (public.owns_game(game_id));
create policy solo_games_insert on public.solo_games
  for insert with check (public.owns_game(game_id));

create policy screenshot_games_select on public.screenshot_games
  for select using (public.owns_game(game_id));
create policy screenshot_games_insert on public.screenshot_games
  for insert with check (public.owns_game(game_id));

create policy puzzle_attempts_select on public.puzzle_attempts
  for select using (public.owns_game(game_id));
create policy puzzle_attempts_insert on public.puzzle_attempts
  for insert with check (public.owns_game(game_id));

-- puzzles: the active catalog is readable by any signed-in user. best_move must be
-- filtered by the API layer until a puzzle is solved / unlocked.
create policy puzzles_select_active on public.puzzles
  for select using (is_active);

-- moves: readable if you own the parent game.
create policy moves_select_own on public.moves
  for select using (public.owns_game(game_id));

-- engine_responses: readable if you own the parent game or are in the parent match.
create policy engine_responses_select on public.engine_responses
  for select using (
    (game_id is not null and exists (
      select 1 from public.games g where g.id = engine_responses.game_id and g.user_id = auth.uid()
    ))
    or
    (round_id is not null and exists (
      select 1 from public.match_rounds mr
      where mr.id = engine_responses.round_id and public.is_match_participant(mr.match_id)
    ))
  );

-- game_analyses: readable if you own the parent game or are in the parent match. Writes go
-- through the service_role worker only. Mirrors the engine_responses source-XOR predicate.
create policy game_analyses_select on public.game_analyses
  for select using (
    (game_id is not null and public.owns_game(game_id))
    or
    (round_id is not null and exists (
      select 1 from public.match_rounds mr
      where mr.id = game_analyses.round_id and public.is_match_participant(mr.match_id)
    ))
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
        or (a.round_id is not null and exists (
          select 1 from public.match_rounds mr
          where mr.id = a.round_id and public.is_match_participant(mr.match_id)
        ))
      )
  );
$$;

create policy game_analysis_moves_select on public.game_analysis_moves
  for select using (public.can_read_analysis(analysis_id));

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

-- Read-only surfaces (RLS scopes them to the caller's own rows / entitlements).
grant select on
  public.player_ratings, public.rating_history, public.personas,
  public.matches, public.pvp_matches, public.ai_matches, public.ghost_matches,
  public.match_rounds, public.match_moves,
  public.analysis_jobs, public.puzzles, public.moves, public.engine_responses,
  public.game_analyses, public.game_analysis_moves,
  public.game_reveal_unlocks, public.match_reveal_unlocks,
  public.move_reveals, public.match_move_reveals
  to authenticated;

-- Profile is readable + editable (no rating columns live here anymore).
grant select, update on public.profiles to authenticated;

-- Matchmaking queue: join / leave.
grant select, insert, delete on public.matchmaking_queue to authenticated;

-- Single-player analyses the client may author.
grant select, insert, delete on public.games to authenticated;
grant select, insert on
  public.solo_games, public.screenshot_games, public.puzzle_attempts
  to authenticated;

-- The backend engine authenticates as service_role and is the sole writer of live game
-- state (games/moves/ratings) and the only reader of the RLS-gated secrets. service_role
-- bypasses RLS but still needs table privileges, so grant it the full schema. RLS remains
-- the client-facing boundary; these grants never touch anon/authenticated.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
