-- Client metrics and private BIA PDF reports.
-- Not applied automatically by Codex.

create table if not exists public.bia_reports (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  mime_type text,
  file_size bigint,
  file_hash text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'extracted', 'needs_review', 'confirmed', 'failed')),
  extracted_text text,
  extracted_data jsonb,
  extraction_confidence jsonb,
  extraction_provider text,
  error_code text,
  error_message text,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id, file_hash)
);

create table if not exists public.client_measurements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  bia_report_id uuid references public.bia_reports(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'bia_pdf', 'imported')),
  measured_at timestamptz not null,
  weight_kg numeric,
  height_cm numeric,
  bmi numeric,
  body_fat_percent numeric,
  body_fat_kg numeric,
  lean_mass_kg numeric,
  muscle_mass_kg numeric,
  skeletal_muscle_mass_kg numeric,
  total_body_water_percent numeric,
  total_body_water_l numeric,
  intracellular_water_l numeric,
  extracellular_water_l numeric,
  visceral_fat numeric,
  basal_metabolic_rate_kcal numeric,
  phase_angle numeric,
  waist_cm numeric,
  hips_cm numeric,
  chest_cm numeric,
  left_arm_cm numeric,
  right_arm_cm numeric,
  left_thigh_cm numeric,
  right_thigh_cm numeric,
  left_calf_cm numeric,
  right_calf_cm numeric,
  device_brand text,
  device_model text,
  measurement_location text,
  coach_comment text,
  client_visible_comment text,
  raw_optional_metrics jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weight_kg is null or weight_kg > 0),
  check (height_cm is null or height_cm between 80 and 260),
  check (bmi is null or bmi between 8 and 80),
  check (body_fat_percent is null or body_fat_percent between 0 and 100),
  check (total_body_water_percent is null or total_body_water_percent between 0 and 100),
  check (body_fat_kg is null or weight_kg is null or body_fat_kg <= weight_kg * 1.05),
  check (lean_mass_kg is null or weight_kg is null or lean_mass_kg <= weight_kg * 1.1),
  check (muscle_mass_kg is null or weight_kg is null or muscle_mass_kg <= weight_kg * 1.1),
  check (waist_cm is null or waist_cm > 0),
  check (hips_cm is null or hips_cm > 0),
  check (chest_cm is null or chest_cm > 0)
);

create index if not exists bia_reports_coach_client_idx on public.bia_reports(coach_id, client_id, created_at desc);
create index if not exists bia_reports_status_idx on public.bia_reports(status);
create index if not exists client_measurements_client_measured_idx on public.client_measurements(client_id, measured_at desc);
create index if not exists client_measurements_coach_client_idx on public.client_measurements(coach_id, client_id);

drop trigger if exists bia_reports_set_updated_at on public.bia_reports;
create trigger bia_reports_set_updated_at before update on public.bia_reports
for each row execute function public.set_updated_at();

drop trigger if exists client_measurements_set_updated_at on public.client_measurements;
create trigger client_measurements_set_updated_at before update on public.client_measurements
for each row execute function public.set_updated_at();

alter table public.bia_reports enable row level security;
alter table public.client_measurements enable row level security;

drop policy if exists bia_reports_superadmin_all on public.bia_reports;
create policy bia_reports_superadmin_all on public.bia_reports
for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists bia_reports_coach_scope on public.bia_reports;
create policy bia_reports_coach_scope on public.bia_reports
for all
using (
  coach_id = auth.uid()
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = bia_reports.coach_id
      and coach_clients.client_id = bia_reports.client_id
      and coach_clients.status = 'active'
  )
)
with check (
  coach_id = auth.uid()
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = bia_reports.client_id
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_client_read_confirmed on public.bia_reports;
create policy bia_reports_client_read_confirmed on public.bia_reports
for select using (client_id = auth.uid() and status = 'confirmed');

drop policy if exists client_measurements_superadmin_all on public.client_measurements;
create policy client_measurements_superadmin_all on public.client_measurements
for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_measurements_coach_scope on public.client_measurements;
create policy client_measurements_coach_scope on public.client_measurements
for all
using (
  coach_id = auth.uid()
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = client_measurements.coach_id
      and coach_clients.client_id = client_measurements.client_id
      and coach_clients.status = 'active'
  )
)
with check (
  coach_id = auth.uid()
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = client_measurements.client_id
      and coach_clients.status = 'active'
  )
);

drop policy if exists client_measurements_client_read on public.client_measurements;
create policy client_measurements_client_read on public.client_measurements
for select using (
  client_id = auth.uid()
  and (
    bia_report_id is null
    or exists (
      select 1 from public.bia_reports
      where bia_reports.id = client_measurements.bia_report_id
        and bia_reports.status = 'confirmed'
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bia-reports', 'bia-reports', false, 18874368, array['application/pdf']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bia_reports_storage_coach_insert on storage.objects;
create policy bia_reports_storage_coach_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id::text = (storage.foldername(name))[2]
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_storage_coach_select on storage.objects;
create policy bia_reports_storage_coach_select on storage.objects
for select to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id::text = (storage.foldername(name))[2]
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_storage_coach_delete on storage.objects;
create policy bia_reports_storage_coach_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists bia_reports_storage_client_select on storage.objects;
create policy bia_reports_storage_client_select on storage.objects
for select to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[2] = auth.uid()::text
);
