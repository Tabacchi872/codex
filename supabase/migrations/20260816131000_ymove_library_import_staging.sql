-- Staging non distruttivo per ampliare la libreria esercizi FitCoach usando
-- il catalogo YMove gia salvato negli audit. Non scrive in public.exercises,
-- non modifica schede, template, storico o riferimenti legacy.

create table if not exists public.exercise_identity_keys (
  key text primary key,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  key_type text not null,
  provider text not null default 'fitcoach',
  created_at timestamptz not null default now(),
  is_primary boolean not null default false,
  constraint exercise_identity_keys_key_type_check check (key_type in ('uuid', 'legacy', 'provider')),
  constraint exercise_identity_keys_provider_check check (provider in ('fitcoach', 'legacy', 'ymove'))
);

create unique index if not exists exercise_identity_keys_one_primary_per_exercise
  on public.exercise_identity_keys(exercise_id)
  where is_primary;

create index if not exists exercise_identity_keys_exercise_id_idx
  on public.exercise_identity_keys(exercise_id);

create table if not exists public.ymove_library_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_audit_run_id uuid not null references public.ymove_audit_runs(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'created',
  total_catalog integer not null default 0,
  processed_count integer not null default 0,
  link_existing_count integer not null default 0,
  create_new_count integer not null default 0,
  review_count integer not null default 0,
  excluded_count integer not null default 0,
  conflict_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ymove_library_import_runs_status_check check (
    status in ('created', 'analyzing', 'review_ready', 'applying', 'completed', 'failed', 'cancelled')
  )
);

create index if not exists ymove_library_import_runs_created_by_idx
  on public.ymove_library_import_runs(created_by, created_at desc);

create table if not exists public.ymove_library_import_candidates (
  import_run_id uuid not null references public.ymove_library_import_runs(id) on delete restrict,
  external_exercise_id text not null,
  ymove_title text not null,
  proposed_italian_name text,
  classification text not null,
  existing_exercise_id uuid references public.exercises(id) on delete restrict,
  existing_exercise_key text,
  score numeric(5,2),
  score_gap numeric(5,2),
  reasons jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  translation_status text not null default 'generated',
  proposed_payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (import_run_id, external_exercise_id),
  constraint ymove_library_import_candidates_classification_check check (
    classification in ('LINK_EXISTING', 'CREATE_NEW', 'REVIEW_POSSIBLE_DUPLICATE', 'EXCLUDE_NOT_RELEVANT', 'CONFLICT')
  ),
  constraint ymove_library_import_candidates_translation_check check (
    translation_status in ('verified', 'generated', 'review_required')
  ),
  constraint ymove_library_import_candidates_decision_check check (
    decision is null or decision in ('approved_new', 'approved_link', 'excluded', 'deferred', 'rejected')
  )
);

create index if not exists ymove_library_import_candidates_classification_idx
  on public.ymove_library_import_candidates(import_run_id, classification);

create index if not exists ymove_library_import_candidates_existing_idx
  on public.ymove_library_import_candidates(existing_exercise_id)
  where existing_exercise_id is not null;

alter table public.exercise_identity_keys enable row level security;
alter table public.ymove_library_import_runs enable row level security;
alter table public.ymove_library_import_candidates enable row level security;

drop policy if exists exercise_identity_keys_superadmin_read on public.exercise_identity_keys;
create policy exercise_identity_keys_superadmin_read on public.exercise_identity_keys
  for select using (public.is_superadmin());

drop policy if exists ymove_library_import_runs_superadmin_read on public.ymove_library_import_runs;
create policy ymove_library_import_runs_superadmin_read on public.ymove_library_import_runs
  for select using (public.is_superadmin());

drop policy if exists ymove_library_import_candidates_superadmin_read on public.ymove_library_import_candidates;
create policy ymove_library_import_candidates_superadmin_read on public.ymove_library_import_candidates
  for select using (public.is_superadmin());

revoke all on public.exercise_identity_keys from public, anon;
revoke all on public.ymove_library_import_runs from public, anon;
revoke all on public.ymove_library_import_candidates from public, anon;

grant select on public.exercise_identity_keys to authenticated;
grant select on public.ymove_library_import_runs to authenticated;
grant select on public.ymove_library_import_candidates to authenticated;

notify pgrst, 'reload schema';
