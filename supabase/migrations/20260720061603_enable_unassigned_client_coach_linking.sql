create or replace function public.client_onboarding_state_allowed(
  p_client_id uuid,
  p_client_mode text,
  p_onboarding_completed boolean,
  p_completed_at timestamptz,
  p_gender text,
  p_goals text[],
  p_focus_areas text[],
  p_training_reasons text[],
  p_experience_level text,
  p_training_days_per_week integer,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_bmi numeric,
  p_bmi_category text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(p_onboarding_completed, false) = false
    or (
      p_client_mode = 'coach_guided'
      and p_completed_at is not null
    )
    or (
      p_client_mode = 'self_guided'
      and p_completed_at is not null
      and public.client_onboarding_is_valid_self_guided(
        p_gender,
        p_goals,
        p_focus_areas,
        p_training_reasons,
        p_experience_level,
        p_training_days_per_week,
        p_weight_kg,
        p_height_cm,
        p_bmi,
        p_bmi_category
      )
    );
$$;

create or replace function public.prevent_client_onboarding_unsafe_changes()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_superadmin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.client_id is distinct from auth.uid() then
      raise exception 'CLIENT_ONBOARDING_CLIENT_ID_INVALID';
    end if;

    if coalesce(new.onboarding_completed, false) = true or new.completed_at is not null then
      raise exception 'CLIENT_ONBOARDING_INSERT_MUST_BE_DRAFT';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'CLIENT_ONBOARDING_ID_IMMUTABLE';
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'CLIENT_ONBOARDING_CLIENT_ID_IMMUTABLE';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'CLIENT_ONBOARDING_CREATED_AT_IMMUTABLE';
  end if;

  if old.onboarding_completed = true then
    if new.onboarding_completed is distinct from true then
      raise exception 'CLIENT_ONBOARDING_COMPLETION_IRREVERSIBLE';
    end if;

    if new.client_mode is distinct from old.client_mode then
      raise exception 'CLIENT_ONBOARDING_MODE_IMMUTABLE_AFTER_COMPLETION';
    end if;

    if new.completed_at is null or new.completed_at is distinct from old.completed_at then
      raise exception 'CLIENT_ONBOARDING_COMPLETED_AT_IMMUTABLE_AFTER_COMPLETION';
    end if;
  end if;

  if coalesce(new.onboarding_completed, false) = false and new.completed_at is not null then
    raise exception 'CLIENT_ONBOARDING_DRAFT_COMPLETED_AT_INVALID';
  end if;

  if coalesce(new.onboarding_completed, false) = true then
    if new.completed_at is null then
      raise exception 'CLIENT_ONBOARDING_COMPLETED_AT_REQUIRED';
    end if;

    if new.client_mode = 'coach_guided' then
      -- Il cliente puo completare l'onboarding in attesa di inserire il codice.
      -- L'accesso ai contenuti coach resta bloccato da AuthGate e dalle RLS
      -- basate su coach_clients.status = 'active'.
      null;
    elsif new.client_mode = 'self_guided' then
      if not public.client_onboarding_is_valid_self_guided(
        new.gender,
        new.goals,
        new.focus_areas,
        new.training_reasons,
        new.experience_level,
        new.training_days_per_week,
        new.weight_kg,
        new.height_cm,
        new.bmi,
        new.bmi_category
      ) then
        raise exception 'CLIENT_ONBOARDING_SELF_GUIDED_INCOMPLETE';
      end if;
    else
      raise exception 'CLIENT_ONBOARDING_MODE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.join_coach_by_invite_code(p_code text)
returns table(
  success boolean,
  coach_id uuid,
  coach_name text,
  business_name text,
  connection_status text,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_normalized_code text := upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_client_role text;
  v_code public.registration_codes%rowtype;
  v_coach public.profiles%rowtype;
  v_business_name text;
  v_existing public.coach_clients%rowtype;
  v_capacity record;
begin
  if v_client_id is null then
    return query select false, null::uuid, null::text, null::text, null::text, 'NOT_AUTHENTICATED';
    return;
  end if;

  select role into v_client_role
  from public.profiles
  where id = v_client_id;

  if v_client_role is distinct from 'cliente' then
    return query select false, null::uuid, null::text, null::text, null::text, 'FORBIDDEN';
    return;
  end if;

  if v_normalized_code = '' then
    return query select false, null::uuid, null::text, null::text, null::text, 'INVALID_INVITE_CODE';
    return;
  end if;

  select * into v_code
  from public.registration_codes
  where code = v_normalized_code
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::text, null::text, 'INVALID_INVITE_CODE';
    return;
  end if;

  if v_code.status <> 'active' or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return query select false, null::uuid, null::text, null::text, null::text, 'INACTIVE_INVITE_CODE';
    return;
  end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return query select false, null::uuid, null::text, null::text, null::text, 'INACTIVE_INVITE_CODE';
    return;
  end if;

  select * into v_coach
  from public.profiles
  where id = v_code.coach_id
    and role = 'coach';

  if not found or coalesce(v_coach.is_active, false) = false then
    return query select false, null::uuid, null::text, null::text, null::text, 'INACTIVE_INVITE_CODE';
    return;
  end if;

  select business_name into v_business_name
  from public.coach_profiles
  where user_id = v_code.coach_id;

  select * into v_existing
  from public.coach_clients
  where client_id = v_client_id
    and status in ('active', 'suspended')
  order by updated_at desc
  limit 1;

  if found then
    if v_existing.coach_id = v_code.coach_id and v_existing.status = 'active' then
      return query select true, v_coach.id, v_coach.full_name, v_business_name, 'active'::text, null::text;
      return;
    end if;

    return query select false, null::uuid, null::text, null::text, null::text, 'CLIENT_ALREADY_ASSIGNED';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_code.coach_id::text));

  select * into v_code
  from public.registration_codes
  where id = v_code.id
  for update;

  if not found or v_code.status <> 'active' or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return query select false, null::uuid, null::text, null::text, null::text, 'INACTIVE_INVITE_CODE';
    return;
  end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return query select false, null::uuid, null::text, null::text, null::text, 'INACTIVE_INVITE_CODE';
    return;
  end if;

  select * into v_existing
  from public.coach_clients
  where client_id = v_client_id
    and status in ('active', 'suspended')
  order by updated_at desc
  limit 1
  for update;

  if found then
    if v_existing.coach_id = v_code.coach_id and v_existing.status = 'active' then
      return query select true, v_coach.id, v_coach.full_name, v_business_name, 'active'::text, null::text;
      return;
    end if;

    return query select false, null::uuid, null::text, null::text, null::text, 'CLIENT_ALREADY_ASSIGNED';
    return;
  end if;

  select * into v_capacity from public._coach_capacity(v_code.coach_id);

  if not v_capacity.has_active_subscription then
    return query select false, null::uuid, null::text, null::text, null::text, 'COACH_PACKAGE_INACTIVE';
    return;
  end if;

  if v_capacity.max_clients is not null and v_capacity.used_clients >= v_capacity.max_clients then
    return query select false, null::uuid, null::text, null::text, null::text, 'COACH_CAPACITY_REACHED';
    return;
  end if;

  insert into public.client_profiles (user_id)
  values (v_client_id)
  on conflict (user_id) do nothing;

  select * into v_existing
  from public.coach_clients
  where coach_id = v_code.coach_id
    and client_id = v_client_id
    and status = 'removed'
  limit 1
  for update;

  if found then
    update public.coach_clients
    set
      status = 'active',
      suspended_at = null,
      suspension_reason = null,
      removed_at = null,
      reactivated_at = now(),
      linked_by_code = v_normalized_code,
      updated_at = now()
    where id = v_existing.id;
  else
    insert into public.coach_clients (coach_id, client_id, status, linked_by_code)
    values (v_code.coach_id, v_client_id, 'active', v_normalized_code);
  end if;

  update public.registration_codes
  set used_count = used_count + 1
  where id = v_code.id;

  return query select true, v_coach.id, v_coach.full_name, v_business_name, 'active'::text, null::text;
end;
$$;

revoke all on function public.join_coach_by_invite_code(text) from public, anon;
grant execute on function public.join_coach_by_invite_code(text) to authenticated;

notify pgrst, 'reload schema';
