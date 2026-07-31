-- Import controllato YMove: applica solo LINK_EXISTING validati e CREATE_NEW
-- safe_create. Non importa review/duplicati, non modifica schede, template o
-- storico, non salva URL video temporanei.

alter table public.exercises
  add column if not exists library_status text not null default 'active',
  add column if not exists auto_program_eligible boolean not null default false,
  add column if not exists translation_status text not null default 'verified',
  add column if not exists movement_pattern text,
  add column if not exists body_position text,
  add column if not exists provider_available boolean not null default true,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exercises_library_status_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_library_status_check
      check (library_status in ('active', 'pending_review', 'hidden', 'deprecated'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exercises_translation_status_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_translation_status_check
      check (translation_status in ('verified', 'generated', 'review_required'));
  end if;
end $$;

create table if not exists public.exercise_external_links (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references public.exercises(id) on delete restrict,
  exercise_key text,
  provider text not null,
  external_exercise_id text not null,
  match_status text not null,
  is_primary boolean not null default true,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_external_links_provider_check check (provider in ('ymove')),
  constraint exercise_external_links_status_check check (match_status in ('manual_approved', 'rejected', 'removed')),
  constraint exercise_external_links_target_check check (exercise_id is not null or nullif(trim(exercise_key), '') is not null),
  constraint exercise_external_links_external_not_empty check (length(trim(external_exercise_id)) > 0)
);

create unique index if not exists exercise_external_links_ymove_external_primary_unique
  on public.exercise_external_links(provider, external_exercise_id)
  where is_primary and match_status = 'manual_approved';

create unique index if not exists exercise_external_links_ymove_exercise_id_primary_unique
  on public.exercise_external_links(provider, exercise_id)
  where is_primary and match_status = 'manual_approved' and exercise_id is not null;

create unique index if not exists exercise_external_links_ymove_exercise_key_primary_unique
  on public.exercise_external_links(provider, exercise_key)
  where is_primary and match_status = 'manual_approved' and exercise_key is not null;

alter table public.exercise_external_links enable row level security;

drop policy if exists exercise_external_links_superadmin_read on public.exercise_external_links;
create policy exercise_external_links_superadmin_read on public.exercise_external_links
  for select using (public.is_superadmin());

drop policy if exists exercise_external_links_authenticated_read_approved on public.exercise_external_links;
create policy exercise_external_links_authenticated_read_approved on public.exercise_external_links
  for select to authenticated
  using (provider = 'ymove' and match_status = 'manual_approved' and is_primary);

revoke all on public.exercise_external_links from public, anon;
grant select on public.exercise_external_links to authenticated;

create or replace function public._ymove_normalize_import_muscle(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_value, ''))
    when 'quads' then 'quadriceps'
    when 'legs' then 'quadriceps'
    when 'back' then 'upper_back'
    when 'shoulders' then 'side_deltoids'
    when 'core' then 'abs'
    when 'lower_abs' then 'abs'
    when 'bodyweight' then 'full_body'
    when 'forearm_flexors' then 'forearms'
    when 'chest' then 'chest'
    when 'upper_chest' then 'upper_chest'
    when 'lats' then 'lats'
    when 'upper_back' then 'upper_back'
    when 'traps' then 'traps'
    when 'front_deltoids' then 'front_deltoids'
    when 'side_deltoids' then 'side_deltoids'
    when 'rear_deltoids' then 'rear_deltoids'
    when 'biceps' then 'biceps'
    when 'triceps' then 'triceps'
    when 'forearms' then 'forearms'
    when 'abs' then 'abs'
    when 'obliques' then 'obliques'
    when 'lower_back' then 'lower_back'
    when 'glutes' then 'glutes'
    when 'quadriceps' then 'quadriceps'
    when 'hamstrings' then 'hamstrings'
    when 'adductors' then 'adductors'
    when 'abductors' then 'abductors'
    when 'calves' then 'calves'
    when 'hip_flexors' then 'hip_flexors'
    when 'full_body' then 'full_body'
    else null
  end
$$;

create or replace function public._ymove_import_muscle_array(p_values jsonb)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct mapped) filter (where mapped is not null), '{}'::text[])
  from (
    select public._ymove_normalize_import_muscle(value) as mapped
    from jsonb_array_elements_text(coalesce(p_values, '[]'::jsonb))
  ) s
$$;

create or replace function public._ymove_primary_group_from_muscles(p_muscles text[])
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when 'chest' = any(coalesce(p_muscles, '{}'::text[])) or 'upper_chest' = any(coalesce(p_muscles, '{}'::text[])) then 'petto'
    when 'lats' = any(coalesce(p_muscles, '{}'::text[])) or 'upper_back' = any(coalesce(p_muscles, '{}'::text[])) or 'traps' = any(coalesce(p_muscles, '{}'::text[])) then 'dorsali'
    when 'front_deltoids' = any(coalesce(p_muscles, '{}'::text[])) or 'side_deltoids' = any(coalesce(p_muscles, '{}'::text[])) or 'rear_deltoids' = any(coalesce(p_muscles, '{}'::text[])) then 'spalle'
    when 'biceps' = any(coalesce(p_muscles, '{}'::text[])) then 'bicipiti'
    when 'triceps' = any(coalesce(p_muscles, '{}'::text[])) then 'tricipiti'
    when 'forearms' = any(coalesce(p_muscles, '{}'::text[])) then 'avambracci'
    when 'quadriceps' = any(coalesce(p_muscles, '{}'::text[])) then 'quadricipiti'
    when 'hamstrings' = any(coalesce(p_muscles, '{}'::text[])) then 'femorali'
    when 'glutes' = any(coalesce(p_muscles, '{}'::text[])) then 'glutei'
    when 'calves' = any(coalesce(p_muscles, '{}'::text[])) then 'polpacci'
    when 'abs' = any(coalesce(p_muscles, '{}'::text[])) then 'addome'
    when 'obliques' = any(coalesce(p_muscles, '{}'::text[])) then 'obliqui'
    when 'lower_back' = any(coalesce(p_muscles, '{}'::text[])) then 'lombari'
    else 'full_body'
  end
$$;

create or replace function public._ymove_safe_import_slug(p_external_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select 'ymove-' || regexp_replace(lower(coalesce(p_external_id, '')), '[^a-z0-9]+', '-', 'g')
$$;

create or replace function public.apply_ymove_safe_create_batch(
  p_import_run_id uuid,
  p_batch_size integer default 10,
  p_reviewed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_reviewed_by);
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 10), 1), 10);
  v_candidate record;
  v_exercise_id uuid;
  v_exercise_key text;
  v_primary_muscles text[];
  v_secondary_muscles text[];
  v_name text;
  v_translation_status text;
  v_created_new integer := 0;
  v_linked_existing integer := 0;
  v_idempotent integer := 0;
  v_processed integer := 0;
begin
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor and role = 'superadmin') then
    raise exception 'YMOVE_IMPORT_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.ymove_library_import_runs
    where id = p_import_run_id
      and status in ('review_ready', 'applying', 'completed')
  ) then
    raise exception 'YMOVE_IMPORT_RUN_NOT_READY' using errcode = 'P0001';
  end if;

  update public.ymove_library_import_runs
  set status = 'applying', updated_at = now()
  where id = p_import_run_id and status = 'review_ready';

  if exists (
    select 1
    from public.ymove_library_import_candidates c
    where c.import_run_id = p_import_run_id
      and c.decision = 'approved_new'
      and (
        c.classification <> 'CREATE_NEW'
        or c.safe_create is not true
        or nullif(trim(coalesce(c.approved_italian_name, '')), '') is null
        or c.reviewed_by is null
        or c.reviewed_at is null
      )
  ) then
    raise exception 'YMOVE_IMPORT_APPROVED_NEW_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ymove_library_import_candidates c
    where c.import_run_id = p_import_run_id
      and c.decision = 'approved_link'
      and (
        c.classification <> 'LINK_EXISTING'
        or nullif(trim(coalesce(c.approved_existing_exercise_key, c.existing_exercise_key, c.existing_exercise_id::text, '')), '') is null
        or c.reviewed_by is null
        or c.reviewed_at is null
        or jsonb_array_length(coalesce(c.contradictions, '[]'::jsonb)) > 0
      )
  ) then
    raise exception 'YMOVE_IMPORT_APPROVED_LINK_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select coalesce(approved_existing_exercise_key, existing_exercise_key, existing_exercise_id::text) as target_key
      from public.ymove_library_import_candidates
      where import_run_id = p_import_run_id
        and decision = 'approved_link'
        and classification = 'LINK_EXISTING'
      group by coalesce(approved_existing_exercise_key, existing_exercise_key, existing_exercise_id::text)
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'YMOVE_IMPORT_DUPLICATE_PRIMARY_TARGET' using errcode = 'P0001';
  end if;

  for v_candidate in
    select *
    from public.ymove_library_import_candidates c
    where c.import_run_id = p_import_run_id
      and (
        (
          c.classification = 'CREATE_NEW'
          and c.safe_create = true
          and c.decision = 'approved_new'
          and nullif(trim(coalesce(c.approved_italian_name, '')), '') is not null
          and c.reviewed_by is not null
          and c.reviewed_at is not null
        )
        or (
          c.classification = 'LINK_EXISTING'
          and c.decision = 'approved_link'
          and nullif(trim(coalesce(c.approved_existing_exercise_key, c.existing_exercise_key, '')), '') is not null
          and c.reviewed_by is not null
          and c.reviewed_at is not null
          and jsonb_array_length(coalesce(c.contradictions, '[]'::jsonb)) = 0
        )
      )
      and not exists (
        select 1 from public.exercise_external_links l
        where l.provider = 'ymove'
          and l.external_exercise_id = c.external_exercise_id
          and l.match_status = 'manual_approved'
          and l.is_primary
      )
    order by
      case when c.classification = 'LINK_EXISTING' then 0 else 1 end,
      c.ymove_title
    limit v_batch_size
  loop
    v_processed := v_processed + 1;
    v_exercise_id := null;
    v_exercise_key := null;

    if v_candidate.classification = 'LINK_EXISTING' then
      v_exercise_id := v_candidate.existing_exercise_id;
      v_exercise_key := nullif(trim(coalesce(v_candidate.approved_existing_exercise_key, v_candidate.existing_exercise_key, '')), '');
      if v_exercise_id is null and v_exercise_key like 'uuid:%' then
        v_exercise_id := substring(v_exercise_key from 6)::uuid;
      end if;
      if v_exercise_id is null then
        select exercise_id into v_exercise_id
        from public.exercise_identity_keys
        where key = v_exercise_key
        limit 1;
      end if;
      if v_exercise_id is null and v_exercise_key is null then
        raise exception 'YMOVE_LINK_TARGET_MISSING external_id=%', v_candidate.external_exercise_id using errcode = 'P0001';
      end if;

      insert into public.exercise_external_links (
        exercise_id, exercise_key, provider, external_exercise_id, match_status, is_primary, reviewed_by, reviewed_at
      ) values (
        v_exercise_id, v_exercise_key, 'ymove', v_candidate.external_exercise_id, 'manual_approved', true, v_actor, now()
      )
      on conflict do nothing;

      if found then
        v_linked_existing := v_linked_existing + 1;
      else
        v_idempotent := v_idempotent + 1;
      end if;
    else
      v_name := trim(coalesce(v_candidate.approved_italian_name, ''));
      v_translation_status := v_candidate.translation_status;
      if v_name = '' then
        raise exception 'YMOVE_IMPORT_NAME_MISSING external_id=%', v_candidate.external_exercise_id using errcode = 'P0001';
      end if;

      select id into v_exercise_id
      from public.exercises
      where source = 'ymove' and ymove_exercise_id = v_candidate.external_exercise_id
      limit 1;

      if v_exercise_id is null then
        v_primary_muscles := public._ymove_import_muscle_array(v_candidate.proposed_payload->'primary_muscles');
        v_secondary_muscles := public._ymove_import_muscle_array(v_candidate.proposed_payload->'secondary_muscles');
        if cardinality(v_primary_muscles) = 0 then
          raise exception 'YMOVE_IMPORT_PRIMARY_MUSCLE_MISSING external_id=%', v_candidate.external_exercise_id using errcode = 'P0001';
        end if;

        insert into public.exercises (
          coach_id, name, name_en, description, technical_notes, muscle_group, primary_muscle_group,
          primary_muscles, secondary_muscles, secondary_muscle_groups, equipment, difficulty, exercise_type,
          source, ymove_exercise_id, ymove_slug, ymove_original_title, active, visibility, review_status,
          library_status, auto_program_eligible, translation_status, movement_pattern, body_position, source_metadata,
          created_at, updated_at
        ) values (
          null,
          v_name,
          nullif(v_candidate.ymove_title, ''),
          null,
          null,
          public._ymove_primary_group_from_muscles(v_primary_muscles),
          public._ymove_primary_group_from_muscles(v_primary_muscles),
          v_primary_muscles,
          v_secondary_muscles,
          '{}'::text[],
          nullif(v_candidate.proposed_payload->'equipment'->>0, ''),
          nullif(v_candidate.proposed_payload->>'difficulty', ''),
          nullif(v_candidate.proposed_payload->>'movement_pattern', ''),
          'ymove',
          v_candidate.external_exercise_id,
          nullif(v_candidate.proposed_payload->>'ymove_slug', ''),
          v_candidate.ymove_title,
          true,
          'global',
          'approved',
          'pending_review',
          false,
          v_translation_status,
          nullif(v_candidate.proposed_payload->>'movement_pattern', ''),
          nullif(v_candidate.proposed_payload->>'body_position', ''),
          jsonb_strip_nulls(v_candidate.proposed_payload - 'videoUrl' - 'videoHlsUrl' - 'thumbnailUrl' - 'videos'),
          now(),
          now()
        )
        on conflict (ymove_exercise_id) where ymove_exercise_id is not null
        do update set updated_at = public.exercises.updated_at
        returning id into v_exercise_id;
        v_created_new := v_created_new + 1;
      else
        v_idempotent := v_idempotent + 1;
      end if;

      v_exercise_key := 'ymove:' || v_candidate.external_exercise_id;
      insert into public.exercise_identity_keys(key, exercise_id, key_type, provider, is_primary)
      values ('uuid:' || v_exercise_id::text, v_exercise_id, 'uuid', 'fitcoach', false)
      on conflict (key) do nothing;
      insert into public.exercise_identity_keys(key, exercise_id, key_type, provider, is_primary)
      values (v_exercise_key, v_exercise_id, 'provider', 'ymove', false)
      on conflict (key) do nothing;

      insert into public.exercise_external_links (
        exercise_id, exercise_key, provider, external_exercise_id, match_status, is_primary, reviewed_by, reviewed_at
      ) values (
        v_exercise_id, v_exercise_key, 'ymove', v_candidate.external_exercise_id, 'manual_approved', true, v_actor, now()
      )
      on conflict do nothing;
    end if;
  end loop;

  update public.ymove_library_import_runs
  set updated_at = now()
  where id = p_import_run_id;

  return jsonb_build_object(
    'processed', v_processed,
    'createdNew', v_created_new,
    'linkedExisting', v_linked_existing,
    'idempotent', v_idempotent,
    'batchSize', v_batch_size
  );
end;
$$;

revoke all on function public.apply_ymove_safe_create_batch(uuid, integer, uuid) from public, anon;
grant execute on function public.apply_ymove_safe_create_batch(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
