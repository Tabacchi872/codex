-- Harden client onboarding completion after 20260717090000_client_onboarding_phase1.sql.
-- This migration intentionally does not modify the already-applied migration file.

create or replace function public.client_onboarding_is_client_owner(p_client_id uuid)
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select
    p_client_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'cliente'
    );
$$;

create or replace function public.client_onboarding_has_active_coach_link(p_client_id uuid)
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.coach_clients
    where coach_clients.client_id = p_client_id
      and coach_clients.status = 'active'
  );
$$;

create or replace function public.client_onboarding_is_valid_self_guided(
  p_gender text,
  p_goals text[],
  p_focus_areas text[],
  p_training_reasons text[],
  p_experience_level text,
  p_training_days_per_week integer,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_bmi numeric,
  p_bmi_category text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_gender in ('male', 'female', 'unspecified')
    and coalesce(cardinality(p_goals), 0) > 0
    and coalesce(cardinality(p_focus_areas), 0) > 0
    and coalesce(cardinality(p_training_reasons), 0) > 0
    and p_experience_level in ('beginner', 'novice', 'intermediate', 'advanced', 'competitive')
    and p_training_days_per_week between 1 and 7
    and p_weight_kg between 30 and 300
    and p_height_cm between 120 and 230
    and p_bmi between 8 and 80
    and p_bmi_category in ('Sottopeso', 'Normopeso', 'Sovrappeso', 'Obesita');
$$;

create or replace function public.client_onboarding_state_allowed(
  p_client_id uuid,
  p_client_mode text,
  p_onboarding_completed boolean,
  p_completed_at timestamptz,
  p_gender text,
  p_goals text[],
  p_focus_areas text[],
  p_training_reasons text[],
  p_experience_level text,
  p_training_days_per_week integer,
  p_weight_kg numeric,
  p_height_cm numeric,
  p_bmi numeric,
  p_bmi_category text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(p_onboarding_completed, false) = false
    or (
      p_client_mode = 'coach_guided'
      and p_completed_at is not null
      and public.client_onboarding_has_active_coach_link(p_client_id)
    )
    or (
      p_client_mode = 'self_guided'
      and p_completed_at is not null
      and public.client_onboarding_is_valid_self_guided(
        p_gender,
        p_goals,
        p_focus_areas,
        p_training_reasons,
        p_experience_level,
        p_training_days_per_week,
        p_weight_kg,
        p_height_cm,
        p_bmi,
        p_bmi_category
      )
    );
$$;

create or replace function public.prevent_client_onboarding_unsafe_changes()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' or public.is_superadmin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.client_id is distinct from auth.uid() then
      raise exception 'CLIENT_ONBOARDING_CLIENT_ID_INVALID';
    end if;

    if coalesce(new.onboarding_completed, false) = true or new.completed_at is not null then
      raise exception 'CLIENT_ONBOARDING_INSERT_MUST_BE_DRAFT';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'CLIENT_ONBOARDING_ID_IMMUTABLE';
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'CLIENT_ONBOARDING_CLIENT_ID_IMMUTABLE';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'CLIENT_ONBOARDING_CREATED_AT_IMMUTABLE';
  end if;

  if old.onboarding_completed = true then
    if new.onboarding_completed is distinct from true then
      raise exception 'CLIENT_ONBOARDING_COMPLETION_IRREVERSIBLE';
    end if;

    if new.client_mode is distinct from old.client_mode then
      raise exception 'CLIENT_ONBOARDING_MODE_IMMUTABLE_AFTER_COMPLETION';
    end if;

    if new.completed_at is null or new.completed_at is distinct from old.completed_at then
      raise exception 'CLIENT_ONBOARDING_COMPLETED_AT_IMMUTABLE_AFTER_COMPLETION';
    end if;
  end if;

  if coalesce(new.onboarding_completed, false) = false and new.completed_at is not null then
    raise exception 'CLIENT_ONBOARDING_DRAFT_COMPLETED_AT_INVALID';
  end if;

  if coalesce(new.onboarding_completed, false) = true then
    if new.completed_at is null then
      raise exception 'CLIENT_ONBOARDING_COMPLETED_AT_REQUIRED';
    end if;

    if new.client_mode = 'coach_guided' then
      if not public.client_onboarding_has_active_coach_link(new.client_id) then
        raise exception 'CLIENT_ONBOARDING_ACTIVE_COACH_LINK_REQUIRED';
      end if;
    elsif new.client_mode = 'self_guided' then
      if not public.client_onboarding_is_valid_self_guided(
        new.gender,
        new.goals,
        new.focus_areas,
        new.training_reasons,
        new.experience_level,
        new.training_days_per_week,
        new.weight_kg,
        new.height_cm,
        new.bmi,
        new.bmi_category
      ) then
        raise exception 'CLIENT_ONBOARDING_SELF_GUIDED_INCOMPLETE';
      end if;
    else
      raise exception 'CLIENT_ONBOARDING_MODE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists client_onboarding_prevent_unsafe_changes on public.client_onboarding;
create trigger client_onboarding_prevent_unsafe_changes
before insert or update on public.client_onboarding
for each row execute function public.prevent_client_onboarding_unsafe_changes();

drop policy if exists client_onboarding_owner_insert on public.client_onboarding;
create policy client_onboarding_owner_insert on public.client_onboarding
for insert to authenticated
with check (
  public.client_onboarding_is_client_owner(client_id)
  and onboarding_completed = false
  and completed_at is null
);

drop policy if exists client_onboarding_owner_update on public.client_onboarding;
create policy client_onboarding_owner_update on public.client_onboarding
for update to authenticated
using (
  public.client_onboarding_is_client_owner(client_id)
)
with check (
  public.client_onboarding_is_client_owner(client_id)
  and public.client_onboarding_state_allowed(
    client_id,
    client_mode,
    onboarding_completed,
    completed_at,
    gender,
    goals,
    focus_areas,
    training_reasons,
    experience_level,
    training_days_per_week,
    weight_kg,
    height_cm,
    bmi,
    bmi_category
  )
);

grant execute on function public.client_onboarding_is_client_owner(uuid) to authenticated;
grant execute on function public.client_onboarding_has_active_coach_link(uuid) to authenticated;
grant execute on function public.client_onboarding_is_valid_self_guided(text, text[], text[], text[], text, integer, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.client_onboarding_state_allowed(uuid, text, boolean, timestamptz, text, text[], text[], text[], text, integer, numeric, numeric, numeric, text) to authenticated;

revoke execute on function public.prevent_client_onboarding_unsafe_changes() from public;
