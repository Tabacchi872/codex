-- Proposta non distruttiva: catalogo esterno YMove e audit matching severo.
-- Non applicare al database remoto prima della revisione.

create table if not exists public.ymove_exercise_catalog (
  ymove_exercise_id text primary key,
  title text not null,
  normalized_title text not null,
  slug text,
  description text,
  instructions text[],
  important_points text[],
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  muscle_groups text[] not null default '{}',
  equipment text,
  exercise_types text[] not null default '{}',
  difficulty text,
  category text,
  body_position text,
  movement_pattern text,
  laterality text,
  source_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  is_available boolean not null default true,
  constraint ymove_exercise_catalog_payload_no_video_urls check (
    not (source_payload ? 'videoUrl')
    and not (source_payload ? 'videoHlsUrl')
    and not (source_payload ? 'thumbnailUrl')
    and not (source_payload ? 'videos')
  )
);

create index if not exists ymove_exercise_catalog_normalized_title_idx on public.ymove_exercise_catalog(normalized_title);
create index if not exists ymove_exercise_catalog_muscle_groups_gin_idx on public.ymove_exercise_catalog using gin(muscle_groups);
create index if not exists ymove_exercise_catalog_exercise_types_gin_idx on public.ymove_exercise_catalog using gin(exercise_types);
create index if not exists ymove_exercise_catalog_available_idx on public.ymove_exercise_catalog(is_available);

create table if not exists public.exercise_external_links (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null,
  provider text not null,
  external_exercise_id text not null,
  match_status text not null default 'review_required',
  match_score numeric(5,2),
  match_method text,
  confidence integer,
  is_primary boolean not null default true,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_external_links_provider_check check (provider in ('ymove')),
  constraint exercise_external_links_status_check check (
    match_status in ('auto_match', 'manual_approved', 'review_required', 'unmatched', 'rejected', 'conflict', 'removed')
  ),
  constraint exercise_external_links_confidence_check check (confidence is null or confidence between 0 and 100)
);

create unique index if not exists exercise_external_links_provider_external_unique
  on public.exercise_external_links(provider, external_exercise_id, exercise_id);

create unique index if not exists exercise_external_links_one_primary_ymove_per_exercise
  on public.exercise_external_links(exercise_id)
  where provider = 'ymove'
    and is_primary
    and match_status in ('auto_match', 'manual_approved');

create index if not exists exercise_external_links_provider_status_idx
  on public.exercise_external_links(provider, match_status);

create table if not exists public.exercise_matching_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_normalized text not null,
  language text not null default 'it',
  exercise_id text,
  canonical_concept text,
  source text not null default 'algorithm',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_matching_aliases_target_check check (exercise_id is not null or canonical_concept is not null)
);

create unique index if not exists exercise_matching_aliases_unique
  on public.exercise_matching_aliases(alias_normalized, language, coalesce(exercise_id, ''), coalesce(canonical_concept, ''));

create table if not exists public.exercise_matching_audit (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null,
  provider text not null default 'ymove',
  candidate_external_exercise_id text,
  candidate_title text,
  score numeric(5,2),
  positive_reasons text[] not null default '{}',
  contradictions text[] not null default '{}',
  outcome text not null,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  constraint exercise_matching_audit_provider_check check (provider in ('ymove')),
  constraint exercise_matching_audit_outcome_check check (outcome in ('AUTO_MATCH', 'REVIEW_REQUIRED', 'UNMATCHED', 'DUPLICATE_OR_CONFLICT'))
);

create index if not exists exercise_matching_audit_exercise_id_idx on public.exercise_matching_audit(exercise_id);
create index if not exists exercise_matching_audit_outcome_idx on public.exercise_matching_audit(outcome);

drop trigger if exists exercise_external_links_set_updated_at on public.exercise_external_links;
create trigger exercise_external_links_set_updated_at before update on public.exercise_external_links
for each row execute function public.set_updated_at();

drop trigger if exists exercise_matching_aliases_set_updated_at on public.exercise_matching_aliases;
create trigger exercise_matching_aliases_set_updated_at before update on public.exercise_matching_aliases
for each row execute function public.set_updated_at();

alter table public.ymove_exercise_catalog enable row level security;
alter table public.exercise_external_links enable row level security;
alter table public.exercise_matching_aliases enable row level security;
alter table public.exercise_matching_audit enable row level security;

drop policy if exists ymove_exercise_catalog_superadmin_all on public.ymove_exercise_catalog;
create policy ymove_exercise_catalog_superadmin_all on public.ymove_exercise_catalog
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists exercise_external_links_superadmin_all on public.exercise_external_links;
create policy exercise_external_links_superadmin_all on public.exercise_external_links
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists exercise_matching_aliases_superadmin_all on public.exercise_matching_aliases;
create policy exercise_matching_aliases_superadmin_all on public.exercise_matching_aliases
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists exercise_matching_audit_superadmin_all on public.exercise_matching_audit;
create policy exercise_matching_audit_superadmin_all on public.exercise_matching_audit
  for all using (public.is_superadmin()) with check (public.is_superadmin());

revoke all on public.ymove_exercise_catalog from public, anon;
revoke all on public.exercise_external_links from public, anon;
revoke all on public.exercise_matching_aliases from public, anon;
revoke all on public.exercise_matching_audit from public, anon;

grant select, insert, update on public.ymove_exercise_catalog to authenticated;
grant select, insert, update on public.exercise_external_links to authenticated;
grant select, insert, update on public.exercise_matching_aliases to authenticated;
grant select, insert on public.exercise_matching_audit to authenticated;

notify pgrst, 'reload schema';
