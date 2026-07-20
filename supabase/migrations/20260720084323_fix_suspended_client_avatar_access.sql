drop policy if exists client_avatars_assigned_coach_select on storage.objects;

create policy client_avatars_assigned_coach_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-avatars'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id::text = (storage.foldername(name))[1]
      and coach_clients.status in ('active', 'suspended')
  )
);
