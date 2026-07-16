-- Dedicated coach notes for client detail tabs.
-- This migration is intentionally not applied automatically by Codex.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('generale', 'allenamento', 'nutrizione', 'obiettivo', 'limitazione', 'appuntamento', 'progressi', 'altro')),
  content text not null check (length(trim(content)) > 0),
  visibility text not null default 'coach_only' check (visibility in ('coach_only', 'shared')),
  plan_id uuid references public.workout_plans(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (coach_id <> client_id)
);

create index if not exists client_notes_coach_client_created_idx
  on public.client_notes(coach_id, client_id, created_at desc)
  where deleted_at is null;

create index if not exists client_notes_client_shared_idx
  on public.client_notes(client_id, created_at desc)
  where deleted_at is null and visibility = 'shared';

create index if not exists client_notes_plan_id_idx on public.client_notes(plan_id);
create index if not exists client_notes_appointment_id_idx on public.client_notes(appointment_id);

-- Preserve legacy one-field client notes as private coach notes.
insert into public.client_notes (
  coach_id,
  client_id,
  category,
  content,
  visibility,
  created_by,
  created_at,
  updated_by,
  updated_at
)
select
  coach_clients.coach_id,
  client_profiles.user_id,
  'generale',
  trim(client_profiles.notes),
  'coach_only',
  coach_clients.coach_id,
  coalesce(client_profiles.created_at, now()),
  coach_clients.coach_id,
  coalesce(client_profiles.updated_at, now())
from public.client_profiles
join public.coach_clients
  on coach_clients.client_id = client_profiles.user_id
 and coach_clients.status = 'active'
where nullif(trim(coalesce(client_profiles.notes, '')), '') is not null
  and not exists (
    select 1 from public.client_notes
    where client_notes.coach_id = coach_clients.coach_id
      and client_notes.client_id = client_profiles.user_id
      and client_notes.category = 'generale'
      and client_notes.visibility = 'coach_only'
      and client_notes.content = trim(client_profiles.notes)
      and client_notes.plan_id is null
      and client_notes.appointment_id is null
      and client_notes.deleted_at is null
  );

drop trigger if exists client_notes_set_updated_at on public.client_notes;
create trigger client_notes_set_updated_at before update on public.client_notes
  for each row execute function public.set_updated_at();

alter table public.client_notes enable row level security;

drop policy if exists client_notes_superadmin_all on public.client_notes;
create policy client_notes_superadmin_all on public.client_notes
  for all using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists client_notes_coach_select on public.client_notes;
create policy client_notes_coach_select on public.client_notes
  for select using (
    deleted_at is null
    and coach_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = auth.uid()
        and coach_clients.client_id = client_notes.client_id
        and coach_clients.status = 'active'
    )
  );

drop policy if exists client_notes_coach_insert on public.client_notes;
create policy client_notes_coach_insert on public.client_notes
  for insert with check (
    coach_id = auth.uid()
    and created_by = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = auth.uid()
        and coach_clients.client_id = client_notes.client_id
        and coach_clients.status = 'active'
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.workout_plans
        where workout_plans.id = client_notes.plan_id
          and workout_plans.coach_id = auth.uid()
          and workout_plans.client_id = client_notes.client_id
      )
    )
    and (
      appointment_id is null
      or exists (
        select 1 from public.appointments
        where appointments.id = client_notes.appointment_id
          and appointments.coach_id = auth.uid()
          and appointments.client_id = client_notes.client_id
      )
    )
  );

drop policy if exists client_notes_coach_update on public.client_notes;
create policy client_notes_coach_update on public.client_notes
  for update using (
    coach_id = auth.uid()
    and deleted_at is null
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = auth.uid()
        and coach_clients.client_id = client_notes.client_id
        and coach_clients.status = 'active'
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.coach_clients
      where coach_clients.coach_id = auth.uid()
        and coach_clients.client_id = client_notes.client_id
        and coach_clients.status = 'active'
    )
    and (
      plan_id is null
      or exists (
        select 1 from public.workout_plans
        where workout_plans.id = client_notes.plan_id
          and workout_plans.coach_id = auth.uid()
          and workout_plans.client_id = client_notes.client_id
      )
    )
    and (
      appointment_id is null
      or exists (
        select 1 from public.appointments
        where appointments.id = client_notes.appointment_id
          and appointments.coach_id = auth.uid()
          and appointments.client_id = client_notes.client_id
      )
    )
  );

drop policy if exists client_notes_client_shared_read on public.client_notes;
create policy client_notes_client_shared_read on public.client_notes
  for select using (
    client_id = auth.uid()
    and visibility = 'shared'
    and deleted_at is null
  );
