-- ============================================================================
-- Superadmin: clienti, Client Pro e pagamenti separati
-- ============================================================================
-- Migrazione additiva: nessuna policy RLS viene indebolita. Le letture globali
-- passano da RPC SECURITY DEFINER che verificano sempre public.is_superadmin().

alter table public.revenuecat_webhook_events
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists transaction_id text,
  add column if not exists original_transaction_id text,
  add column if not exists price numeric(12, 4),
  add column if not exists currency text,
  add column if not exists purchased_at timestamptz,
  add column if not exists expiration_at timestamptz;

alter table public.user_subscriptions drop constraint if exists user_subscriptions_status_check;
alter table public.user_subscriptions add constraint user_subscriptions_status_check
  check (status = any (array['pending','active','expired','canceled','refunded','revoked']::text[]));

create index if not exists revenuecat_webhook_events_environment_idx
  on public.revenuecat_webhook_events(environment) where environment is not null;
create index if not exists revenuecat_webhook_events_transaction_id_idx
  on public.revenuecat_webhook_events(transaction_id) where transaction_id is not null;

create or replace function public._rc_event_payload(p_payload jsonb)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(p_payload->'event', p_payload, '{}'::jsonb)
$function$;

create or replace function public._rc_payload_text(p_payload jsonb, p_key text)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select nullif(public._rc_event_payload(p_payload)->>p_key, '')
$function$;

create or replace function public._rc_payload_numeric(p_payload jsonb, p_key text)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select case
    when public._rc_payload_text(p_payload, p_key) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then public._rc_payload_text(p_payload, p_key)::numeric
    else null::numeric
  end
$function$;

create or replace function public._rc_payload_ms(p_payload jsonb, p_key text)
returns timestamptz
language sql
stable
set search_path to 'public'
as $function$
  select case
    when public._rc_payload_text(p_payload, p_key) ~ '^[0-9]+$'
      then to_timestamp((public._rc_payload_text(p_payload, p_key)::numeric / 1000.0))
    else null::timestamptz
  end
$function$;

create or replace function public.superadmin_list_clients()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' elencare tutti i clienti';
  end if;

  with active_coach as (
    select distinct on (cc.client_id)
      cc.client_id, cc.coach_id, cc.status, cc.created_at,
      cp.full_name as coach_name, cp.email as coach_email
    from public.coach_clients cc
    join public.profiles cp on cp.id = cc.coach_id
    where cc.status = 'active'
    order by cc.client_id, cc.created_at desc
  ),
  latest_client_sub as (
    select distinct on (us.user_id)
      us.*, sp.name as package_name, sp.revenuecat_entitlement_id, sp.android_product_id, sp.ios_product_id
    from public.user_subscriptions us
    join public.subscription_packages sp on sp.id = us.package_id and sp.target_role = 'client'
    order by us.user_id,
      case
        when us.status in ('active','canceled') and (us.expires_at is null or us.expires_at > now()) then 0
        when us.status = 'pending' then 1
        else 2
      end,
      coalesce(us.updated_at, us.created_at) desc
  ),
  current_cycle as (
    select distinct on (c.client_id) c.*
    from public.client_program_cycles c
    order by c.client_id,
      case when c.status in ('draft','active','checkin_due','review_pending','pending_safety_review','pending_template','pending_subscription') then 0 else 1 end,
      c.cycle_number desc,
      c.created_at desc
  ),
  workout_counts as (
    select wp.client_id,
      count(*) filter (where wp.session_status = 'completed')::integer as completed_workouts,
      max(coalesce(wp.completed_at, wp.updated_at, wp.created_at)) as last_workout_activity
    from public.workout_plans wp
    group by wp.client_id
  ),
  latest_notifications as (
    select an.recipient_id as client_id, max(an.created_at) as last_notification_at
    from public.app_notifications an
    where an.recipient_role = 'cliente'
    group by an.recipient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', coalesce(p.full_name, ''),
    'email', p.email,
    'createdAt', p.created_at,
    'coachId', ac.coach_id,
    'coachName', ac.coach_name,
    'mode', case when ac.coach_id is null then 'auto_program' else 'with_coach' end,
    'clientProStatus', case
      when lcs.status is null then 'none'
      when lcs.status = 'active' and (lcs.expires_at is null or lcs.expires_at > now()) then 'active'
      when lcs.status = 'canceled' and (lcs.expires_at is null or lcs.expires_at > now()) then 'canceled_valid'
      when lcs.status = 'pending' then 'pending'
      else lcs.status
    end,
    'clientProExpiresAt', lcs.expires_at,
    'clientProProductId', coalesce(lcs.android_product_id, lcs.ios_product_id),
    'questionnaireStatus', case
      when cfp.id is null then 'missing'
      when cfp.completed then 'completed'
      else 'incomplete'
    end,
    'programStatus', case
      when cc.id is not null then cc.status
      when cfp.id is null or not coalesce(cfp.completed, false) then 'questionnaire_required'
      else 'no_program'
    end,
    'needsReview', coalesce(cfp.requires_professional_supervision, false) or cc.status in ('pending_safety_review','pending_template'),
    'completedWorkouts', coalesce(wc.completed_workouts, 0),
    'lastActivityAt', greatest(p.updated_at, coalesce(wc.last_workout_activity, p.updated_at), coalesce(ln.last_notification_at, p.updated_at))
  ) order by p.created_at desc), '[]'::jsonb)
  into v_result
  from public.profiles p
  left join active_coach ac on ac.client_id = p.id
  left join latest_client_sub lcs on lcs.user_id = p.id
  left join public.client_fitness_profile cfp on cfp.client_id = p.id
  left join current_cycle cc on cc.client_id = p.id
  left join workout_counts wc on wc.client_id = p.id
  left join latest_notifications ln on ln.client_id = p.id
  where p.role = 'cliente';

  return v_result;
end;
$function$;

revoke all on function public.superadmin_list_clients() from public, anon;
grant execute on function public.superadmin_list_clients() to authenticated;

create or replace function public.superadmin_get_client_detail(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' leggere il dettaglio cliente';
  end if;
  if not exists (select 1 from public.profiles where id = p_client_id and role = 'cliente') then
    raise exception 'NOT_FOUND: cliente non trovato';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p) - 'phone',
    'coach', (
      select to_jsonb(x) from (
        select cp.id, cp.full_name as name, cp.email, cc.status, cc.created_at
        from public.coach_clients cc
        join public.profiles cp on cp.id = cc.coach_id
        where cc.client_id = p_client_id and cc.status = 'active'
        order by cc.created_at desc
        limit 1
      ) x
    ),
    'subscriptions', coalesce((
      select jsonb_agg(to_jsonb(us) || jsonb_build_object(
        'packageName', sp.name,
        'targetRole', sp.target_role,
        'productIdentifier', coalesce(sp.android_product_id, sp.ios_product_id),
        'entitlementIdentifier', sp.revenuecat_entitlement_id,
        'storePriceStoredInBackend', false
      ) order by us.created_at desc)
      from public.user_subscriptions us
      join public.subscription_packages sp on sp.id = us.package_id
      where us.user_id = p_client_id
    ), '[]'::jsonb),
    'fitnessProfile', (select to_jsonb(cfp) from public.client_fitness_profile cfp where cfp.client_id = p_client_id),
    'currentCycle', (
      select to_jsonb(c) from public.client_program_cycles c
      where c.client_id = p_client_id
      order by case when c.status in ('draft','active','checkin_due','review_pending','pending_safety_review','pending_template','pending_subscription') then 0 else 1 end,
        c.cycle_number desc, c.created_at desc
      limit 1
    ),
    'cycles', coalesce((select jsonb_agg(to_jsonb(c) order by c.cycle_number desc) from public.client_program_cycles c where c.client_id = p_client_id), '[]'::jsonb),
    'workoutPlans', coalesce((select jsonb_agg(to_jsonb(wp) order by wp.start_date desc, wp.created_at desc) from public.workout_plans wp where wp.client_id = p_client_id), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(k) order by k.created_at desc) from public.client_monthly_checkins k where k.client_id = p_client_id), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(r) order by coalesce(r.reviewed_at, r.created_at) desc)
      from public.client_cycle_reviews r
      join public.client_program_cycles c on c.id = r.cycle_id
      where c.client_id = p_client_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from public.app_notifications n
      where n.recipient_id = p_client_id
      limit 30
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at desc)
      from public.superadmin_program_overrides o
      where o.client_id = p_client_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.profiles p
  where p.id = p_client_id;

  return v_result;
end;
$function$;

revoke all on function public.superadmin_get_client_detail(uuid) from public, anon;
grant execute on function public.superadmin_get_client_detail(uuid) to authenticated;

create or replace function public.superadmin_get_client_pro_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' leggere Client Pro';
  end if;

  select jsonb_build_object(
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'name', sp.name,
        'entitlementIdentifier', sp.revenuecat_entitlement_id,
        'offeringIdentifier', sp.revenuecat_offering_id,
        'androidProductId', sp.android_product_id,
        'iosProductId', sp.ios_product_id,
        'isActive', sp.is_active,
        'backendPrice', sp.price,
        'backendCurrency', sp.currency,
        'priceSource', case
          when sp.android_product_id is not null or sp.ios_product_id is not null then 'store_available_in_app'
          else 'backend_unavailable'
        end
      ) order by sp.sort_order, sp.name)
      from public.subscription_packages sp
      where sp.target_role = 'client'
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'active', count(*) filter (where us.status = 'active' and (us.expires_at is null or us.expires_at > now())),
      'expired', count(*) filter (where us.status = 'expired' or (us.expires_at is not null and us.expires_at <= now() and us.status not in ('refunded','revoked'))),
      'canceled', count(*) filter (where us.status = 'canceled'),
      'refunded', count(*) filter (where us.status = 'refunded'),
      'revoked', count(*) filter (where us.status = 'revoked'),
      'sandbox', count(*) filter (where lower(coalesce(rwe.environment, public._rc_payload_text(rwe.payload, 'environment'), '')) = 'sandbox'),
      'production', count(*) filter (where lower(coalesce(rwe.environment, public._rc_payload_text(rwe.payload, 'environment'), '')) in ('production','prod'))
    )
  )
  into v_result
  from public.user_subscriptions us
  join public.subscription_packages sp on sp.id = us.package_id and sp.target_role = 'client'
  left join public.revenuecat_webhook_events rwe on rwe.app_user_id = us.user_id and (rwe.product_id = sp.android_product_id or rwe.product_id = sp.ios_product_id or rwe.entitlement_id = sp.revenuecat_entitlement_id);

  return coalesce(v_result, jsonb_build_object('packages', '[]'::jsonb, 'counts', '{}'::jsonb));
end;
$function$;

revoke all on function public.superadmin_get_client_pro_summary() from public, anon;
grant execute on function public.superadmin_get_client_pro_summary() to authenticated;

create or replace function public.superadmin_get_payments()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' leggere i pagamenti';
  end if;

  select jsonb_build_object(
    'coachPayments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', us.id,
        'userId', us.user_id,
        'userName', coalesce(p.full_name, ''),
        'userEmail', p.email,
        'packageName', sp.name,
        'productIdentifier', coalesce(sp.android_product_id, sp.ios_product_id),
        'provider', us.payment_provider,
        'transactionId', us.external_subscription_id,
        'date', coalesce(us.starts_at, us.created_at),
        'status', us.status,
        'amount', null,
        'currency', null,
        'amountUnavailableReason', 'Importo transazione coach non memorizzato nel backend.',
        'expiresAt', us.expires_at
      ) order by coalesce(us.starts_at, us.created_at) desc)
      from public.user_subscriptions us
      join public.subscription_packages sp on sp.id = us.package_id and sp.target_role = 'coach'
      join public.profiles p on p.id = us.user_id
    ), '[]'::jsonb),
    'clientProPayments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'transactionKey', coalesce(e.transaction_id, e.original_transaction_id || ':' || e.event_type || ':' || coalesce(e.purchased_at, e.received_at)::text, e.event_id),
        'clientId', p.id,
        'clientName', coalesce(p.full_name, ''),
        'clientEmail', p.email,
        'productIdentifier', e.product_id,
        'entitlementIdentifier', e.entitlement_id,
        'store', e.store,
        'environment', e.environment,
        'transactionId', e.transaction_id,
        'originalTransactionId', e.original_transaction_id,
        'eventId', e.event_id,
        'eventType', e.event_type,
        'date', coalesce(e.purchased_at, e.received_at),
        'purchasedAt', e.purchased_at,
        'receivedAt', e.received_at,
        'subscriptionStatus', sub.status,
        'eventStatus', lower(e.event_type),
        'amount', e.price,
        'currency', e.currency,
        'expiresAt', coalesce(e.expiration_at, sub.expires_at),
        'processed', e.processed,
        'processingError', e.processing_error,
        'clientResolved', p.id is not null
      ) order by coalesce(e.purchased_at, e.received_at) desc)
      from (
        select
          rwe.id,
          rwe.event_id,
          rwe.event_type,
          rwe.app_user_id,
          coalesce(rwe.product_id, public._rc_payload_text(rwe.payload, 'product_id'), public._rc_payload_text(rwe.payload, 'product_identifier')) as product_id,
          coalesce(rwe.entitlement_id, public._rc_payload_text(rwe.payload, 'entitlement_id'), public._rc_event_payload(rwe.payload)->'entitlement_ids'->>0) as entitlement_id,
          coalesce(rwe.store, public._rc_payload_text(rwe.payload, 'store')) as store,
          coalesce(rwe.environment, public._rc_payload_text(rwe.payload, 'environment')) as environment,
          coalesce(rwe.transaction_id, public._rc_payload_text(rwe.payload, 'transaction_id'), public._rc_payload_text(rwe.payload, 'store_transaction_id')) as transaction_id,
          coalesce(rwe.original_transaction_id, public._rc_payload_text(rwe.payload, 'original_transaction_id')) as original_transaction_id,
          coalesce(rwe.price, public._rc_payload_numeric(rwe.payload, 'price_in_purchased_currency'), public._rc_payload_numeric(rwe.payload, 'price')) as price,
          coalesce(rwe.currency, public._rc_payload_text(rwe.payload, 'currency')) as currency,
          coalesce(rwe.purchased_at, public._rc_payload_ms(rwe.payload, 'purchased_at_ms')) as purchased_at,
          coalesce(rwe.expiration_at, public._rc_payload_ms(rwe.payload, 'expiration_at_ms')) as expiration_at,
          rwe.received_at,
          rwe.processed,
          rwe.processing_error
        from public.revenuecat_webhook_events rwe
      ) e
      left join lateral (
        select us.user_id, us.status, us.expires_at, sp.target_role
        from public.user_subscriptions us
        join public.subscription_packages sp on sp.id = us.package_id
        where us.payment_provider = 'revenuecat'
          and sp.target_role = 'client'
          and (
            us.external_subscription_id = e.original_transaction_id
            or us.external_subscription_id = e.transaction_id
            or (e.app_user_id is not null and us.user_id = e.app_user_id)
          )
        order by
          case when us.external_subscription_id = e.original_transaction_id then 0 when us.external_subscription_id = e.transaction_id then 1 else 2 end,
          coalesce(us.updated_at, us.created_at) desc
        limit 1
      ) sub on true
      left join public.profiles p on p.id = coalesce(e.app_user_id, sub.user_id)
      where coalesce(
        sub.target_role,
        case when e.entitlement_id = 'client_pro' then 'client' end,
        case when exists (
          select 1 from public.subscription_packages sp
          where sp.target_role = 'client'
            and (sp.android_product_id = e.product_id or sp.ios_product_id = e.product_id)
        ) then 'client' end
      ) = 'client'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.superadmin_get_payments() from public, anon;
grant execute on function public.superadmin_get_payments() to authenticated;

create or replace function public.superadmin_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' leggere i KPI globali';
  end if;

  with client_subs as (
    select us.*
    from public.user_subscriptions us
    join public.subscription_packages sp on sp.id = us.package_id and sp.target_role = 'client'
  ),
  coach_subs as (
    select us.*
    from public.user_subscriptions us
    join public.subscription_packages sp on sp.id = us.package_id and sp.target_role = 'coach'
  ),
  rwe_client as (
    select rwe.*, coalesce(rwe.price, public._rc_payload_numeric(rwe.payload, 'price_in_purchased_currency'), public._rc_payload_numeric(rwe.payload, 'price')) as amount,
      coalesce(rwe.currency, public._rc_payload_text(rwe.payload, 'currency')) as event_currency,
      lower(coalesce(rwe.environment, public._rc_payload_text(rwe.payload, 'environment'), '')) as event_environment
    from public.revenuecat_webhook_events rwe
    where rwe.entitlement_id = 'client_pro'
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'activeCoaches', (select count(*) from public.profiles p join public.coach_profiles cp on cp.user_id = p.id where p.role = 'coach' and p.is_active and cp.billing_status = 'active'),
      'totalClients', (select count(*) from public.profiles where role = 'cliente'),
      'clientsWithoutCoach', (select count(*) from public.profiles p where p.role = 'cliente' and not exists (select 1 from public.coach_clients cc where cc.client_id = p.id and cc.status = 'active')),
      'clientProActive', (select count(*) from client_subs where status = 'active' and (expires_at is null or expires_at > now())),
      'clientProExpired', (select count(*) from client_subs where status = 'expired' or (expires_at is not null and expires_at <= now() and status not in ('refunded','revoked'))),
      'activeAutoPrograms', (select count(*) from public.client_program_cycles c where c.status = 'active' and not exists (select 1 from public.coach_clients cc where cc.client_id = c.client_id and cc.status = 'active')),
      'reviewsToCheck', (select count(*) from public.client_program_cycles c where c.status in ('pending_safety_review','pending_template')),
      'coachMonthRevenue', null,
      'clientProMonthRevenue', (select sum(amount) from rwe_client where amount is not null and event_environment not in ('sandbox','test') and date_trunc('month', coalesce(purchased_at, received_at)) = date_trunc('month', now())),
      'clientProMonthRevenueCurrency', (select min(event_currency) from rwe_client where amount is not null and event_environment not in ('sandbox','test') and date_trunc('month', coalesce(purchased_at, received_at)) = date_trunc('month', now())),
      'openTickets', 0
    ),
    'recentCoaches', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, ''), 'email', p.email, 'createdAt', p.created_at) order by p.created_at desc)
      from (select * from public.profiles where role = 'coach' order by created_at desc limit 5) p
    ), '[]'::jsonb),
    'recentClients', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, ''), 'email', p.email, 'createdAt', p.created_at) order by p.created_at desc)
      from (select * from public.profiles where role = 'cliente' order by created_at desc limit 5) p
    ), '[]'::jsonb),
    'notes', jsonb_build_object(
      'coachRevenue', 'Il backend corrente non memorizza importi transazione coach; KPI non calcolabile senza dati economici reali.',
      'clientProRevenue', 'Gli incassi Client Pro includono solo eventi RevenueCat non sandbox con price/currency disponibili nel payload o nelle colonne normalizzate.'
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.superadmin_get_dashboard() from public, anon;
grant execute on function public.superadmin_get_dashboard() to authenticated;

notify pgrst, 'reload schema';
