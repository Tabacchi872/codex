alter table public.profiles
  add column if not exists avatar_preset text not null default 'neutral'
    check (avatar_preset in ('male', 'female', 'neutral'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-avatars',
  'client-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_avatars_owner_select on storage.objects;
create policy client_avatars_owner_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists client_avatars_owner_insert on storage.objects;
create policy client_avatars_owner_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists client_avatars_owner_update on storage.objects;
create policy client_avatars_owner_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'client-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'client-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists client_avatars_owner_delete on storage.objects;
create policy client_avatars_owner_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'client-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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
      and coach_clients.status = 'active'
  )
);

drop policy if exists client_avatars_superadmin_select on storage.objects;
create policy client_avatars_superadmin_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-avatars'
  and public.is_superadmin()
);
