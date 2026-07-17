-- Anatomical muscle map metadata for exercise detail and custom exercises.
-- This migration is intentionally not applied automatically by Codex.

alter table public.exercises add column if not exists primary_muscles text[] not null default '{}';
alter table public.exercises add column if not exists secondary_muscles text[] not null default '{}';

alter table public.exercises drop constraint if exists exercises_primary_muscles_valid;
alter table public.exercises add constraint exercises_primary_muscles_valid
  check (
    primary_muscles <@ array[
      'chest',
      'upper_chest',
      'lats',
      'upper_back',
      'traps',
      'front_deltoids',
      'side_deltoids',
      'rear_deltoids',
      'biceps',
      'triceps',
      'forearms',
      'abs',
      'obliques',
      'lower_back',
      'glutes',
      'quadriceps',
      'hamstrings',
      'adductors',
      'abductors',
      'calves',
      'hip_flexors',
      'full_body'
    ]::text[]
  );

alter table public.exercises drop constraint if exists exercises_secondary_muscles_valid;
alter table public.exercises add constraint exercises_secondary_muscles_valid
  check (
    secondary_muscles <@ array[
      'chest',
      'upper_chest',
      'lats',
      'upper_back',
      'traps',
      'front_deltoids',
      'side_deltoids',
      'rear_deltoids',
      'biceps',
      'triceps',
      'forearms',
      'abs',
      'obliques',
      'lower_back',
      'glutes',
      'quadriceps',
      'hamstrings',
      'adductors',
      'abductors',
      'calves',
      'hip_flexors',
      'full_body'
    ]::text[]
  );

create index if not exists exercises_primary_muscles_gin_idx on public.exercises using gin(primary_muscles);
create index if not exists exercises_secondary_muscles_gin_idx on public.exercises using gin(secondary_muscles);

notify pgrst, 'reload schema';
