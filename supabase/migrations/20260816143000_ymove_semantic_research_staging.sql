-- Staging-only fields for semantic YMove exercise review.
-- This does not import exercises, create definitive links, or modify workout data.

alter table public.ymove_library_import_candidates
  add column if not exists researched_italian_name text,
  add column if not exists researched_italian_aliases jsonb not null default '[]'::jsonb,
  add column if not exists english_aliases jsonb not null default '[]'::jsonb,
  add column if not exists research_status text,
  add column if not exists research_sources jsonb not null default '[]'::jsonb,
  add column if not exists technical_fingerprint jsonb not null default '{}'::jsonb,
  add column if not exists technical_variant jsonb not null default '{}'::jsonb,
  add column if not exists match_reason text,
  add column if not exists contradiction_flags jsonb not null default '[]'::jsonb,
  add column if not exists compared_existing_exercise_key text,
  add column if not exists primary_duplicate_external_id text,
  add column if not exists candidate_rejected_reason text,
  add column if not exists source_confidence integer,
  add column if not exists semantic_review_status text,
  add column if not exists research_algorithm_version text,
  add column if not exists researched_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ymove_library_import_candidates_research_status_check'
      and conrelid = 'public.ymove_library_import_candidates'::regclass
  ) then
    alter table public.ymove_library_import_candidates
      add constraint ymove_library_import_candidates_research_status_check
      check (
        research_status is null
        or research_status = any (array[
          'LINK_EXISTING_VERIFIED',
          'REVIEW_POSSIBLE_MATCH',
          'CREATE_NEW_RESEARCHED',
          'RESEARCH_REQUIRED',
          'EXCLUDE_EDITORIAL_DUPLICATE',
          'CONFLICT'
        ])
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ymove_library_import_candidates_semantic_review_status_check'
      and conrelid = 'public.ymove_library_import_candidates'::regclass
  ) then
    alter table public.ymove_library_import_candidates
      add constraint ymove_library_import_candidates_semantic_review_status_check
      check (
        semantic_review_status is null
        or semantic_review_status = any (array[
          'LINK_EXISTING_VERIFIED',
          'REVIEW_POSSIBLE_MATCH',
          'CREATE_NEW_RESEARCHED',
          'RESEARCH_REQUIRED',
          'EXCLUDE_EDITORIAL_DUPLICATE',
          'CONFLICT'
        ])
      );
  end if;
end $$;

create index if not exists ymove_library_import_candidates_research_status_idx
  on public.ymove_library_import_candidates(import_run_id, research_status);

create index if not exists ymove_library_import_candidates_semantic_review_status_idx
  on public.ymove_library_import_candidates(import_run_id, semantic_review_status);
