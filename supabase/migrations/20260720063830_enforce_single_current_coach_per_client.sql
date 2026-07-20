do $$
declare
  v_duplicate_clients text;
begin
  select string_agg(client_id::text, ', ' order by client_id::text)
    into v_duplicate_clients
  from (
    select client_id
    from public.coach_clients
    where status in ('active', 'suspended')
    group by client_id
    having count(*) > 1
  ) duplicates;

  if v_duplicate_clients is not null then
    raise exception 'COACH_CLIENTS_CURRENT_DUPLICATES:%', v_duplicate_clients;
  end if;
end $$;

create unique index if not exists coach_clients_one_current_per_client_idx
  on public.coach_clients(client_id)
  where status in ('active', 'suspended');

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

  -- Serializza sia sul cliente sia sul coach: due codici di coach diversi
  -- inviati dallo stesso client non possono superare contemporaneamente il
  -- controllo "nessun active/suspended".
  perform pg_advisory_xact_lock(hashtext(v_client_id::text));
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
exception
  when unique_violation then
    return query select false, null::uuid, null::text, null::text, null::text, 'CLIENT_ALREADY_ASSIGNED';
end;
$$;

revoke all on function public.join_coach_by_invite_code(text) from public, anon;
grant execute on function public.join_coach_by_invite_code(text) to authenticated;

notify pgrst, 'reload schema';
