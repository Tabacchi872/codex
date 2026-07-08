-- FitCoach official Supabase schema.
-- This file contains no real keys. Run it once against a real Supabase project
-- (SQL editor or migration) before setting EXPO_PUBLIC_SUPABASE_URL/ANON_KEY in
-- mobile/.env: mobile/src/lib/auth-service.ts assumes these tables already exist.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'coach', 'cliente')),
  full_name text,
  email text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text,
  bio text,
  phone text,
  billing_status text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('private', 'freelancer', 'sole_proprietorship', 'company')),
  legal_name text not null,
  vat_number text,
  fiscal_code text,
  address text,
  postal_code text,
  city text,
  province text,
  country text not null,
  pec text,
  sdi_code text,
  billing_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    country <> 'Italia'
    or vat_number is null
    or pec is not null
    or sdi_code is not null
  )
);

create table if not exists public.registration_codes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled', 'expired')),
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses is null or max_uses >= 0),
  check (used_count >= 0),
  check (max_uses is null or used_count <= max_uses)
);

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  goal text,
  height numeric(6,2),
  weight numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  linked_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id),
  check (coach_id <> client_id)
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly numeric(10,2),
  price_yearly numeric(10,2),
  max_clients integer,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_billing (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null check (status in ('trial', 'active', 'past_due', 'canceled', 'blocked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  billing_profile_id uuid references public.billing_profiles(id) on delete set null,
  invoice_number text unique,
  status text not null default 'draft' check (status in ('draft', 'ready', 'issued', 'void', 'paid')),
  currency text not null default 'EUR',
  subtotal_cents integer not null default 0,
  tax_rate_basis_points integer,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  issued_at timestamptz,
  due_at timestamptz,
  period_start date,
  period_end date,
  payment_provider text,
  payment_reference text,
  sdi_status text,
  pdf_url text,
  xml_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subtotal_cents >= 0),
  check (tax_cents >= 0),
  check (total_cents >= 0)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_amount_cents integer not null default 0,
  tax_rate_basis_points integer,
  total_cents integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity > 0),
  check (unit_amount_cents >= 0),
  check (total_cents >= 0)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  total_sessions integer not null default 0,
  used_sessions integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('coach', 'cliente', 'superadmin')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(lower(email));
create index if not exists billing_profiles_coach_id_idx on public.billing_profiles(coach_id);
create index if not exists registration_codes_coach_id_idx on public.registration_codes(coach_id);
create index if not exists registration_codes_code_idx on public.registration_codes(code);
create index if not exists coach_clients_coach_id_idx on public.coach_clients(coach_id);
create index if not exists coach_clients_client_id_idx on public.coach_clients(client_id);
create index if not exists coach_billing_coach_id_idx on public.coach_billing(coach_id);
create index if not exists payment_events_coach_id_idx on public.payment_events(coach_id);
create index if not exists invoices_coach_id_idx on public.invoices(coach_id);
create index if not exists invoices_status_idx on public.invoices(status);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);
create index if not exists subscriptions_coach_client_idx on public.subscriptions(coach_id, client_id);
create index if not exists appointments_coach_start_idx on public.appointments(coach_id, start_at);
create index if not exists appointments_client_start_idx on public.appointments(client_id, start_at);
create index if not exists messages_coach_client_created_idx on public.messages(coach_id, client_id, created_at);
create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists coach_profiles_set_updated_at on public.coach_profiles;
create trigger coach_profiles_set_updated_at before update on public.coach_profiles
for each row execute function public.set_updated_at();

drop trigger if exists billing_profiles_set_updated_at on public.billing_profiles;
create trigger billing_profiles_set_updated_at before update on public.billing_profiles
for each row execute function public.set_updated_at();

drop trigger if exists client_profiles_set_updated_at on public.client_profiles;
create trigger client_profiles_set_updated_at before update on public.client_profiles
for each row execute function public.set_updated_at();

drop trigger if exists registration_codes_set_updated_at on public.registration_codes;
create trigger registration_codes_set_updated_at before update on public.registration_codes
for each row execute function public.set_updated_at();

drop trigger if exists coach_clients_set_updated_at on public.coach_clients;
create trigger coach_clients_set_updated_at before update on public.coach_clients
for each row execute function public.set_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists coach_billing_set_updated_at on public.coach_billing;
create trigger coach_billing_set_updated_at before update on public.coach_billing
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists invoice_items_set_updated_at on public.invoice_items;
create trigger invoice_items_set_updated_at before update on public.invoice_items
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at before update on public.push_tokens
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.billing_profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.registration_codes enable row level security;
alter table public.coach_clients enable row level security;
alter table public.plans enable row level security;
alter table public.coach_billing enable row level security;
alter table public.payment_events enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.appointments enable row level security;
alter table public.messages enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.push_tokens enable row level security;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'superadmin', false)
$$;

create or replace function public.is_coach_for_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients
    where coach_id = auth.uid()
      and client_id = target_client_id
      and status in ('active', 'invited')
  )
$$;

-- Crea automaticamente la riga public.profiles quando Supabase Auth crea un
-- utente (auth.users), leggendo ruolo/nome/telefono da raw_user_meta_data
-- (passati da mobile/src/lib/auth-service.ts in supabase.auth.signUp options.data).
-- Essendo security definer, questa funzione bypassa la RLS di profiles: e' il
-- modo standard Supabase per evitare il problema "l'utente non ha ancora una
-- riga in profiles quindi le policy self-check falliscono".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'cliente'),
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Incrementa used_count in modo controllato (security definer) invece di dare
-- ai client una policy UPDATE aperta su registration_codes: un cliente che si
-- registra non e' il proprietario del codice (coach_id <> auth.uid()) quindi
-- non potrebbe farlo tramite una policy "owner", e una policy aperta a
-- qualunque utente autenticato permetterebbe di manomettere il contatore di
-- un coach qualsiasi.
create or replace function public.increment_registration_code_usage(code_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registration_codes
  set used_count = used_count + 1
  where id = code_id and status = 'active';
end;
$$;

grant execute on function public.increment_registration_code_usage(uuid) to authenticated;

create policy profiles_superadmin_all on public.profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());
create policy profiles_coach_reads_own_clients on public.profiles
  for select using (public.is_coach_for_client(id));

create policy coach_profiles_superadmin_all on public.coach_profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy coach_profiles_owner_read_update on public.coach_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Lettura pubblica minima (business_name/bio/billing_status) necessaria per
-- validare "il coach puo' accettare nuovi clienti" PRIMA che il cliente abbia
-- un account (vedi signUpClientWithCoachCode in auth-service.ts). billing_profiles
-- (dati fiscali) resta invece privata: nessuna policy pubblica su quella tabella.
create policy coach_profiles_public_read on public.coach_profiles
  for select using (true);

create policy billing_profiles_superadmin_all on public.billing_profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy billing_profiles_coach_read_update_own on public.billing_profiles
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy client_profiles_superadmin_all on public.client_profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy client_profiles_self_read_update on public.client_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy client_profiles_coach_for_client on public.client_profiles
  for all using (public.is_coach_for_client(user_id)) with check (public.is_coach_for_client(user_id));

create policy registration_codes_superadmin_all on public.registration_codes
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy registration_codes_coach_read_own on public.registration_codes
  for select using (coach_id = auth.uid());
create policy registration_codes_coach_insert_own on public.registration_codes
  for insert with check (coach_id = auth.uid());
create policy registration_codes_coach_update_own on public.registration_codes
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- Lettura pubblica dei soli codici attivi: necessaria perche' un cliente deve
-- poter verificare un codice PRIMA di avere un account (nessuna sessione,
-- quindi nessun coach_id = auth.uid() possibile). Espone code/coach_id/status/
-- max_uses/used_count/expires_at, non dati sensibili: il codice stesso e' gia'
-- pensato per essere condiviso dal coach ai propri clienti. L'incremento di
-- used_count non passa da qui ma dalla funzione increment_registration_code_usage.
create policy registration_codes_public_read_active on public.registration_codes
  for select using (status = 'active');

create policy coach_clients_superadmin_all on public.coach_clients
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy coach_clients_coach_scope on public.coach_clients
  for select using (coach_id = auth.uid());
create policy coach_clients_client_scope on public.coach_clients
  for select using (client_id = auth.uid());
-- Il cliente appena registrato collega se stesso al coach (client_id = auth.uid()).
-- NOTA Fase 1: questa policy non verifica qui che sia stato usato un codice
-- valido (quel controllo avviene lato app in auth-service.ts prima di questo
-- insert) — un utente autenticato potrebbe in teoria auto-collegarsi a un
-- coach_id arbitrario. Prima della produzione questo insert va spostato in una
-- funzione security definer (register_client_with_code, gia' prevista in
-- SUPABASE_SCHEMA.md) che valida il codice server-side in modo atomico.
create policy coach_clients_client_self_insert on public.coach_clients
  for insert with check (client_id = auth.uid());

create policy plans_read_active on public.plans
  for select using (is_active or public.is_superadmin());
create policy plans_superadmin_write on public.plans
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy coach_billing_superadmin_all on public.coach_billing
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy coach_billing_owner_read on public.coach_billing
  for select using (coach_id = auth.uid());

create policy payment_events_superadmin_all on public.payment_events
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy payment_events_coach_read on public.payment_events
  for select using (coach_id = auth.uid());

create policy invoices_superadmin_all on public.invoices
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy invoices_coach_read_own on public.invoices
  for select using (coach_id = auth.uid());

create policy invoice_items_superadmin_all on public.invoice_items
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy invoice_items_coach_read_own on public.invoice_items
  for select using (
    exists (
      select 1
      from public.invoices
      where invoices.id = invoice_items.invoice_id
        and invoices.coach_id = auth.uid()
    )
  );

create policy subscriptions_superadmin_all on public.subscriptions
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy subscriptions_coach_scope on public.subscriptions
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy subscriptions_client_read on public.subscriptions
  for select using (client_id = auth.uid());

create policy appointments_superadmin_all on public.appointments
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy appointments_coach_scope on public.appointments
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy appointments_client_read on public.appointments
  for select using (client_id = auth.uid());

create policy messages_superadmin_all on public.messages
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy messages_coach_scope on public.messages
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid() and sender_id = auth.uid());
create policy messages_client_scope on public.messages
  for all using (client_id = auth.uid()) with check (client_id = auth.uid() and sender_id = auth.uid());

create policy admin_notifications_superadmin_all on public.admin_notifications
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy push_tokens_superadmin_all on public.push_tokens
  for all using (public.is_superadmin()) with check (public.is_superadmin());
create policy push_tokens_owner_scope on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Security notes:
-- - Superadmin sees and manages all operational, plan, and billing tables.
-- - Coach rows are scoped by coach_id and coach_clients; coaches cannot read other coaches by default.
-- - Cliente rows are scoped to auth.uid() and assigned records only.
-- - Fase 1 (mobile/src/lib/auth-service.ts): la validazione del codice coach e il
--   collegamento coach_clients avvengono client-side con policy pubbliche/self-insert
--   permissive (vedi commenti sopra su registration_codes/coach_clients), non ancora
--   tramite una RPC/Edge Function security definer che valida tutto atomicamente
--   lato server. Da rafforzare prima della produzione con register_client_with_code().
-- - Superadmin accounts are not publicly registrable.
-- - Clienti do not receive policies for admin_notifications, plans writes, or coach_billing writes.
-- - Billing profiles, invoices and invoice_items prepare future invoicing only; this schema does not emit fiscal documents.
-- - Italy ordinary VAT is commonly 22%, but rates and regimes must be confirmed by an accountant before automation.
-- - Italian e-invoicing through SdI must be handled by a compliant provider when applicable.
-- - Apple/Google mobile payments and future Stripe web payments must be reconciled separately before invoice automation.
-- - Payment/provider writes should move to service-role Edge Functions when real payments are added.
-- - IMPORTANTE Fase 1: in Authentication -> Providers -> Email, "Confirm email" va
--   disattivato perche' il flusso attuale scriva coach_profiles/billing_profiles/
--   registration_codes/client_profiles/coach_clients subito dopo signUp nella stessa
--   sessione. Se "Confirm email" resta attivo, l'utente Auth viene creato ma queste
--   righe falliscono (nessuna sessione attiva finche' non conferma) — errore visibile
--   in UI (auth-service.ts non va in crash), non dato silenzioso. Vedi docs/EMAIL_SETUP.md.
