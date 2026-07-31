-- Prepared only. Never removes legacy metadata or application references.
begin;

do $$
declare
  v_id uuid := '8a3b9fdc-b153-4975-9b90-a2217bcd0f7f';
  v_reference_count integer;
begin
  if not exists (
    select 1 from public.exercises
    where id = v_id
      and slug = 'bicipiti-curl-bilanciere'
      and source = 'legacy'
      and record_kind = 'legacy_bridge'
  ) then
    raise exception 'ROLLBACK_CANONICAL_PRECONDITION_FAILED: UUID or slug mismatch';
  end if;

  select count(*) into v_reference_count
  from public.exercise_external_links
  where exercise_id = v_id;
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: external links exist';
  end if;

  select count(*) into v_reference_count
  from public.exercise_text_overrides
  where exercise_id = v_id;
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: text overrides exist';
  end if;

  select count(*) into v_reference_count
  from public.ymove_audit_results
  where fitcoach_exercise_id = v_id;
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: audit results reference UUID';
  end if;

  select count(*) into v_reference_count
  from public.ymove_library_import_candidates
  where existing_exercise_id = v_id;
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: staging candidates reference UUID';
  end if;

  select count(*) into v_reference_count
  from public.exercises
  where canonical_id = v_id;
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: canonical aliases reference UUID';
  end if;

  select count(*) into v_reference_count
  from public.exercise_identity_keys
  where exercise_id = v_id
    and key not in ('legacy:bicipiti-curl-bilanciere', 'bicipiti-curl-bilanciere');
  if v_reference_count <> 0 then
    raise exception 'ROLLBACK_CANONICAL_BLOCKED: additional identity keys exist';
  end if;

  delete from public.exercise_identity_keys
  where exercise_id = v_id
    and key in ('legacy:bicipiti-curl-bilanciere', 'bicipiti-curl-bilanciere');
  delete from public.exercises where id = v_id;
end $$;

commit;
