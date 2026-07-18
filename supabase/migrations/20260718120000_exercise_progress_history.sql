-- Persisted exercise load history shared between coach and client.
-- Not applied automatically by Codex.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_exercise_progress_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.coach_id <> old.coach_id
    or new.client_id <> old.client_id
    or new.created_by <> old.created_by
    or new.created_by_role <> old.created_by_role
  then
    raise exception 'EXERCISE_PROGRESS_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create table if not exists public.exercise_progress_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  workout_plan_id uuid references public.workout_plans(id) on delete set null,
  performed_at timestamptz not null default now(),
  session_date date not null,
  set_number integer not null,
  reps_completed integer not null,
  weight_kg numeric not null,
  rest_seconds integer,
  notes text,
  perceived_effort numeric,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_role text not null check (created_by_role in ('coach', 'client')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (set_number > 0),
  check (reps_completed > 0),
  check (weight_kg > 0),
  check (rest_seconds is null or rest_seconds >= 0),
  check (perceived_effort is null or perceived_effort between 0 and 10)
);

create index if not exists exercise_progress_client_session_idx
  on public.exercise_progress_history(client_id, session_date desc);

create index if not exists exercise_progress_client_exercise_session_idx
  on public.exercise_progress_history(client_id, exercise_id, session_date desc);

create index if not exists exercise_progress_coach_client_idx
  on public.exercise_progress_history(coach_id, client_id);

create index if not exists exercise_progress_workout_plan_idx
  on public.exercise_progress_history(workout_plan_id);

drop trigger if exists exercise_progress_history_set_updated_at on public.exercise_progress_history;
create trigger exercise_progress_history_set_updated_at before update on public.exercise_progress_history
for each row execute function public.set_updated_at();

drop trigger if exists exercise_progress_identity_immutable on public.exercise_progress_history;
create trigger exercise_progress_identity_immutable before update on public.exercise_progress_history
for each row execute function public.prevent_exercise_progress_identity_change();

alter table public.exercise_progress_history enable row level security;

drop policy if exists exercise_progress_superadmin_all on public.exercise_progress_history;
create policy exercise_progress_superadmin_all on public.exercise_progress_history
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists exercise_progress_client_select_own on public.exercise_progress_history;
create policy exercise_progress_client_select_own on public.exercise_progress_history
for select
using (client_id = auth.uid());

drop policy if exists exercise_progress_coach_select_linked on public.exercise_progress_history;
create policy exercise_progress_coach_select_linked on public.exercise_progress_history
for select
using (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
);

drop policy if exists exercise_progress_client_insert_own on public.exercise_progress_history;
create policy exercise_progress_client_insert_own on public.exercise_progress_history
for insert
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = exercise_progress_history.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
  and (
    workout_plan_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = exercise_progress_history.workout_plan_id
        and workout_plans.coach_id = exercise_progress_history.coach_id
        and workout_plans.client_id = auth.uid()
    )
  )
);

drop policy if exists exercise_progress_coach_insert_linked on public.exercise_progress_history;
create policy exercise_progress_coach_insert_linked on public.exercise_progress_history
for insert
with check (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
  and (
    workout_plan_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = exercise_progress_history.workout_plan_id
        and workout_plans.coach_id = auth.uid()
        and workout_plans.client_id = exercise_progress_history.client_id
    )
  )
);

drop policy if exists exercise_progress_client_update_own_created on public.exercise_progress_history;
create policy exercise_progress_client_update_own_created on public.exercise_progress_history
for update
using (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
)
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
);

drop policy if exists exercise_progress_coach_update_own_created on public.exercise_progress_history;
create policy exercise_progress_coach_update_own_created on public.exercise_progress_history
for update
using (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
)
with check (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
);

drop policy if exists exercise_progress_client_delete_own_created on public.exercise_progress_history;
create policy exercise_progress_client_delete_own_created on public.exercise_progress_history
for delete
using (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
);

drop policy if exists exercise_progress_coach_delete_own_created on public.exercise_progress_history;
create policy exercise_progress_coach_delete_own_created on public.exercise_progress_history
for delete
using (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
);
