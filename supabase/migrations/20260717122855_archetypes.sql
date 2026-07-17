-- ===========================================================================
-- ARCHETYPE CLASSIFICATION (SPEC §9.1) — the shareable-card identity.
--
-- After a game/match finishes, a cheap "lower-tier" model assigns one of 20 fixed identities
-- (16 core grid + 4 legendary), a one-line flavor sentence, and picks the most meme-worthy
-- moment (≤4 messages). Classification is HYBRID: the backend derives the accuracy tier +
-- legendary triggers deterministically; the model only picks the play-style, writes the flavor,
-- and selects the meme window. The result is persisted so re-opening the card is free + stable.
--
-- Runs async through its OWN pgmq queue (game_archetype) + a jobs table, mirroring the deep
-- post-game analysis pipeline (game_analysis / analysis_jobs / game_analyses). The queue gives
-- backpressure so a user bouncing in and out can't spam synchronous LLM calls. Written only by
-- the archetype worker (service_role); the client awaits its row over realtime.
-- ===========================================================================

-- The 20 fixed identities — a STABLE slug key (not the display title, which lives in code and
-- mirrors MoveClassKey). 16 core grid cells + 4 legendaries.
create type public.archetype as enum (
  -- Bold row (low → high accuracy)
  'all_gas_no_brakes', 'loose_cannon', 'the_gambler', 'the_closer',
  -- Smooth row
  'certified_cornball', 'the_overthinker', 'the_diplomat', 'smooth_operator',
  -- Dry row
  'ghosted_loading', 'one_word_wonder', 'the_minimalist', 'the_enigma',
  -- Chaotic row
  'the_trainwreck', 'feral_texter', 'certified_menace', 'chaos_charmer',
  -- Legendaries (rare, override the grid)
  'scholars_mate', 'the_comeback', 'the_brilliancy', 'the_massacre'
);

-- The two classification axes (SPEC §9.1). Stored for analytics / distribution monitoring.
create type public.archetype_tier  as enum ('low', 'shaky', 'solid', 'high');
create type public.archetype_style as enum ('bold', 'smooth', 'dry', 'chaotic');

-- Durable pull queue for archetype jobs — separate from game_analysis so the fast, user-facing
-- archetype pass is never stuck behind a slow deep review (its own worker drains it). The
-- public.pgmq_* security-definer wrappers + their service_role grants already exist (initial
-- migration); this only creates the queue.
select pgmq.create('game_archetype');

-- Application-level view of archetype work: observability, retries, idempotency. Mirrors
-- analysis_jobs but is a dedicated table (keeps the shared job_kind enum + the deep-analysis
-- notifications bell untouched). Reuses the job_status enum.
create table public.archetype_jobs (
  id              uuid primary key default gen_random_uuid(),
  status          public.job_status not null default 'queued',
  user_id         uuid references public.profiles (id) on delete set null,
  -- The source: a game, or one side of a PvP match. Exactly one source per row.
  game_id         uuid references public.games (id) on delete cascade,
  match_id        uuid references public.matches (id) on delete cascade,
  side            public.match_side, -- set for match sources, null for games
  queue_msg_id    bigint,            -- pgmq message id, when enqueued on game_archetype
  idempotency_key text unique,       -- 'archetype:<game_id>' / 'archetype:match:<match_id>:<side>'
  -- Pre-generated game_archetypes.id: minted up front so the client can await exactly that row
  -- over realtime; the worker inserts game_archetypes with this id.
  archetype_id    uuid,
  attempts        smallint not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  constraint archetype_job_source check ((game_id is not null) <> (match_id is not null)),
  constraint archetype_job_side_scope check (side is null or match_id is not null)
);

create index archetype_jobs_status_idx on public.archetype_jobs (status, created_at);
create index archetype_jobs_user_idx   on public.archetype_jobs (user_id);

create trigger archetype_jobs_set_updated_at
  before update on public.archetype_jobs
  for each row execute function public.set_updated_at();

-- The archetype result. SOURCE-INDEPENDENT like game_analyses (nullable game_id / match_id XOR,
-- side says whose conversation was classified). Written only by the archetype worker. The
-- archetype key + is_legendary drive the card title; the tier/style are the derived axes; the
-- flavor is the model's one-liner; meme_positions are the ≤4 source positions to render as the
-- shareable excerpt.
create table public.game_archetypes (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references public.archetype_jobs (id) on delete set null,
  game_id        uuid references public.games (id) on delete cascade,
  match_id       uuid references public.matches (id) on delete cascade,
  side           public.match_side, -- set for match sources, null for games
  archetype      public.archetype not null,
  is_legendary   boolean not null default false,
  tier           public.archetype_tier not null,
  style          public.archetype_style not null,
  flavor_reason  text not null,
  meme_positions integer[] not null default '{}', -- ≤4 source-move positions for the excerpt
  model          text not null,
  prompt_version text not null,
  raw_response   jsonb not null,     -- full verdict kept for tuning (prompts/models change)
  latency_ms     integer,
  created_at     timestamptz not null default now(),
  -- One archetype per source: it's fixed + cheap, re-derived idempotently, not iterated like a
  -- deep review. Exactly one source per row.
  constraint game_archetype_source check ((game_id is not null) <> (match_id is not null)),
  constraint game_archetype_side_scope check (side is null or match_id is not null),
  constraint game_archetype_game_unique unique (game_id),
  constraint game_archetype_match_side_unique unique (match_id, side)
);

create index game_archetypes_game_idx  on public.game_archetypes (game_id);
create index game_archetypes_match_idx on public.game_archetypes (match_id, side);

-- ---------------------------------------------------------------------------
-- RLS: owner/participant read; writes go through the service_role worker only.
-- ---------------------------------------------------------------------------
alter table public.archetype_jobs   enable row level security;
alter table public.game_archetypes  enable row level security;

-- archetype_jobs: read your own (the loader watches for a terminal 'failed' as a safety net).
create policy archetype_jobs_select_own on public.archetype_jobs
  for select using (auth.uid() = user_id);

-- game_archetypes: readable if you own the parent game or are in the parent match. Mirrors the
-- game_analyses source-XOR predicate (reuses owns_game / is_match_participant).
create policy game_archetypes_select on public.game_archetypes
  for select using (
    (game_id is not null and public.owns_game(game_id))
    or
    (match_id is not null and public.is_match_participant(match_id))
  );

-- ---------------------------------------------------------------------------
-- Grants. A new migration's tables are NOT covered by the initial blanket grant, so grant
-- explicitly: SELECT to authenticated (RLS gates the rows), ALL to service_role (the worker).
-- ---------------------------------------------------------------------------
grant select on public.archetype_jobs, public.game_archetypes to authenticated;
grant all privileges on public.archetype_jobs, public.game_archetypes to service_role;

-- ---------------------------------------------------------------------------
-- Realtime. The client awaits the game_archetypes INSERT to swap the loader for the card
-- (default replica identity is fine for INSERT). archetype_jobs uses REPLICA IDENTITY FULL so
-- owner RLS resolves on the terminal 'failed' UPDATE the loader watches as a safety net.
-- ---------------------------------------------------------------------------
alter table public.archetype_jobs replica identity full;
alter publication supabase_realtime add table public.archetype_jobs;
alter publication supabase_realtime add table public.game_archetypes;
