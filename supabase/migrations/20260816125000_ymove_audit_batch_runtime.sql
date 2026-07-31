-- Runtime temporaneo per audit YMove a batch.
-- Non crea collegamenti definitivi e non modifica esercizi, schede, template o storico.

create table if not exists public.ymove_audit_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  status text not null default 'created',
  total_fitcoach integer not null default 0,
  total_ymove_declared integer,
  total_ymove_fetched integer not null default 0,
  total_pages integer,
  pages_completed integer not null default 0,
  exercises_processed integer not null default 0,
  auto_match_count integer not null default 0,
  review_required_count integer not null default 0,
  unmatched_count integer not null default 0,
  conflict_count integer not null default 0,
  usage_before jsonb,
  usage_after jsonb,
  error_code text,
  error_message text,
  failed_page integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ymove_audit_runs_status_check check (
    status in ('created', 'syncing_catalog', 'catalog_ready', 'matching', 'finalizing', 'completed', 'failed', 'cancelled')
  ),
  constraint ymove_audit_runs_counts_non_negative check (
    total_fitcoach >= 0
    and coalesce(total_ymove_declared, 0) >= 0
    and total_ymove_fetched >= 0
    and coalesce(total_pages, 0) >= 0
    and pages_completed >= 0
    and exercises_processed >= 0
    and auto_match_count >= 0
    and review_required_count >= 0
    and unmatched_count >= 0
    and conflict_count >= 0
  )
);

create index if not exists ymove_audit_runs_created_by_status_idx
  on public.ymove_audit_runs(created_by, status, started_at desc);

create table if not exists public.ymove_audit_catalog_items (
  audit_run_id uuid not null references public.ymove_audit_runs(id),
  external_exercise_id text not null,
  title text not null,
  normalized_title text not null,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  movement_pattern text,
  body_position text,
  difficulty text,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  page_number integer not null,
  created_at timestamptz not null default now(),
  primary key (audit_run_id, external_exercise_id),
  constraint ymove_audit_catalog_page_positive check (page_number > 0),
  constraint ymove_audit_catalog_no_forbidden_media check (
    not (
      sanitized_metadata ?| array[
        'apiKey', 'api_key', 'x-api-key', 'X-API-Key',
        'videoUrl', 'video_url', 'hlsUrl', 'hls_url',
        'thumbnailUrl', 'thumbnail_url', 'thumbnail', 'hls'
      ]
    )
  )
);

create index if not exists ymove_audit_catalog_run_page_idx
  on public.ymove_audit_catalog_items(audit_run_id, page_number);

create index if not exists ymove_audit_catalog_run_title_idx
  on public.ymove_audit_catalog_items(audit_run_id, normalized_title);

create table if not exists public.ymove_audit_results (
  audit_run_id uuid not null references public.ymove_audit_runs(id),
  fitcoach_exercise_id uuid not null references public.exercises(id),
  fitcoach_name text not null,
  status text not null,
  candidate_external_id text,
  candidate_title text,
  score numeric,
  second_score numeric,
  score_gap numeric,
  reasons jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  processed_at timestamptz not null default now(),
  primary key (audit_run_id, fitcoach_exercise_id),
  constraint ymove_audit_results_status_check check (status in ('AUTO_MATCH', 'REVIEW_REQUIRED', 'UNMATCHED', 'CONFLICT'))
);

create index if not exists ymove_audit_results_run_status_idx
  on public.ymove_audit_results(audit_run_id, status, fitcoach_name);

alter table public.ymove_audit_runs enable row level security;
alter table public.ymove_audit_catalog_items enable row level security;
alter table public.ymove_audit_results enable row level security;

drop policy if exists ymove_audit_runs_superadmin_owner_read on public.ymove_audit_runs;
create policy ymove_audit_runs_superadmin_owner_read
on public.ymove_audit_runs
for select
using (created_by = auth.uid() and public.is_superadmin());

drop policy if exists ymove_audit_catalog_superadmin_owner_read on public.ymove_audit_catalog_items;
create policy ymove_audit_catalog_superadmin_owner_read
on public.ymove_audit_catalog_items
for select
using (
  exists (
    select 1
    from public.ymove_audit_runs run
    where run.id = ymove_audit_catalog_items.audit_run_id
      and run.created_by = auth.uid()
      and public.is_superadmin()
  )
);

drop policy if exists ymove_audit_results_superadmin_owner_read on public.ymove_audit_results;
create policy ymove_audit_results_superadmin_owner_read
on public.ymove_audit_results
for select
using (
  exists (
    select 1
    from public.ymove_audit_runs run
    where run.id = ymove_audit_results.audit_run_id
      and run.created_by = auth.uid()
      and public.is_superadmin()
  )
);

revoke all on public.ymove_audit_runs from public, anon, authenticated;
revoke all on public.ymove_audit_catalog_items from public, anon, authenticated;
revoke all on public.ymove_audit_results from public, anon, authenticated;

grant select on public.ymove_audit_runs to authenticated;
grant select on public.ymove_audit_catalog_items to authenticated;
grant select on public.ymove_audit_results to authenticated;

create or replace function public.cleanup_old_ymove_audit_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN';
  end if;

  with old_runs as (
    select id
    from public.ymove_audit_runs
    where (status = 'completed' and finished_at < now() - interval '7 days')
       or (status in ('failed', 'cancelled') and updated_at < now() - interval '2 days')
  ),
  deleted_results as (
    delete from public.ymove_audit_results r
    using old_runs o
    where r.audit_run_id = o.id
    returning r.audit_run_id
  ),
  deleted_catalog as (
    delete from public.ymove_audit_catalog_items c
    using old_runs o
    where c.audit_run_id = o.id
    returning c.audit_run_id
  ),
  deleted_runs as (
    delete from public.ymove_audit_runs r
    using old_runs o
    where r.id = o.id
    returning r.id
  )
  select count(*) into v_deleted from deleted_runs;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_old_ymove_audit_runs() from public, anon;
grant execute on function public.cleanup_old_ymove_audit_runs() to authenticated;
