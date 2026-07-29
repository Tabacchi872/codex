-- Corregge la configurazione RevenueCat del solo pacchetto Client Pro mensile.
-- Non modifica product id, prezzi, abbonamenti utente o stati di acquisto.

do $$
declare
  v_monthly_count integer;
  v_wrong_client_pro_count integer;
begin
  select count(*)
  into v_monthly_count
  from public.subscription_packages
  where target_role = 'client'
    and android_product_id = 'client_pro:monthly';

  if v_monthly_count <> 1 then
    raise exception 'CLIENT_PRO_MONTHLY_ENTITLEMENT_AUDIT_FAILED monthly_count=%', v_monthly_count;
  end if;

  update public.subscription_packages
  set revenuecat_entitlement_id = 'client_pro',
      updated_at = now()
  where target_role = 'client'
    and android_product_id = 'client_pro:monthly'
    and revenuecat_entitlement_id is distinct from 'client_pro';

  select count(*)
  into v_wrong_client_pro_count
  from public.subscription_packages
  where target_role = 'client'
    and (
      android_product_id in ('client_pro:monthly', 'client_pro:quarterly', 'client_pro:annual')
      or ios_product_id in (
        'com.fitcoachapp.mobile.client.monthly',
        'com.fitcoachapp.mobile.client.quarterly',
        'com.fitcoachapp.mobile.client.annual'
      )
    )
    and revenuecat_entitlement_id is distinct from 'client_pro';

  if v_wrong_client_pro_count <> 0 then
    raise exception 'CLIENT_PRO_ENTITLEMENT_AUDIT_FAILED wrong_client_pro_count=%', v_wrong_client_pro_count;
  end if;

  if exists (
    select 1
    from public.subscription_packages
    where target_role = 'client'
      and revenuecat_entitlement_id = 'client_monthly'
      and (
        android_product_id like 'client_pro:%'
        or ios_product_id like 'com.fitcoachapp.mobile.client.%'
        or name ilike '%client pro%'
      )
  ) then
    raise exception 'CLIENT_PRO_ENTITLEMENT_AUDIT_FAILED legacy_client_monthly_still_present';
  end if;

  if not exists (
    select 1
    from public.subscription_packages
    where target_role = 'client'
      and android_product_id = 'client_pro:monthly'
      and revenuecat_entitlement_id = 'client_pro'
      and is_active = true
  ) then
    raise exception 'CLIENT_PRO_MONTHLY_ENTITLEMENT_AUDIT_FAILED monthly_not_active_or_not_fixed';
  end if;

  if not exists (
    select 1
    from public.subscription_packages
    where target_role = 'client'
      and android_product_id = 'client_pro:quarterly'
      and revenuecat_entitlement_id = 'client_pro'
  ) then
    raise exception 'CLIENT_PRO_ENTITLEMENT_AUDIT_FAILED quarterly_missing_or_wrong';
  end if;

  if not exists (
    select 1
    from public.subscription_packages
    where target_role = 'client'
      and android_product_id = 'client_pro:annual'
      and revenuecat_entitlement_id = 'client_pro'
  ) then
    raise exception 'CLIENT_PRO_ENTITLEMENT_AUDIT_FAILED annual_missing_or_wrong';
  end if;
end $$;
