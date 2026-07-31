-- Pilot bridge only. Requires 20260816145000_add_legacy_bridge_architecture.sql.
begin;

do $$
declare
  v_id uuid := '8a3b9fdc-b153-4975-9b90-a2217bcd0f7f';
  v_metadata_count integer;
  v_slug_conflicts integer;
  v_identity_conflicts integer;
  v_semantic_count integer;
begin
  select count(*) into v_metadata_count
  from public.exercise_movement_metadata
  where exercise_id = 'bicipiti-curl-bilanciere';
  if v_metadata_count <> 1 then
    raise exception 'CANONICALIZATION_METADATA_INVALID: expected one legacy metadata row, found %', v_metadata_count;
  end if;

  select count(*) into v_slug_conflicts
  from public.exercises
  where slug = 'bicipiti-curl-bilanciere'
    and id <> v_id;
  if v_slug_conflicts > 0 then
    raise exception 'CANONICALIZATION_SLUG_COLLISION: slug belongs to another UUID';
  end if;

  select count(*) into v_identity_conflicts
  from public.exercise_identity_keys
  where key in ('legacy:bicipiti-curl-bilanciere', 'bicipiti-curl-bilanciere')
    and exercise_id <> v_id;
  if v_identity_conflicts > 0 then
    raise exception 'CANONICALIZATION_IDENTITY_COLLISION: legacy key belongs to another UUID';
  end if;

  select count(*) into v_semantic_count
  from public.exercises
  where id <> v_id
    and (
      lower(trim(name)) in ('curl con bilanciere', 'barbell curl', 'barbell curls')
      or lower(trim(coalesce(name_en, ''))) in ('barbell curl', 'barbell curls')
    );
  if v_semantic_count > 0 then
    raise exception 'CANONICALIZATION_SEMANTIC_DUPLICATE: equivalent exercise already exists';
  end if;

  if not exists (select 1 from public.exercises where id = v_id) then
    insert into public.exercises (
      id, record_kind, name, description, technical_notes, muscle_group, equipment, difficulty,
      exercise_type, source, slug, name_en, primary_muscle_group,
      secondary_muscle_groups, active, visibility, aliases, review_status,
      primary_muscles, secondary_muscles, library_status, auto_program_eligible,
      translation_status, movement_pattern, body_position, provider_available,
      source_metadata
    ) values (
      v_id, 'legacy_bridge', 'Curl con bilanciere', null, null, 'bicipiti', 'barbell', 'beginner',
      'strength', 'legacy', 'bicipiti-curl-bilanciere', 'Barbell Curl', 'bicipiti',
      '{}', true, 'global', array['legacy:bicipiti-curl-bilanciere', 'bicipiti-curl-bilanciere'],
      'submitted', array['biceps'], '{}', 'hidden', false,
      'verified', 'isolation_arms', 'standing', false,
      jsonb_build_object('source', 'legacy_canonical_bridge', 'legacy_key', 'bicipiti-curl-bilanciere')
    );
  elsif not exists (
    select 1 from public.exercises
    where id = v_id
      and record_kind = 'legacy_bridge'
      and source = 'legacy'
      and name = 'Curl con bilanciere'
      and slug = 'bicipiti-curl-bilanciere'
      and active = true
      and library_status = 'hidden'
      and auto_program_eligible = false
  ) then
    raise exception 'CANONICALIZATION_UUID_COLLISION: fixed UUID contains different data';
  end if;

  if not exists (select 1 from public.exercise_identity_keys where key = 'legacy:bicipiti-curl-bilanciere') then
    insert into public.exercise_identity_keys (key, exercise_id, key_type, provider, is_primary)
    values ('legacy:bicipiti-curl-bilanciere', v_id, 'legacy', 'legacy', true);
  elsif not exists (
    select 1 from public.exercise_identity_keys
    where key = 'legacy:bicipiti-curl-bilanciere' and exercise_id = v_id
  ) then
    raise exception 'CANONICALIZATION_IDENTITY_COLLISION: full legacy key mismatch';
  end if;

  if not exists (select 1 from public.exercise_identity_keys where key = 'bicipiti-curl-bilanciere') then
    insert into public.exercise_identity_keys (key, exercise_id, key_type, provider, is_primary)
    values ('bicipiti-curl-bilanciere', v_id, 'legacy', 'legacy', false);
  elsif not exists (
    select 1 from public.exercise_identity_keys
    where key = 'bicipiti-curl-bilanciere' and exercise_id = v_id
  ) then
    raise exception 'CANONICALIZATION_IDENTITY_COLLISION: bare legacy key mismatch';
  end if;
end $$;

commit;
