-- ===========================================================================
-- BACKFILL: queue every pre-existing finished game / PvP match for archetype classification.
--
-- The archetype pass (20260717122855_archetypes.sql) only fires for games that finish *after* it
-- shipped. This one-time backfill enqueues the historical ones so their shareable cards exist too.
-- Idempotent per source (skips anything already enqueued or already classified), so re-running on
-- a `supabase db reset` is harmless. Mirrors the enqueue logic in app/archetype/service.py.
-- ===========================================================================

do $$
declare
  rec       record;
  v_job     uuid;
  v_art     uuid;
  v_msg     bigint;
  v_key     text;
begin
  -- Solo games (mode = 'solo'): the only single-player source with a You/Match conversation in
  -- `moves`. Screenshot/puzzle modes are deliberately excluded.
  for rec in
    select g.id, g.user_id
    from public.games g
    where g.status = 'completed' and g.mode = 'solo'
  loop
    v_key := 'archetype:' || rec.id::text;
    if exists (select 1 from public.archetype_jobs where idempotency_key = v_key)
       or exists (select 1 from public.game_archetypes where game_id = rec.id) then
      continue;
    end if;
    v_art := gen_random_uuid();
    insert into public.archetype_jobs (status, game_id, user_id, idempotency_key, archetype_id)
      values ('queued', rec.id, rec.user_id, v_key, v_art)
      returning id into v_job;
    select pgmq.send(
      'game_archetype',
      jsonb_build_object('job_id', v_job, 'game_id', rec.id, 'archetype_id', v_art)
    ) into v_msg;
    update public.archetype_jobs set queue_msg_id = v_msg where id = v_job;
  end loop;

  -- PvP matches: one job per side (each player awaits their own board), using that side's player.
  for rec in
    select mt.id as match_id, pv.player_a, pv.player_b
    from public.matches mt
    join public.pvp_matches pv on pv.match_id = mt.id
    where mt.status = 'completed'
  loop
    -- side a
    v_key := 'archetype:match:' || rec.match_id::text || ':a';
    if not (exists (select 1 from public.archetype_jobs where idempotency_key = v_key)
            or exists (select 1 from public.game_archetypes
                       where match_id = rec.match_id and side = 'a')) then
      v_art := gen_random_uuid();
      insert into public.archetype_jobs (status, match_id, side, user_id, idempotency_key, archetype_id)
        values ('queued', rec.match_id, 'a', rec.player_a, v_key, v_art)
        returning id into v_job;
      select pgmq.send(
        'game_archetype',
        jsonb_build_object('job_id', v_job, 'match_id', rec.match_id, 'side', 'a', 'archetype_id', v_art)
      ) into v_msg;
      update public.archetype_jobs set queue_msg_id = v_msg where id = v_job;
    end if;

    -- side b
    v_key := 'archetype:match:' || rec.match_id::text || ':b';
    if not (exists (select 1 from public.archetype_jobs where idempotency_key = v_key)
            or exists (select 1 from public.game_archetypes
                       where match_id = rec.match_id and side = 'b')) then
      v_art := gen_random_uuid();
      insert into public.archetype_jobs (status, match_id, side, user_id, idempotency_key, archetype_id)
        values ('queued', rec.match_id, 'b', rec.player_b, v_key, v_art)
        returning id into v_job;
      select pgmq.send(
        'game_archetype',
        jsonb_build_object('job_id', v_job, 'match_id', rec.match_id, 'side', 'b', 'archetype_id', v_art)
      ) into v_msg;
      update public.archetype_jobs set queue_msg_id = v_msg where id = v_job;
    end if;
  end loop;
end $$;
