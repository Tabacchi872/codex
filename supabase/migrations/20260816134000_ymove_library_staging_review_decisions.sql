-- Decisioni Superadmin solo staging per candidati YMove.
-- Non abilita import reale e non scrive in public.exercises.

alter table public.ymove_library_import_candidates
  add column if not exists approved_italian_name text,
  add column if not exists approved_existing_exercise_key text,
  add column if not exists review_note text;

create index if not exists ymove_library_import_candidates_decision_idx
  on public.ymove_library_import_candidates(import_run_id, decision)
  where decision is not null;

notify pgrst, 'reload schema';
