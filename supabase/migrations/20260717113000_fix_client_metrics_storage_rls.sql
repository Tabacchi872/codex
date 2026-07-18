-- Fix client-side BIA uploads without weakening RLS.
-- Not applied automatically by Codex.

alter table public.bia_reports enable row level security;
alter table public.client_measurements enable row level security;

drop policy if exists bia_reports_client_insert on public.bia_reports;
create policy bia_reports_client_insert on public.bia_reports
for insert to authenticated
with check (
  client_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = bia_reports.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_client_read_own on public.bia_reports;
create policy bia_reports_client_read_own on public.bia_reports
for select to authenticated
using (client_id = auth.uid());

drop policy if exists bia_reports_client_confirm_own on public.bia_reports;
create policy bia_reports_client_confirm_own on public.bia_reports
for update to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

drop policy if exists client_measurements_client_insert on public.client_measurements;
create policy client_measurements_client_insert on public.client_measurements
for insert to authenticated
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = client_measurements.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_storage_client_insert on storage.objects;
create policy bia_reports_storage_client_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id::text = (storage.foldername(name))[1]
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_storage_client_select on storage.objects;
create policy bia_reports_storage_client_select on storage.objects
for select to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id::text = (storage.foldername(name))[1]
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
);

drop policy if exists bia_reports_storage_client_delete on storage.objects;
create policy bia_reports_storage_client_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id::text = (storage.foldername(name))[1]
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
);
