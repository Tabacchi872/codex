-- Exercise catalog metadata for grouped selector and future Creator Program review.
-- This migration is intentionally not applied automatically by Codex.

alter table public.exercises add column if not exists slug text;
alter table public.exercises add column if not exists name_en text;
alter table public.exercises add column if not exists primary_muscle_group text;
alter table public.exercises add column if not exists secondary_muscle_groups text[] not null default '{}';
alter table public.exercises add column if not exists common_mistakes text;
alter table public.exercises add column if not exists image_url text;
alter table public.exercises add column if not exists thumbnail_url text;
alter table public.exercises add column if not exists active boolean not null default true;
alter table public.exercises add column if not exists visibility text not null default 'coach_private'
  check (visibility in ('global', 'coach_private'));
alter table public.exercises add column if not exists aliases text[] not null default '{}';
alter table public.exercises add column if not exists canonical_id uuid references public.exercises(id) on delete set null;
alter table public.exercises add column if not exists review_status text not null default 'private'
  check (review_status in ('private', 'submitted', 'approved', 'rejected'));

update public.exercises
set visibility = case when source = 'ymove' then 'global' else 'coach_private' end
where visibility is null
   or (source = 'ymove' and visibility <> 'global')
   or (source = 'custom' and visibility <> 'coach_private');

create index if not exists exercises_primary_muscle_group_idx on public.exercises(primary_muscle_group);
create index if not exists exercises_active_source_idx on public.exercises(active, source);
create index if not exists exercises_visibility_idx on public.exercises(visibility);
create unique index if not exists exercises_slug_unique on public.exercises(slug) where slug is not null;

drop policy if exists exercises_global_active_read_all on public.exercises;
create policy exercises_global_active_read_all on public.exercises
  for select using (
    auth.uid() is not null
    and active = true
    and visibility = 'global'
  );

-- Replace the broad custom-client read with assignment-scoped access:
-- a client can read a private custom exercise only when it is included in one
-- of their workout plan rows.
drop policy if exists exercises_client_read_own_coach on public.exercises;
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
      where workout_day_exercises.exercise_id = exercises.id::text
        and workout_plans.client_id = auth.uid()
        and workout_plans.coach_id = exercises.coach_id
    )
  );

notify pgrst, 'reload schema';
