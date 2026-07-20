create or replace function public.update_workout_session_progress(
  p_plan_id uuid,
  p_session_status text default null,
  p_started_at timestamptz default null,
  p_clear_started_at boolean default false,
  p_completed_at timestamptz default null,
  p_duration_seconds integer default null,
  p_completed_exercise_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.workout_plans%rowtype;
  v_day_id uuid;
  v_client_has_active_link boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if p_session_status is not null and p_session_status not in ('todo', 'completed', 'skipped', 'cancelled') then
    raise exception 'INVALID_PAYLOAD: stato sessione non valido';
  end if;

  select * into v_plan from public.workout_plans where id = p_plan_id;
  if not found then
    raise exception 'NOT_FOUND: scheda non trovata';
  end if;

  select exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = v_plan.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  ) into v_client_has_active_link;

  if v_plan.coach_id <> auth.uid()
     and not (v_plan.client_id = auth.uid() and v_client_has_active_link)
     and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non autorizzato su questa scheda';
  end if;

  update public.workout_plans set
    session_status = coalesce(p_session_status, session_status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = p_plan_id;

  if p_completed_exercise_ids is not null then
    select id into v_day_id from public.workout_days where workout_plan_id = p_plan_id and day_order = 1;
    if v_day_id is not null then
      update public.workout_day_exercises set completed = (id = any (p_completed_exercise_ids))
      where workout_day_id = v_day_id;
    end if;
  end if;
end;
$$;

revoke all on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

drop policy if exists exercise_videos_client_read_own_coach on public.exercise_videos;
create policy exercise_videos_client_read_own_coach on public.exercise_videos
  for select using (
    exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercise_videos.coach_id
        and coach_clients.status = 'active'
    )
  );

drop policy if exists exercises_client_read_own_coach on public.exercises;
create policy exercises_client_read_own_coach on public.exercises
  for select using (
    source = 'custom'
    and active = true
    and visibility = 'coach_private'
    and exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercises.coach_id
        and coach_clients.status = 'active'
    )
  );

notify pgrst, 'reload schema';
