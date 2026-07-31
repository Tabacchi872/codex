-- Runtime non definitivo per rieseguire il matching YMove sul catalogo
-- gia salvato, senza richiamare l'API YMove e senza modificare esercizi,
-- schede, template, storico o associazioni definitive.

alter table public.ymove_audit_runs
  add column if not exists source_audit_run_id uuid references public.ymove_audit_runs(id),
  add column if not exists algorithm_version text,
  add column if not exists run_mode text not null default 'full_audit';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ymove_audit_runs_run_mode_check'
      and conrelid = 'public.ymove_audit_runs'::regclass
  ) then
    alter table public.ymove_audit_runs
      add constraint ymove_audit_runs_run_mode_check
      check (run_mode in ('full_audit', 'rematch'));
  end if;
end $$;

create index if not exists ymove_audit_runs_source_idx
  on public.ymove_audit_runs(source_audit_run_id);

alter table public.ymove_audit_results
  add column if not exists candidate_count integer,
  add column if not exists rejection_reason text,
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists algorithm_version text;

notify pgrst, 'reload schema';
