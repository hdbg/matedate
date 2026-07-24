-- ===========================================================================
-- Seed the profile row from signup metadata.
--
-- With email confirmation enabled, `signUp` returns NO client session until the
-- user clicks the confirmation link — so the onboarding client can't PATCH its
-- own profile inline anymore. Instead the client passes the quiz answers as
-- `signUp({ options: { data: … } })` (→ auth.users.raw_user_meta_data), and this
-- trigger writes them onto the profile row the instant the auth user is created,
-- before confirmation and independent of any session (cross-device safe).
--
-- Anonymous "Skip" signups pass no metadata, so every field below resolves to
-- null / '{}' exactly as before.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, display_name, gender, seeking, dating_goal, texting_style,
    date_of_birth, age_verified_at
  )
  values (
    new.id,
    meta ->> 'display_name',
    nullif(meta ->> 'gender', '')::public.gender,
    nullif(meta ->> 'seeking', '')::public.gender,
    nullif(meta ->> 'dating_goal', '')::public.dating_goal,
    coalesce(
      (
        select array_agg(value::public.texting_style)
        from jsonb_array_elements_text(meta -> 'texting_style')
      ),
      '{}'
    ),
    nullif(meta ->> 'date_of_birth', '')::date,
    nullif(meta ->> 'age_verified_at', '')::timestamptz
  )
  on conflict (id) do nothing;

  insert into public.player_ratings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
