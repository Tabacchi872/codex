alter table public.coach_clients
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists removed_at timestamptz,
  add column if not exists reactivated_at timestamptz;

update public.coach_clients
set status = 'active'
where status is null or trim(status) = '' or status = 'invited';

update public.coach_clients
set
  status = 'removed',
  removed_at = coalesce(removed_at, now())
where status not in ('active', 'suspended', 'removed');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_clients_status_lifecycle_check'
      and conrelid = 'public.coach_clients'::regclass
  ) then
    alter table public.coach_clients
      add constraint coach_clients_status_lifecycle_check
      check (status in ('active', 'suspended', 'removed'));
  end if;
end $$;

create index if not exists coach_clients_coach_status_idx
  on public.coach_clients(coach_id, status);

create or replace function public.is_coach_for_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = target_client_id
      and coach_clients.status = 'active'
  );
$$;

create or replace function public._coach_capacity(p_coach_id uuid)
returns table(
  has_active_subscription boolean,
  package_id uuid,
  package_name text,
  max_clients integer,
  used_clients integer,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  select * into v_sub from public._effective_coach_subscription(p_coach_id);

  if not found then
    return query
    select
      false,
      null::uuid,
      null::text,
      null::integer,
      (select count(*)::integer from public.coach_clients where coach_id = p_coach_id and status in ('active', 'suspended')),
      null::timestamptz;
    return;
  end if;

  return query
  select
    v_sub.package_id is not null,
    v_sub.package_id,
    v_sub.package_name,
    v_sub.max_clients,
    (select count(*)::integer from public.coach_clients where coach_id = p_coach_id and status in ('active', 'suspended')),
    v_sub.expires_at;
end;
$$;

revoke all on function public._coach_capacity(uuid) from public, anon, authenticated;

create or replace function public._link_client_to_coach(p_client_id uuid, p_coach_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_link public.coach_clients%rowtype;
  v_code_row public.registration_codes%rowtype;
  v_capacity record;
begin
  select * into v_existing_link
  from public.coach_clients
  where client_id = p_client_id
    and status in ('active', 'suspended')
  limit 1;
  if found then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_coach_id::text));

  if p_code is not null then
    select * into v_code_row
    from public.registration_codes
    where code = p_code and coach_id = p_coach_id
    for update;

    if not found or v_code_row.status <> 'active' then
      raise exception 'INVALID_CODE: codice coach non valido o disattivato';
    end if;
    if v_code_row.expires_at is not null and v_code_row.expires_at < now() then
      raise exception 'INVALID_CODE: codice coach scaduto';
    end if;
    if v_code_row.max_uses is not null and v_code_row.used_count >= v_code_row.max_uses then
      raise exception 'INVALID_CODE: limite di utilizzi del codice raggiunto';
    end if;
  end if;

  select * into v_capacity from public._coach_capacity(p_coach_id);

  if not v_capacity.has_active_subscription then
    raise exception 'SUBSCRIPTION_REQUIRED: il coach non ha un abbonamento attivo';
  end if;
  if v_capacity.max_clients is not null and v_capacity.used_clients >= v_capacity.max_clients then
    raise exception 'CLIENT_LIMIT_REACHED: limite clienti del coach raggiunto';
  end if;

  insert into public.client_profiles (user_id)
  values (p_client_id)
  on conflict (user_id) do nothing;

  select * into v_existing_link
  from public.coach_clients
  where coach_id = p_coach_id
    and client_id = p_client_id
    and status = 'removed'
  limit 1;

  if found then
    update public.coach_clients
    set
      status = 'active',
      suspended_at = null,
      suspension_reason = null,
      removed_at = null,
      reactivated_at = now(),
      linked_by_code = coalesce(p_code, linked_by_code),
      updated_at = now()
    where id = v_existing_link.id;
  else
    insert into public.coach_clients (coach_id, client_id, status, linked_by_code)
    values (p_coach_id, p_client_id, 'active', p_code);
  end if;

  if p_code is not null then
    update public.registration_codes set used_count = used_count + 1 where id = v_code_row.id;
  end if;
end;
$$;

revoke all on function public._link_client_to_coach(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.suspend_assigned_client(p_client_id uuid, p_reason text default 'In attesa di rinnovo')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.coach_clients%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'FORBIDDEN: solo il coach puo sospendere un cliente';
  end if;

  select * into v_link
  from public.coach_clients
  where coach_id = auth.uid()
    and client_id = p_client_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: cliente non assegnato al coach';
  end if;
  if v_link.status = 'removed' then
    raise exception 'INVALID_TRANSITION: cliente rimosso';
  end if;
  if v_link.status = 'suspended' then
    return;
  end if;

  update public.coach_clients
  set
    status = 'suspended',
    suspended_at = now(),
    suspension_reason = coalesce(nullif(trim(p_reason), ''), 'In attesa di rinnovo'),
    removed_at = null,
    updated_at = now()
  where id = v_link.id;
end;
$$;

create or replace function public.reactivate_assigned_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.coach_clients%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'FORBIDDEN: solo il coach puo riattivare un cliente';
  end if;

  select * into v_link
  from public.coach_clients
  where coach_id = auth.uid()
    and client_id = p_client_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: cliente non assegnato al coach';
  end if;
  if v_link.status = 'removed' then
    raise exception 'INVALID_TRANSITION: un cliente rimosso non puo essere riattivato da questa azione';
  end if;
  if v_link.status = 'active' then
    return;
  end if;

  update public.coach_clients
  set
    status = 'active',
    suspended_at = null,
    suspension_reason = null,
    reactivated_at = now(),
    updated_at = now()
  where id = v_link.id;
end;
$$;

create or replace function public.remove_assigned_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.coach_clients%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'FORBIDDEN: solo il coach puo rimuovere un cliente';
  end if;

  select * into v_link
  from public.coach_clients
  where coach_id = auth.uid()
    and client_id = p_client_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: cliente non assegnato al coach';
  end if;
  if v_link.status = 'removed' then
    return;
  end if;

  update public.coach_clients
  set
    status = 'removed',
    removed_at = now(),
    updated_at = now()
  where id = v_link.id;
end;
$$;

create or replace function public.get_my_assigned_coach()
returns table(
  coach_id uuid,
  full_name text,
  business_name text,
  connection_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coach_clients.coach_id,
    profiles.full_name,
    coach_profiles.business_name,
    coach_clients.status
  from public.coach_clients
  join public.profiles on profiles.id = coach_clients.coach_id
  left join public.coach_profiles on coach_profiles.user_id = coach_clients.coach_id
  where coach_clients.client_id = auth.uid()
    and coach_clients.status in ('active', 'suspended')
  order by coach_clients.updated_at desc
  limit 1;
$$;

revoke all on function public.suspend_assigned_client(uuid, text) from public, anon;
revoke all on function public.reactivate_assigned_client(uuid) from public, anon;
revoke all on function public.remove_assigned_client(uuid) from public, anon;
revoke all on function public.get_my_assigned_coach() from public, anon;
grant execute on function public.suspend_assigned_client(uuid, text) to authenticated;
grant execute on function public.reactivate_assigned_client(uuid) to authenticated;
grant execute on function public.remove_assigned_client(uuid) to authenticated;
grant execute on function public.get_my_assigned_coach() to authenticated;

drop policy if exists coach_clients_coach_scope on public.coach_clients;
create policy coach_clients_coach_scope on public.coach_clients
  for select using (coach_id = auth.uid() and status in ('active', 'suspended'));

drop policy if exists coach_clients_client_scope on public.coach_clients;
create policy coach_clients_client_scope on public.coach_clients
  for select using (client_id = auth.uid());

drop policy if exists coach_clients_client_self_insert on public.coach_clients;

drop policy if exists workout_plans_client_read on public.workout_plans;
create policy workout_plans_client_read on public.workout_plans
  for select using (
    client_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = workout_plans.coach_id
        and coach_clients.client_id = auth.uid()
        and coach_clients.status = 'active'
    )
  );

drop policy if exists workout_days_client_read on public.workout_days;
create policy workout_days_client_read on public.workout_days
  for select using (
    exists (
      select 1
      from public.workout_plans
      join public.coach_clients
        on coach_clients.coach_id = workout_plans.coach_id
       and coach_clients.client_id = auth.uid()
       and coach_clients.status = 'active'
      where workout_plans.id = workout_days.workout_plan_id
        and workout_plans.client_id = auth.uid()
    )
  );

drop policy if exists workout_day_exercises_client_read on public.workout_day_exercises;
create policy workout_day_exercises_client_read on public.workout_day_exercises
  for select using (
    exists (
      select 1
      from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      join public.coach_clients
        on coach_clients.coach_id = workout_plans.coach_id
       and coach_clients.client_id = auth.uid()
       and coach_clients.status = 'active'
      where workout_days.id = workout_day_exercises.workout_day_id
        and workout_plans.client_id = auth.uid()
    )
  );

drop policy if exists appointments_client_read on public.appointments;
create policy appointments_client_read on public.appointments
  for select using (
    client_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = appointments.coach_id
        and coach_clients.client_id = auth.uid()
        and coach_clients.status = 'active'
    )
  );

drop policy if exists messages_client_scope on public.messages;
create policy messages_client_scope on public.messages
  for all using (
    client_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = messages.coach_id
        and coach_clients.client_id = auth.uid()
        and coach_clients.status = 'active'
    )
  )
  with check (
    client_id = auth.uid()
    and sender_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = messages.coach_id
        and coach_clients.client_id = auth.uid()
        and coach_clients.status = 'active'
    )
  );

drop policy if exists exercises_client_read_assigned_private on public.exercises;
create policy exercises_client_read_assigned_private on public.exercises
  for select using (
    source = 'custom'
    and active = true
    and visibility = 'coach_private'
    and exists (
      select 1
      from public.workout_day_exercises
      join public.workout_days on workout_days.id = workout_day_exercises.workout_day_id
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      join public.coach_clients
        on coach_clients.coach_id = workout_plans.coach_id
       and coach_clients.client_id = auth.uid()
       and coach_clients.status = 'active'
      where workout_day_exercises.exercise_id = exercises.id::text
        and workout_plans.client_id = auth.uid()
        and workout_plans.coach_id = exercises.coach_id
    )
  );

drop policy if exists exercise_text_overrides_client_read_own_coach on public.exercise_text_overrides;
create policy exercise_text_overrides_client_read_own_coach on public.exercise_text_overrides
  for select using (
    exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercise_text_overrides.coach_id
        and coach_clients.status = 'active'
    )
  );

notify pgrst, 'reload schema';
