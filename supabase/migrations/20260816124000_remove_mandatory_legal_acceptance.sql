-- Hotfix: Privacy Policy e Termini restano consultabili, ma non bloccano piu'
-- registrazione/login. Il consenso salute resta separato e gestito dalle RPC
-- record_health_data_consent()/withdraw_health_data_consent().

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
  v_role := nullif(trim(coalesce(new.raw_user_meta_data->>'role', '')), '');
  if v_role is null then
    v_role := 'cliente';
  elsif v_role not in ('cliente', 'coach') then
    raise exception 'INVALID_SIGNUP_ROLE';
  end if;

  insert into public.profiles (id, role, full_name, email, phone, is_active)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

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
    if sqlerrm = 'INVALID_SIGNUP_ROLE' then
      raise;
    end if;
    raise warning 'handle_new_user fallito per user %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.record_current_legal_acceptance(text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
