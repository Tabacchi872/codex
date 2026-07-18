-- Harden BIA reports and client measurements RLS.

alter table public.bia_reports enable row level security;
alter table public.client_measurements enable row level security;

-- Every report inserted by an authenticated user must point to that
-- uploader's own Storage directory and use the report UUID as filename.
drop policy if exists bia_reports_insert_owner_path on public.bia_reports;
create policy bia_reports_insert_owner_path
on public.bia_reports
as restrictive
for insert
to authenticated
with check (
  public.is_superadmin()
  or storage_path = auth.uid()::text || '/' || id::text || '.pdf'
);

-- Prevent coaches or clients from changing report ownership or Storage path.
-- Clients may only perform the report-confirmation update used by the app.
create or replace function public.guard_bia_reports_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service-role operations and superadmins are not restricted here.
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.coach_id is distinct from old.coach_id
     or new.client_id is distinct from old.client_id
     or new.storage_path is distinct from old.storage_path then
    raise exception 'BIA report ownership and storage path are immutable'
      using errcode = '42501';
  end if;

  -- When the caller is the client rather than the coach, only confirmation
  -- fields may change.
  if old.client_id = auth.uid()
     and old.coach_id is distinct from auth.uid() then

    if (
      to_jsonb(new) -
        array['status', 'confirmed_at', 'confirmed_by', 'updated_at']
    ) is distinct from (
      to_jsonb(old) -
        array['status', 'confirmed_at', 'confirmed_by', 'updated_at']
    ) then
      raise exception 'Clients may only confirm their own BIA report'
        using errcode = '42501';
    end if;

    new.status := 'confirmed';
    new.confirmed_at := now();
    new.confirmed_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists bia_reports_guard_update on public.bia_reports;
create trigger bia_reports_guard_update
before update on public.bia_reports
for each row
execute function public.guard_bia_reports_update();

-- Client report confirmation.
drop policy if exists bia_reports_client_confirm_own on public.bia_reports;
create policy bia_reports_client_confirm_own
on public.bia_reports
for update
to authenticated
using (
  client_id = auth.uid()
)
with check (
  client_id = auth.uid()
  and status = 'confirmed'
  and confirmed_by = auth.uid()
  and confirmed_at is not null
);

-- The unrestricted own-row policy already covers confirmed reports.
drop policy if exists bia_reports_client_read_confirmed on public.bia_reports;

-- A client may delete only reports uploaded inside their own Storage folder.
drop policy if exists bia_reports_client_delete_own on public.bia_reports;
create policy bia_reports_client_delete_own
on public.bia_reports
for delete
to authenticated
using (
  client_id = auth.uid()
  and split_part(storage_path, '/', 1) = auth.uid()::text
);

-- Strengthen measurement insertion, including BIA report ownership.
drop policy if exists client_measurements_client_insert
on public.client_measurements;

create policy client_measurements_client_insert
on public.client_measurements
for insert
to authenticated
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and (updated_by is null or updated_by = auth.uid())
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = client_measurements.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
  and (
    bia_report_id is null
    or exists (
      select 1
      from public.bia_reports
      where bia_reports.id = client_measurements.bia_report_id
        and bia_reports.client_id = auth.uid()
        and bia_reports.coach_id = client_measurements.coach_id
    )
  )
);

-- Keep measurement ownership fields immutable for client updates.
create or replace function public.guard_client_measurements_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  if old.client_id = auth.uid()
     and old.coach_id is distinct from auth.uid() then

    if new.id is distinct from old.id
       or new.coach_id is distinct from old.coach_id
       or new.client_id is distinct from old.client_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.bia_report_id is distinct from old.bia_report_id
       or new.source is distinct from old.source then
      raise exception 'Measurement ownership fields are immutable'
        using errcode = '42501';
    end if;

    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists client_measurements_guard_update
on public.client_measurements;

create trigger client_measurements_guard_update
before update on public.client_measurements
for each row
execute function public.guard_client_measurements_update();

drop policy if exists client_measurements_client_update_own
on public.client_measurements;

create policy client_measurements_client_update_own
on public.client_measurements
for update
to authenticated
using (
  client_id = auth.uid()
  and created_by = auth.uid()
)
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists client_measurements_client_delete_own
on public.client_measurements;

create policy client_measurements_client_delete_own
on public.client_measurements
for delete
to authenticated
using (
  client_id = auth.uid()
  and created_by = auth.uid()
);

-- Allow a client to open a report uploaded by their linked coach.
drop policy if exists bia_reports_storage_client_linked_select
on storage.objects;

create policy bia_reports_storage_client_linked_select
on storage.objects
for select
to authenticated
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
      and bia_reports.client_id = auth.uid()
  )
);

-- Remove obsolete policies based on the previous coach/client folder layout.
drop policy if exists bia_reports_storage_coach_insert on storage.objects;
drop policy if exists bia_reports_storage_coach_select on storage.objects;
drop policy if exists bia_reports_storage_coach_delete on storage.objects;