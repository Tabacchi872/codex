-- Corregge il runtime temporaneo YMove per supportare la libreria FitCoach
-- storica basata su exercise_id testuali in exercise_movement_metadata,
-- workout_template_exercises e workout_day_exercises.
-- Non modifica esercizi, template, schede o storico.

alter table public.ymove_audit_results
  add column if not exists fitcoach_exercise_key text;

update public.ymove_audit_results
set fitcoach_exercise_key = fitcoach_exercise_id::text
where fitcoach_exercise_key is null;

alter table public.ymove_audit_results
  alter column fitcoach_exercise_key set not null;

alter table public.ymove_audit_results
  drop constraint if exists ymove_audit_results_pkey;

alter table public.ymove_audit_results
  alter column fitcoach_exercise_id drop not null;

alter table public.ymove_audit_results
  add constraint ymove_audit_results_pkey primary key (audit_run_id, fitcoach_exercise_key);

create index if not exists ymove_audit_results_uuid_idx
  on public.ymove_audit_results(audit_run_id, fitcoach_exercise_id)
  where fitcoach_exercise_id is not null;

alter table public.ymove_audit_results
  add constraint ymove_audit_results_key_not_empty
  check (length(trim(fitcoach_exercise_key)) > 0);

notify pgrst, 'reload schema';
