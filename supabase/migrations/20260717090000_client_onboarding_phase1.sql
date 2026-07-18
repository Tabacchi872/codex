-- Client onboarding phase 1.
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

create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.profiles(id) on delete cascade,
  client_mode text check (client_mode in ('coach_guided', 'self_guided')),
  onboarding_completed boolean not null default false,
  gender text check (gender in ('male', 'female', 'unspecified')),
  goals text[] not null default '{}'::text[],
  focus_areas text[] not null default '{}'::text[],
  training_reasons text[] not null default '{}'::text[],
  experience_level text check (experience_level in ('beginner', 'novice', 'intermediate', 'advanced', 'competitive')),
  training_days_per_week integer check (training_days_per_week between 1 and 7),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 30 and 300),
  height_cm numeric(6,2) check (height_cm is null or height_cm between 120 and 230),
  bmi numeric(4,1) check (bmi is null or bmi between 8 and 80),
  bmi_category text check (bmi_category in ('Sottopeso', 'Normopeso', 'Sovrappeso', 'Obesita')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    onboarding_completed = false
    or (
      client_mode = 'coach_guided'
      and completed_at is not null
    )
    or (
      client_mode = 'self_guided'
      and completed_at is not null
      and gender is not null
      and cardinality(goals) > 0
      and cardinality(focus_areas) > 0
      and cardinality(training_reasons) > 0
      and experience_level is not null
      and training_days_per_week is not null
      and weight_kg is not null
      and height_cm is not null
      and bmi is not null
      and bmi_category is not null
    )
  )
);

create index if not exists client_onboarding_mode_idx on public.client_onboarding(client_mode);

drop trigger if exists client_onboarding_set_updated_at on public.client_onboarding;
create trigger client_onboarding_set_updated_at before update on public.client_onboarding
for each row execute function public.set_updated_at();

alter table public.client_onboarding enable row level security;

drop policy if exists client_onboarding_superadmin_all on public.client_onboarding;
create policy client_onboarding_superadmin_all on public.client_onboarding
for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_onboarding_owner_read on public.client_onboarding;
create policy client_onboarding_owner_read on public.client_onboarding
for select to authenticated
using (
  client_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'cliente'
  )
);

drop policy if exists client_onboarding_owner_insert on public.client_onboarding;
create policy client_onboarding_owner_insert on public.client_onboarding
for insert to authenticated
with check (
  client_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'cliente'
  )
);

drop policy if exists client_onboarding_owner_update on public.client_onboarding;
create policy client_onboarding_owner_update on public.client_onboarding
for update to authenticated
using (
  client_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'cliente'
  )
)
with check (
  client_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'cliente'
  )
);

-- Preserve existing behavior: clients already linked to a coach are considered
-- coach-guided and completed, so they are not forced into the new onboarding.
insert into public.client_onboarding (
  client_id,
  client_mode,
  onboarding_completed,
  completed_at,
  created_at,
  updated_at
)
select distinct
  coach_clients.client_id,
  'coach_guided',
  true,
  now(),
  now(),
  now()
from public.coach_clients
join public.profiles on profiles.id = coach_clients.client_id
where coach_clients.status = 'active'
  and profiles.role = 'cliente'
on conflict (client_id) do nothing;
