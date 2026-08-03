-- Replay seed for catalog rows created after the historical schema baseline.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.subscription_packages
  where target_role = 'client'
    and revenuecat_entitlement_id = 'client_pro'
    and android_product_id in ('client_pro:monthly', 'client_pro:quarterly', 'client_pro:annual');

  if v_count = 0 then
    insert into public.subscription_packages
      (target_role, name, description, price, currency, duration_value,
       duration_unit, max_clients, features, revenuecat_entitlement_id,
       revenuecat_offering_id, android_product_id, ios_product_id, is_active,
       sort_order)
    values
      ('client', 'Client Pro Mensile', 'Accesso Client Pro con rinnovo mensile.',
       9.99, 'EUR', 1, 'months', null, '[]'::jsonb, 'client_pro',
       'client_plans', 'client_pro:monthly',
       'com.fitcoachapp.mobile.client.monthly', true, 1),
      ('client', 'Client Pro Trimestrale', 'Accesso Client Pro con rinnovo trimestrale.',
       24.99, 'EUR', 3, 'months', null, '[]'::jsonb, 'client_pro',
       'client_plans', 'client_pro:quarterly',
       'com.fitcoachapp.mobile.client.quarterly', true, 2),
      ('client', 'Client Pro Annuale', 'Accesso Client Pro con rinnovo annuale.',
       79.99, 'EUR', 12, 'months', null, '[]'::jsonb, 'client_pro',
       'client_plans', 'client_pro:annual',
       'com.fitcoachapp.mobile.client.annual', true, 3);
  elsif v_count <> 3 then
    raise exception 'LEGACY_CLIENT_PRO_SEED_MISMATCH: expected 0 or 3 rows, found %', v_count;
  end if;
end;
$$;
