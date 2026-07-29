-- Hardening legale non distruttivo.
-- Nessun backfill: gli utenti esistenti senza riga valida vengono gestiti dal gate app.

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_acknowledged_at timestamptz not null,
  health_data_consent_at timestamptz,
  health_data_consent_withdrawn_at timestamptz,
  locale text,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_legal_acceptances_versions_not_empty check (
    length(trim(terms_version)) > 0 and length(trim(privacy_version)) > 0
  ),
  constraint user_legal_acceptances_health_withdrawal_order check (
    health_data_consent_withdrawn_at is null
    or (
      health_data_consent_at is not null
      and health_data_consent_withdrawn_at >= health_data_consent_at
    )
  )
);

create unique index if not exists user_legal_acceptances_user_versions_idx
  on public.user_legal_acceptances(user_id, terms_version, privacy_version);

create index if not exists user_legal_acceptances_user_idx
  on public.user_legal_acceptances(user_id);

drop trigger if exists user_legal_acceptances_set_updated_at on public.user_legal_acceptances;
create trigger user_legal_acceptances_set_updated_at
before update on public.user_legal_acceptances
for each row execute function public.set_updated_at();

alter table public.user_legal_acceptances enable row level security;

drop policy if exists user_legal_acceptances_owner_read on public.user_legal_acceptances;
create policy user_legal_acceptances_owner_read on public.user_legal_acceptances
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_legal_acceptances_owner_insert on public.user_legal_acceptances;
drop policy if exists user_legal_acceptances_owner_withdraw_health on public.user_legal_acceptances;

drop policy if exists user_legal_acceptances_superadmin_read on public.user_legal_acceptances;
create policy user_legal_acceptances_superadmin_read on public.user_legal_acceptances
for select to authenticated
using (public.is_superadmin());

revoke all on public.user_legal_acceptances from public, anon, authenticated;
grant select on public.user_legal_acceptances to authenticated;

create or replace function public._is_current_legal_version(p_terms_version text, p_privacy_version text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_terms_version = '1.0' and p_privacy_version = '1.0'
$$;

create or replace function public._has_current_legal_acceptance(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_legal_acceptances ula
    where ula.user_id = p_user_id
      and ula.terms_version = '1.0'
      and ula.privacy_version = '1.0'
      and ula.terms_accepted_at is not null
      and ula.privacy_acknowledged_at is not null
  )
$$;

create or replace function public._has_active_health_data_consent(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_legal_acceptances ula
    where ula.user_id = p_user_id
      and ula.terms_version = '1.0'
      and ula.privacy_version = '1.0'
      and ula.health_data_consent_at is not null
      and ula.health_data_consent_withdrawn_at is null
  )
$$;

create or replace function public._assert_legal_signup_metadata(p_metadata jsonb)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce(p_metadata->'terms_accepted', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED: terms_accepted mancante o non valido';
  end if;
  if coalesce(p_metadata->'privacy_acknowledged', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED: privacy_acknowledged mancante o non valido';
  end if;
  if not public._is_current_legal_version(p_metadata->>'terms_version', p_metadata->>'privacy_version') then
    raise exception 'LEGAL_ACCEPTANCE_VERSION_INVALID: versione legale non valida';
  end if;
end;
$$;

create or replace function public.record_current_legal_acceptance(
  p_terms_version text,
  p_privacy_version text,
  p_locale text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public._is_current_legal_version(p_terms_version, p_privacy_version) then
    raise exception 'LEGAL_ACCEPTANCE_VERSION_INVALID';
  end if;

  v_user_id := auth.uid();

  insert into public.user_legal_acceptances (
    user_id, terms_version, privacy_version, terms_accepted_at,
    privacy_acknowledged_at, locale, app_version
  )
  values (
    v_user_id, p_terms_version, p_privacy_version, now(), now(),
    nullif(trim(coalesce(p_locale, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), '')
  )
  on conflict (user_id, terms_version, privacy_version) do update set
    terms_accepted_at = coalesce(public.user_legal_acceptances.terms_accepted_at, excluded.terms_accepted_at),
    privacy_acknowledged_at = coalesce(public.user_legal_acceptances.privacy_acknowledged_at, excluded.privacy_acknowledged_at),
    locale = coalesce(public.user_legal_acceptances.locale, excluded.locale),
    app_version = coalesce(public.user_legal_acceptances.app_version, excluded.app_version),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_health_data_consent()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_user_id := auth.uid();

  update public.user_legal_acceptances
  set health_data_consent_at = coalesce(health_data_consent_at, now()),
      health_data_consent_withdrawn_at = null,
      updated_at = now()
  where user_id = v_user_id
    and terms_version = '1.0'
    and privacy_version = '1.0'
    and terms_accepted_at is not null
    and privacy_acknowledged_at is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  return v_id;
end;
$$;

create or replace function public.withdraw_health_data_consent()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_user_id := auth.uid();

  update public.user_legal_acceptances
  set health_data_consent_withdrawn_at = coalesce(health_data_consent_withdrawn_at, now()),
      updated_at = now()
  where user_id = v_user_id
    and terms_version = '1.0'
    and privacy_version = '1.0'
    and health_data_consent_at is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'HEALTH_CONSENT_NOT_FOUND';
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_current_legal_acceptance(text, text, text, text) from public, anon;
grant execute on function public.record_current_legal_acceptance(text, text, text, text) to authenticated;
revoke all on function public.record_health_data_consent() from public, anon;
grant execute on function public.record_health_data_consent() to authenticated;
revoke all on function public.withdraw_health_data_consent() from public, anon;
grant execute on function public.withdraw_health_data_consent() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_billing jsonb;
  v_coach_id uuid;
  v_coach_code text;
  v_candidate text;
  v_attempts int;
begin
  perform public._assert_legal_signup_metadata(new.raw_user_meta_data);

  insert into public.profiles (id, role, full_name, email, phone, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'cliente'),
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  insert into public.user_legal_acceptances (
    user_id, terms_version, privacy_version, terms_accepted_at,
    privacy_acknowledged_at, locale, app_version
  )
  values (
    new.id,
    '1.0',
    '1.0',
    now(),
    now(),
    nullif(trim(coalesce(new.raw_user_meta_data->>'locale', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'app_version', '')), '')
  )
  on conflict (user_id, terms_version, privacy_version) do nothing;

  v_role := coalesce(new.raw_user_meta_data->>'role', 'cliente');

  if v_role = 'coach' then
    begin
      insert into public.coach_profiles (user_id, business_name, billing_status)
      values (new.id, new.raw_user_meta_data->>'business_name', 'trial')
      on conflict (user_id) do nothing;
    exception
      when others then
        raise warning 'handle_new_user: coach_profiles fallito per user %: %', new.id, sqlerrm;
    end;

    begin
      v_billing := new.raw_user_meta_data->'billing_profile';
      if v_billing is not null and v_billing->>'legalName' is not null and v_billing->>'billingEmail' is not null then
        insert into public.billing_profiles (
          coach_id, subject_type, legal_name, vat_number, fiscal_code, address,
          postal_code, city, province, country, pec, sdi_code, billing_email
        )
        values (
          new.id,
          coalesce(v_billing->>'subjectType', 'private'),
          v_billing->>'legalName',
          nullif(v_billing->>'vatNumber', ''),
          nullif(v_billing->>'fiscalCode', ''),
          nullif(v_billing->>'address', ''),
          nullif(v_billing->>'postalCode', ''),
          nullif(v_billing->>'city', ''),
          nullif(v_billing->>'province', ''),
          coalesce(v_billing->>'country', 'Italia'),
          nullif(v_billing->>'pec', ''),
          nullif(v_billing->>'sdiCode', ''),
          v_billing->>'billingEmail'
        )
        on conflict (coach_id) do nothing;
      end if;
    exception
      when others then
        raise warning 'handle_new_user: billing_profiles fallito per user %: %', new.id, sqlerrm;
    end;

    begin
      if not exists (
        select 1 from public.registration_codes
        where coach_id = new.id and status = 'active'
      ) then
        v_attempts := 0;
        v_candidate := null;
        while v_candidate is null and v_attempts < 5 loop
          v_attempts := v_attempts + 1;
          begin
            insert into public.registration_codes (coach_id, code, status)
            values (
              new.id,
              'FC-' || public.random_coach_code_segment() || '-' || public.random_coach_code_segment(),
              'active'
            )
            returning code into v_candidate;
          exception
            when unique_violation then
              v_candidate := null;
          end;
        end loop;
      end if;
    exception
      when others then
        raise warning 'handle_new_user: registration_codes fallito per user %: %', new.id, sqlerrm;
    end;

  elsif v_role = 'cliente' then
    begin
      insert into public.client_profiles (user_id)
      values (new.id)
      on conflict (user_id) do nothing;
    exception
      when others then
        raise warning 'handle_new_user: client_profiles fallito per user %: %', new.id, sqlerrm;
    end;

    begin
      v_coach_id := nullif(new.raw_user_meta_data->>'coach_id', '')::uuid;
      v_coach_code := new.raw_user_meta_data->>'coach_code';
      if v_coach_id is not null then
        perform public._link_client_to_coach(new.id, v_coach_id, nullif(v_coach_code, ''));
      end if;
    exception
      when others then
        raise warning 'handle_new_user: coach_clients fallito per user %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
exception
  when others then
    if sqlerrm like 'LEGAL_ACCEPTANCE_%' then
      raise;
    end if;
    raise warning 'handle_new_user fallito per user %: %', new.id, sqlerrm;
    return new;
end;
$$;

create or replace function public.save_initial_fitness_profile(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_profile_id uuid;
  v_age integer;
  v_location text;
  v_equipment_level text;
  v_duration integer;
  v_style text;
  v_has_pain boolean;
  v_pain_areas text[];
  v_pain_notes text;
  v_requires_supervision boolean;
  v_completed boolean;
  v_exercise_id text;
  v_contains_health_data boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  v_client_id := auth.uid();
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' salvare il proprio questionario fitness';
  end if;

  v_age := nullif(payload->>'age', '')::integer;
  v_location := nullif(payload->>'location', '');
  v_equipment_level := nullif(payload->>'equipment_level', '');
  v_duration := nullif(payload->>'session_duration_minutes', '')::integer;
  v_style := nullif(payload->>'preferred_training_style', '');
  v_has_pain := coalesce((payload->>'has_pain_or_limitation')::boolean, false);
  v_pain_notes := nullif(payload->>'pain_notes', '');
  v_requires_supervision := coalesce((payload->>'requires_professional_supervision')::boolean, false);

  select coalesce(array_agg(elem), '{}'::text[]) into v_pain_areas
  from jsonb_array_elements_text(coalesce(payload->'pain_areas', '[]'::jsonb)) as elem;

  v_contains_health_data :=
    v_has_pain
    or cardinality(v_pain_areas) > 0
    or v_pain_notes is not null
    or v_requires_supervision;

  if v_contains_health_data and not public._has_active_health_data_consent(v_client_id) then
    raise exception 'HEALTH_CONSENT_REQUIRED';
  end if;

  if v_location is not null and v_location not in ('gym', 'home') then
    raise exception 'INVALID_PAYLOAD: luogo non valido';
  end if;
  if v_equipment_level is not null and v_equipment_level not in ('bodyweight_only', 'home_basic', 'full_gym') then
    raise exception 'INVALID_PAYLOAD: attrezzatura non valida';
  end if;
  if v_style is not null and v_style not in ('full_body', 'upper_lower', 'split', 'hybrid', 'no_preference') then
    raise exception 'INVALID_PAYLOAD: stile di allenamento non valido';
  end if;

  v_completed := v_age is not null and v_location is not null and v_duration is not null and v_style is not null;

  insert into public.client_fitness_profile (
    client_id, age, location, equipment_level, session_duration_minutes,
    preferred_training_style, has_pain_or_limitation, pain_areas, pain_notes,
    requires_professional_supervision, completed, completed_at
  ) values (
    v_client_id, v_age, v_location, v_equipment_level, v_duration,
    v_style, v_has_pain, v_pain_areas, v_pain_notes,
    v_requires_supervision, v_completed, case when v_completed then now() else null end
  )
  on conflict (client_id) do update set
    age = excluded.age,
    location = excluded.location,
    equipment_level = excluded.equipment_level,
    session_duration_minutes = excluded.session_duration_minutes,
    preferred_training_style = excluded.preferred_training_style,
    has_pain_or_limitation = excluded.has_pain_or_limitation,
    pain_areas = excluded.pain_areas,
    pain_notes = excluded.pain_notes,
    requires_professional_supervision = excluded.requires_professional_supervision,
    completed = client_fitness_profile.completed or excluded.completed,
    completed_at = coalesce(client_fitness_profile.completed_at, excluded.completed_at)
  returning id into v_profile_id;

  for v_exercise_id in
    select elem from jsonb_array_elements_text(coalesce(payload->'excluded_exercise_ids', '[]'::jsonb)) as elem
  loop
    insert into public.client_excluded_exercises (client_id, exercise_id, reason, active)
    values (v_client_id, v_exercise_id, 'dislike', true)
    on conflict (client_id, exercise_id) do update set active = true, reason = 'dislike', updated_at = now();
  end loop;

  return v_profile_id;
end;
$$;

revoke all on function public.save_initial_fitness_profile(jsonb) from public, anon;
grant execute on function public.save_initial_fitness_profile(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    raise exception 'LEGAL_ACCEPTANCE_AUDIT_FAILED: trigger on_auth_user_created mancante su auth.users';
  end if;
end;
$$;
