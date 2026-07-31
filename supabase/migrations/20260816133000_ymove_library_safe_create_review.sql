-- Flag staging per distinguere i CREATE_NEW potenzialmente sicuri dagli
-- esercizi che richiedono revisione. Non scrive in public.exercises.

alter table public.ymove_library_import_candidates
  add column if not exists safe_create boolean not null default false;

create index if not exists ymove_library_import_candidates_safe_create_idx
  on public.ymove_library_import_candidates(import_run_id, safe_create)
  where classification = 'CREATE_NEW';

notify pgrst, 'reload schema';
