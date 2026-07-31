-- Architecture only. No exercise or identity key is created here.
begin;

alter table public.exercises
  add column if not exists record_kind text not null default 'exercise';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exercises'::regclass
      and conname = 'exercises_record_kind_check'
  ) then
    alter table public.exercises
      add constraint exercises_record_kind_check
      check (record_kind in ('exercise', 'legacy_bridge'));
  end if;
end $$;

alter table public.exercises drop constraint if exists exercises_source_check;
alter table public.exercises
  add constraint exercises_source_check
  check (source in ('custom', 'ymove', 'legacy'));

create index if not exists exercises_selectable_lookup_idx
  on public.exercises (record_kind, active, library_status);

create or replace view public.selectable_exercises
with (security_invoker = true)
as
select *
from public.exercises
where record_kind = 'exercise'
  and active = true
  and library_status <> 'hidden';

revoke all on public.selectable_exercises from public, anon, authenticated;
grant select on public.selectable_exercises to anon, authenticated, service_role;

commit;
