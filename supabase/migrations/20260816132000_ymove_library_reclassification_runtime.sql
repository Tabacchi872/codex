-- Runtime non distruttivo per riclassificare uno staging import YMove
-- senza richiamare YMove e senza scrivere in public.exercises.

alter table public.ymove_library_import_runs
  add column if not exists source_import_run_id uuid references public.ymove_library_import_runs(id) on delete restrict,
  add column if not exists algorithm_version text,
  add column if not exists run_mode text not null default 'initial_import';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ymove_library_import_runs_run_mode_check'
      and conrelid = 'public.ymove_library_import_runs'::regclass
  ) then
    alter table public.ymove_library_import_runs
      add constraint ymove_library_import_runs_run_mode_check
      check (run_mode in ('initial_import', 'reclassification'));
  end if;
end $$;

create index if not exists ymove_library_import_runs_source_import_idx
  on public.ymove_library_import_runs(source_import_run_id);

alter table public.ymove_library_import_candidates
  add column if not exists algorithm_version text,
  add column if not exists match_source text,
  add column if not exists direct_alias_match boolean not null default false,
  add column if not exists metadata_match jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
