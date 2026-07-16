-- Ensure appointments use the same coach-client relation as the mobile form.
-- Not applied automatically by Codex.

alter table public.appointments
  add column if not exists type text not null default 'workout',
  add column if not exists workout_session_id uuid references public.workout_plans(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_type_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_type_check
      check (type in ('workout', 'extra_session', 'consultation', 'checkin'));
  end if;
end $$;

create index if not exists appointments_workout_session_id_idx
  on public.appointments(workout_session_id);

drop policy if exists appointments_coach_scope on public.appointments;
create policy appointments_coach_scope on public.appointments
for all
using (
  coach_id = auth.uid()
)
with check (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = appointments.client_id
      and coach_clients.status = 'active'
  )
  and (
    appointments.workout_session_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = appointments.workout_session_id
        and workout_plans.coach_id = auth.uid()
        and workout_plans.client_id = appointments.client_id
    )
  )
);
