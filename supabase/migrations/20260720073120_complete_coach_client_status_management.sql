create or replace function public.reactivate_assigned_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.coach_clients%rowtype;
  v_capacity record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'NOT_A_COACH';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select * into v_link
  from public.coach_clients
  where coach_id = auth.uid()
    and client_id = p_client_id
  for update;

  if not found then
    raise exception 'CLIENT_NOT_ASSIGNED';
  end if;

  if v_link.status = 'removed' then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  if v_link.status = 'active' then
    return;
  end if;

  select * into v_capacity from public._coach_capacity(auth.uid());
  if not v_capacity.has_active_subscription then
    raise exception 'COACH_PACKAGE_INACTIVE';
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

revoke all on function public.reactivate_assigned_client(uuid) from public, anon;
grant execute on function public.reactivate_assigned_client(uuid) to authenticated;

notify pgrst, 'reload schema';
