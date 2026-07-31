-- Lock down YMove apply RPC after import incident.
-- No data import is executed by this migration.

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
  v_already_present integer := 0;
  v_processed integer := 0;
  v_remaining integer := 0;
  v_processed_external_ids text[] := '{}'::text[];
begin
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor and role = 'superadmin') then
    raise exception 'YMOVE_IMPORT_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ymove_library_import_runs
    where id = p_import_run_id
      and status in ('review_ready', 'applying', 'completed')
  ) then
    raise exception 'YMOVE_IMPORT_RUN_NOT_READY' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ymove_library_import_candidates c
    where c.import_run_id = p_import_run_id
      and c.decision = 'approved_new'
      and (
        c.classification <> 'CREATE_NEW'
        or c.safe_create is not true
        or nullif(trim(coalesce(c.approved_italian_name, '')), '') is null
        or c.approved_italian_name_confirmed_by is null
        or c.approved_italian_name_confirmed_at is null
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
        or nullif(trim(coalesce(c.approved_existing_exercise_key, '')), '') is null
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
      select approved_existing_exercise_key
      from public.ymove_library_import_candidates
      where import_run_id = p_import_run_id
        and classification = 'LINK_EXISTING'
        and decision = 'approved_link'
      group by approved_existing_exercise_key
      having count(*) > 1
    ) duplicate_targets
  ) then
    raise exception 'YMOVE_IMPORT_DUPLICATE_PRIMARY_TARGET' using errcode = 'P0001';
  end if;

  update public.ymove_library_import_runs
  set status = 'applying', updated_at = now()
  where id = p_import_run_id and status = 'review_ready';

  for v_candidate in
    select *
    from public.ymove_library_import_candidates c
    where c.import_run_id = p_import_run_id
      and (
        (
          c.classification = 'CREATE_NEW'
          and c.safe_create is true
          and c.decision = 'approved_new'
          and nullif(trim(coalesce(c.approved_italian_name, '')), '') is not null
          and c.approved_italian_name_confirmed_by is not null
          and c.approved_italian_name_confirmed_at is not null
          and c.reviewed_by is not null
          and c.reviewed_at is not null
        )
        or (
          c.classification = 'LINK_EXISTING'
          and c.decision = 'approved_link'
          and nullif(trim(coalesce(c.approved_existing_exercise_key, '')), '') is not null
          and c.reviewed_by is not null
          and c.reviewed_at is not null
          and jsonb_array_length(coalesce(c.contradictions, '[]'::jsonb)) = 0
        )
      )
      and not exists (
        select 1
        from public.exercise_external_links l
        where l.provider = 'ymove'
          and l.external_exercise_id = c.external_exercise_id
          and l.match_status = 'manual_approved'
          and l.is_primary
      )
    order by c.reviewed_at, c.external_exercise_id
    limit v_batch_size
  loop
    v_processed := v_processed + 1;
    v_processed_external_ids := array_append(v_processed_external_ids, v_candidate.external_exercise_id);
    v_exercise_id := null;
    v_exercise_key := null;

    if v_candidate.classification = 'LINK_EXISTING' then
      v_exercise_id := v_candidate.existing_exercise_id;
      v_exercise_key := nullif(trim(v_candidate.approved_existing_exercise_key), '');
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
        v_already_present := v_already_present + 1;
      end if;
    else
      v_name := trim(v_candidate.approved_italian_name);
      v_translation_status := v_candidate.translation_status;
      v_exercise_key := 'ymove:' || v_candidate.external_exercise_id;

      select id into v_exercise_id
      from public.exercises
      where source = 'ymove'
        and ymove_exercise_id = v_candidate.external_exercise_id
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
        returning id into v_exercise_id;
        v_created_new := v_created_new + 1;
      else
        v_already_present := v_already_present + 1;
      end if;

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

  select count(*) into v_remaining
  from public.ymove_library_import_candidates c
  where c.import_run_id = p_import_run_id
    and (
      (
        c.classification = 'CREATE_NEW'
        and c.safe_create is true
        and c.decision = 'approved_new'
        and nullif(trim(coalesce(c.approved_italian_name, '')), '') is not null
        and c.approved_italian_name_confirmed_by is not null
        and c.approved_italian_name_confirmed_at is not null
        and c.reviewed_by is not null
        and c.reviewed_at is not null
      )
      or (
        c.classification = 'LINK_EXISTING'
        and c.decision = 'approved_link'
        and nullif(trim(coalesce(c.approved_existing_exercise_key, '')), '') is not null
        and c.reviewed_by is not null
        and c.reviewed_at is not null
        and jsonb_array_length(coalesce(c.contradictions, '[]'::jsonb)) = 0
      )
    )
    and not exists (
      select 1
      from public.exercise_external_links l
      where l.provider = 'ymove'
        and l.external_exercise_id = c.external_exercise_id
        and l.match_status = 'manual_approved'
        and l.is_primary
    );

  update public.ymove_library_import_runs
  set updated_at = now()
  where id = p_import_run_id;

  return jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'created', v_created_new,
    'linked', v_linked_existing,
    'already_present', v_already_present,
    'failed', 0,
    'remaining', v_remaining,
    'external_ids', v_processed_external_ids,
    'batch_size', v_batch_size
  );
end;
$$;

revoke all on function public.apply_ymove_safe_create_batch(uuid, integer, uuid) from public, anon;
grant execute on function public.apply_ymove_safe_create_batch(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
