-- Align BIA storage ownership with the authenticated uploader.
-- Not applied automatically by Codex.

drop policy if exists bia_reports_storage_client_insert on storage.objects;
create policy bia_reports_storage_client_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists bia_reports_storage_client_select on storage.objects;
create policy bia_reports_storage_client_select on storage.objects
for select to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists bia_reports_storage_client_update on storage.objects;
create policy bia_reports_storage_client_update on storage.objects
for update to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists bia_reports_storage_client_delete on storage.objects;
create policy bia_reports_storage_client_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'bia-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists bia_reports_storage_coach_linked_select on storage.objects;
create policy bia_reports_storage_coach_linked_select on storage.objects
for select to authenticated
using (
  bucket_id = 'bia-reports'
  and exists (
    select 1
    from public.bia_reports
    join public.coach_clients
      on coach_clients.coach_id = bia_reports.coach_id
     and coach_clients.client_id = bia_reports.client_id
     and coach_clients.status = 'active'
    where bia_reports.storage_path = storage.objects.name
      and bia_reports.coach_id = auth.uid()
  )
);

drop policy if exists bia_reports_storage_coach_linked_delete on storage.objects;
create policy bia_reports_storage_coach_linked_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'bia-reports'
  and exists (
    select 1
    from public.bia_reports
    join public.coach_clients
      on coach_clients.coach_id = bia_reports.coach_id
     and coach_clients.client_id = bia_reports.client_id
     and coach_clients.status = 'active'
    where bia_reports.storage_path = storage.objects.name
      and bia_reports.coach_id = auth.uid()
  )
);
