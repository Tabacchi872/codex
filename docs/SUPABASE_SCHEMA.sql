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
  -- true dopo che la Edge Function send-temporary-credentials ha impostato una
  -- password provvisoria: blocca l'accesso normale (vedi auth-gate.tsx) finche'
  -- l'utente non la cambia con una propria (updatePassword in auth-service.ts
  -- azzera il flag). Mai impostato a true dal client mobile direttamente.
  must_change_password boolean not null default false,
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

-- Genera un segmento di 4 caratteri per il codice coach FC-XXXX-XXXX, con lo
-- stesso alfabeto (niente 0/1/I/O ambigui) di generateCoachCode()
-- (mobile/src/lib/coach-code.ts), cosi' i codici creati lato DB dal trigger
-- sotto sono nello stesso formato di quelli generati lato client.
create or replace function public.random_coach_code_segment()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1),
    ''
  )
  from generate_series(1, 4);
$$;

-- Trigger definitivo per "Confirm email" ON: crea automaticamente TUTTE le
-- righe dipendenti da una registrazione (profiles sempre; coach_profiles/
-- billing_profiles/registration_codes per un coach; client_profiles/
-- coach_clients per un cliente) leggendo solo da auth.users.raw_user_meta_data
-- (i campi passati da mobile/src/lib/auth-service.ts in supabase.auth.signUp
-- options.data). Essendo security definer, bypassa la RLS: puo' scrivere
-- anche senza una sessione autenticata, che e' esattamente il caso "Confirm
-- email" attivo (nessuna sessione esiste finche' l'utente non conferma). Il
-- trigger scatta SUBITO all'insert in auth.users, indipendentemente dalla
-- conferma email.
--
-- Isolamento dei fallimenti: ogni gruppo di insert (coach_profiles,
-- billing_profiles, registration_codes, client_profiles+coach_clients) e'
-- avvolto nel proprio blocco begin/exception, cosi' un fallimento in uno
-- (es. billing_profiles che viola il check "Italia + P.IVA richiede PEC o
-- SDI") non fa rollback della riga profiles gia' scritta ne' impedisce agli
-- altri gruppi di essere tentati. Il blocco "exception when others" piu'
-- esterno resta una difesa finale solo per l'insert di profiles: non deve mai
-- bloccare la creazione dell'utente Auth stesso.
--
-- Fallback lato app invariato: mobile/src/lib/auth-service.ts
-- (ensureCoachOnboarding/ensureClientOnboarding, chiamate da login-screen.tsx
-- al primo login) restano come rete di sicurezza idempotente per i soli casi
-- in cui questo trigger non sia riuscito a scrivere una riga (es. dati di
-- fatturazione non validi): controllano se la riga esiste gia' prima di
-- inserirla, quindi non duplicano ne' incrementano used_count due volte se il
-- trigger ha gia' fatto il lavoro.
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
        -- public._link_client_to_coach (definita piu' in basso in questo file,
        -- sezione "Limite clienti coach", 2026-07-12): controlla atomicamente
        -- codice/abbonamento attivo/limite max_clients prima di collegare —
        -- se il coach non ha un abbonamento attivo o ha raggiunto il limite,
        -- solleva un'eccezione qui catturata (nessun collegamento silenzioso
        -- oltre il limite). plpgsql risolve le chiamate a funzioni solo a
        -- runtime, quindi l'ordine di definizione nel file non è un problema:
        -- alla prima vera registrazione questa funzione esiste già.
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
    raise warning 'handle_new_user fallito per user %: %', new.id, sqlerrm;
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
-- Necessarie per ensureProfileForCurrentUser/signInWithEmail (mobile/src/lib/
-- auth-service.ts): fallback client-side che ricrea/aggiorna la propria riga
-- profiles se il trigger handle_new_user non l'ha creata (es. trigger non
-- ancora installato sul progetto al momento della registrazione). Senza
-- queste due policy, un utente autenticato non potrebbe mai scrivere la
-- propria riga profiles (solo il trigger, security definer, puo' bypassare la
-- RLS) e resterebbe bloccato su "profilo non trovato" per sempre.
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
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
-- pensato per essere condiviso dal coach ai propri clienti.
create policy registration_codes_public_read_active on public.registration_codes
  for select using (status = 'active');
-- Il cliente appena registrato (non proprietario del codice: coach_id <> auth.uid())
-- incrementa used_count sul proprio codice attivo tramite un update diretto da
-- auth-service.ts (preferito alla funzione increment_registration_code_usage per
-- semplicita' Fase 1). Stesso compromesso di sicurezza gia' documentato sopra:
-- un utente autenticato potrebbe in teoria incrementare used_count di un codice
-- che non ha usato — da irrigidire insieme al resto della RLS Fase 1 prima della
-- produzione (register_client_with_code() atomica lato server).
create policy registration_codes_increment_usage on public.registration_codes
  for update using (status = 'active') with check (status = 'active');

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
-- - AGGIORNATO (trigger definitivo, docs/EMAIL_SETUP.md): "Confirm email" puo' restare
--   attivo. Il trigger handle_new_user (security definer, bypassa la RLS) crea ORA
--   direttamente, all'insert in auth.users, TUTTE le righe dipendenti da
--   raw_user_meta_data: profiles sempre; coach_profiles/billing_profiles/
--   registration_codes per un coach; client_profiles/coach_clients (+ incremento
--   used_count) per un cliente — indipendentemente da "Confirm email" (scatta
--   all'insert, non alla conferma, quindi non serve alcuna sessione). Ogni gruppo di
--   insert e' isolato nel proprio blocco begin/exception, cosi' un fallimento su un
--   gruppo (es. billing_profiles che viola il check Italia+P.IVA) non blocca ne'
--   profiles ne' gli altri gruppi. mobile/src/lib/auth-service.ts
--   (ensureCoachOnboarding/ensureClientOnboarding, chiamate da login-screen.tsx al
--   primo login; signInWithEmail/ensureProfileForCurrentUser per profiles) restano
--   come rete di sicurezza idempotente solo per i casi in cui il trigger non sia
--   riuscito a scrivere una riga specifica, non piu' come percorso primario. Vedi
--   anche docs/BUGS.md BUG-008 (causa originale, ora risolta alla radice dal trigger).

-- ============================================================================
-- Video esercizi (fase reale, 2026-07-11): coach carica/sostituisce un video
-- per un esercizio della libreria locale (mobile/src/data/exercise-library.ts,
-- 44 esercizi condivisi, NON in Supabase — nessuna tabella "exercises" esiste
-- qui apposta: gli esercizi restano fuori scope di questa migrazione, exercise_id
-- e' un semplice testo che combacia con l'id locale, non una foreign key).
-- Un video e' sempre scoped a (coach_id, exercise_id): coach diversi possono
-- caricare video diversi per lo stesso esercizio globale (es. filmati nella
-- propria palestra); un cliente vede solo il video caricato dal PROPRIO coach,
-- mai quello di un coach a cui non e' collegato. Vedi docs/SUPABASE_STORAGE_VIDEO.md
-- per bucket, policy Storage e istruzioni di test.
create table if not exists public.exercise_videos (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  video_path text not null,
  video_url text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, exercise_id)
);

create index if not exists exercise_videos_exercise_id_idx on public.exercise_videos(exercise_id);
create index if not exists exercise_videos_coach_id_idx on public.exercise_videos(coach_id);

drop trigger if exists exercise_videos_set_updated_at on public.exercise_videos;
create trigger exercise_videos_set_updated_at before update on public.exercise_videos
for each row execute function public.set_updated_at();

alter table public.exercise_videos enable row level security;

-- Snippet pensato per essere rieseguibile senza errori (drop-if-exists su
-- ogni policy prima di ricrearla), come le altre sezioni aggiunte dopo lo
-- schema iniziale (vedi trigger handle_new_user piu' sopra) — permette di
-- rilanciare questo blocco da solo se la tabella risultasse assente/parziale
-- su un progetto reale senza dover rieseguire tutto il file.
drop policy if exists exercise_videos_superadmin_all on public.exercise_videos;
create policy exercise_videos_superadmin_all on public.exercise_videos
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Il coach gestisce solo i propri video (upload/sostituzione/eliminazione),
-- mai quelli di un altro coach. coach_id viene sempre valorizzato lato app con
-- l'id reale della sessione Supabase (getCurrentSession(), mobile/src/lib/
-- auth-service.ts) — MAI con lo useAuthStore().currentCoachId locale, che e'
-- l'id del mirror demo in superadmin-store e non coincide con auth.uid().
drop policy if exists exercise_videos_coach_own_all on public.exercise_videos;
create policy exercise_videos_coach_own_all on public.exercise_videos
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Il cliente vede il video del PROPRIO coach (tramite coach_clients), per
-- qualunque esercizio quel coach abbia caricato — mai il video di un coach a
-- cui non e' collegato, anche se l'esercizio (id locale) e' lo stesso per tutti.
drop policy if exists exercise_videos_client_read_own_coach on public.exercise_videos;
create policy exercise_videos_client_read_own_coach on public.exercise_videos
  for select using (
    exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercise_videos.coach_id
        and coach_clients.status in ('active', 'invited')
    )
  );

-- Forza PostgREST a rileggere subito lo schema: se dopo aver eseguito questo
-- blocco l'app continua a ricevere "Could not find the table
-- 'public.exercise_videos' in the schema cache", PostgREST potrebbe non aver
-- ancora ricaricato lo schema (di norma automatico dopo una DDL, ma non
-- istantaneo) — vedi anche il pulsante "Reload schema" in Settings -> API.
notify pgrst, 'reload schema';

-- Il bucket Storage "exercise-videos" e le sue policy (storage.objects) NON
-- sono qui: vanno creati ed eseguiti separatamente, vedi lo snippet completo
-- in docs/SUPABASE_STORAGE_VIDEO.md (bucket pubblico in lettura, scrittura
-- solo nella propria cartella {coach_id}/...).

-- Credenziali provvisorie via email (coach genera per un cliente, o
-- superadmin per un coach): vedi docs/SUPABASE_TEMP_CREDENTIALS.md per la
-- Edge Function send-temporary-credentials. Idempotente: su un progetto dove
-- public.profiles esiste gia' senza questa colonna (creato prima di questa
-- modifica), il blocco sotto la aggiunge senza toccare le righe esistenti
-- (default false = nessun utente gia' registrato viene bloccato al prossimo
-- accesso). La policy profiles_self_update (sopra) copre gia' la scrittura di
-- questo campo da parte dell'utente stesso al termine del cambio password:
-- nessuna nuova policy necessaria.
alter table public.profiles add column if not exists must_change_password boolean not null default false;

notify pgrst, 'reload schema';

-- ============================================================================
-- Pacchetti acquistabili coach/cliente (2026-07-12): due cataloghi separati,
-- gestiti solo dal superadmin, distinti dai concetti gia' esistenti:
--   - target_role='coach' NON e' lo stesso di plans/coach_billing (quello e'
--     il piano SaaS interno dell'app, gia' presente); qui e' un pacchetto
--     acquistabile dal coach con limite clienti e funzionalita' incluse.
--   - target_role='client' NON e' lo stesso di subscriptions (quello e' un
--     pacchetto sessioni creato dal singolo coach per il proprio cliente);
--     qui e' un pacchetto acquistabile creato dal superadmin, uguale per
--     tutti i coach.
-- user_subscriptions traccia l'abbonamento di un utente (coach o cliente) a
-- un subscription_packages. Nessun pagamento reale e' collegato qui: la UI
-- (mobile/src/lib/package-checkout-service.ts) prepara solo il flusso senza
-- simulare un acquisto completato - righe "vere" in user_subscriptions
-- vengono scritte solo dal superadmin o da un futuro backend/webhook con
-- service role, stesso pattern gia' usato per payment_events.
create table if not exists public.subscription_packages (
  id uuid primary key default gen_random_uuid(),
  target_role text not null check (target_role in ('coach', 'client')),
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  duration_value integer not null check (duration_value > 0),
  duration_unit text not null check (duration_unit in ('days', 'months')),
  max_clients integer,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_packages_max_clients_only_coach
    check (target_role = 'coach' or max_clients is null)
);

create index if not exists subscription_packages_target_role_idx
  on public.subscription_packages(target_role, is_active, sort_order);

drop trigger if exists subscription_packages_set_updated_at on public.subscription_packages;
create trigger subscription_packages_set_updated_at before update on public.subscription_packages
for each row execute function public.set_updated_at();

alter table public.subscription_packages enable row level security;

drop policy if exists subscription_packages_superadmin_all on public.subscription_packages;
create policy subscription_packages_superadmin_all on public.subscription_packages
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Coach legge solo i pacchetti attivi destinati a lui (target_role='coach');
-- cliente legge solo i pacchetti attivi destinati a lui (target_role='client').
-- current_app_role() e' gia' definita sopra (legge profiles.role per
-- auth.uid()); il valore applicativo del ruolo cliente resta 'cliente' (come
-- nel check constraint di profiles), 'client' qui e' solo il valore della
-- colonna target_role, in inglese come le altre colonne enum di questa tabella.
drop policy if exists subscription_packages_coach_read_active on public.subscription_packages;
create policy subscription_packages_coach_read_active on public.subscription_packages
  for select using (
    is_active
    and target_role = 'coach'
    and public.current_app_role() = 'coach'
  );

drop policy if exists subscription_packages_client_read_active on public.subscription_packages;
create policy subscription_packages_client_read_active on public.subscription_packages
  for select using (
    is_active
    and target_role = 'client'
    and public.current_app_role() = 'cliente'
  );

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.subscription_packages(id) on delete restrict,
  status text not null check (status in ('pending', 'active', 'expired', 'canceled')),
  starts_at timestamptz,
  expires_at timestamptz,
  payment_provider text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_id_idx on public.user_subscriptions(user_id);
create index if not exists user_subscriptions_package_id_idx on public.user_subscriptions(package_id);

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at before update on public.user_subscriptions
for each row execute function public.set_updated_at();

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_superadmin_all on public.user_subscriptions;
create policy user_subscriptions_superadmin_all on public.user_subscriptions
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Ogni utente legge solo il proprio abbonamento/storico. Deliberatamente
-- nessuna policy insert/update per coach/cliente: senza un provider di
-- pagamento reale collegato (Apple/Google/Stripe), le uniche righe scrivibili
-- oggi sono quelle create dal superadmin (policy _all sopra) - un utente non
-- puo' auto-assegnarsi un abbonamento attivo dal client. Quando un provider
-- di pagamento reale sara' collegato, l'inserimento post-pagamento andra'
-- fatto da un webhook/Edge Function con service role (bypassa la RLS), non
-- da una nuova policy pubblica qui.
drop policy if exists user_subscriptions_self_read on public.user_subscriptions;
create policy user_subscriptions_self_read on public.user_subscriptions
  for select using (user_id = auth.uid());

-- Un utente (coach o cliente) puo' leggere il pacchetto collegato al PROPRIO
-- abbonamento anche se il superadmin lo ha nel frattempo disattivato
-- (is_active=false) — altrimenti subscription_packages_coach_read_active/
-- _client_read_active (sopra) nasconderebbero il nome/dettagli del pacchetto
-- che l'utente ha davvero, rendendo "Il tuo pacchetto" illeggibile.
drop policy if exists subscription_packages_read_via_own_subscription on public.subscription_packages;
create policy subscription_packages_read_via_own_subscription on public.subscription_packages
  for select using (
    exists (
      select 1 from public.user_subscriptions
      where user_subscriptions.package_id = subscription_packages.id
        and user_subscriptions.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- Limite clienti coach collegato all'abbonamento (2026-07-12): un coach puo'
-- avere al piu' UN abbonamento attivo alla volta (nessun accumulo di slot tra
-- rinnovi/cambi pacchetto — il pacchetto attivo corrente determina sempre il
-- limite corrente), e il collegamento di un nuovo cliente (coach_clients) e'
-- validato atomicamente lato server contro quel limite, mai solo lato app.

-- Garantisce un solo abbonamento 'active' per utente alla volta: quando una
-- riga diventa 'active', ogni ALTRA riga 'active' dello stesso user_id viene
-- automaticamente marcata 'canceled'. Cosi' "il coach acquista/rinnova un
-- pacchetto" non accumula mai slot: la capacita' (vedi _coach_capacity sotto)
-- legge sempre l'UNICA riga attiva corrente. Nessun payment reale scrive qui
-- oggi (solo il superadmin puo' scrivere user_subscriptions, vedi RLS sopra):
-- questo trigger e' pronto anche per quando un webhook/Edge Function con
-- service role iniziera' a farlo davvero.
create or replace function public.enforce_single_active_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.user_subscriptions
    set status = 'canceled'
    where user_id = new.user_id
      and status = 'active'
      and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_subscriptions_single_active on public.user_subscriptions;
create trigger user_subscriptions_single_active
  after insert or update of status on public.user_subscriptions
  for each row execute function public.enforce_single_active_user_subscription();

-- Capacita' clienti corrente di un coach: pacchetto attivo (target_role
-- 'coach', status 'active', non scaduto), quanti clienti reali sono
-- collegati (coach_clients.status='active'), quanti ne mancano. Funzione
-- interna (prefisso _, EXECUTE revocato da anon/authenticated sotto): usata
-- solo da altre funzioni SECURITY DEFINER di questo file, mai chiamata
-- direttamente via RPC dal client mobile.
create or replace function public._coach_capacity(p_coach_id uuid)
returns table(
  has_active_subscription boolean,
  package_id uuid,
  package_name text,
  max_clients integer,
  used_clients integer,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  select us.package_id as package_id, sp.name as name, sp.max_clients as max_clients, us.expires_at as expires_at
  into v_sub
  from public.user_subscriptions us
  join public.subscription_packages sp on sp.id = us.package_id
  where us.user_id = p_coach_id
    and us.status = 'active'
    and sp.target_role = 'coach'
    and (us.expires_at is null or us.expires_at > now())
  order by us.created_at desc
  limit 1;

  return query
  select
    v_sub.package_id is not null,
    v_sub.package_id,
    v_sub.name,
    v_sub.max_clients,
    (select count(*)::integer from public.coach_clients where coach_id = p_coach_id and status = 'active'),
    v_sub.expires_at;
end;
$$;

revoke all on function public._coach_capacity(uuid) from public, anon, authenticated;

-- Collega atomicamente un cliente gia' autenticato (auth.users gia' creato)
-- al coach del codice usato in registrazione, rispettando il limite
-- max_clients del pacchetto coach attivo. Funzione interna (prefisso _,
-- EXECUTE revocato da anon/authenticated sotto): il client mobile la
-- raggiunge sempre tramite register_client_with_code (RPC pubblica, sotto) o
-- tramite il trigger handle_new_user — mai direttamente, perche' qui
-- p_client_id non e' verificato contro auth.uid() (lo fa il chiamante).
--
-- Idempotente: se il cliente e' gia' collegato a QUALSIASI coach, non fa
-- nulla e non solleva errori (evita ricontrolli/doppio incremento se chiamata
-- sia dal trigger handle_new_user sia, di nuovo, dall'RPC lato app dopo il
-- login). Anti race-condition: pg_advisory_xact_lock sullo stesso coach_id
-- serializza i controlli di capacita' per quel coach, cosi' due registrazioni
-- concorrenti con l'ultimo posto libero non possono passare entrambe il
-- controllo prima che l'altra abbia gia' incrementato il conteggio reale.
create or replace function public._link_client_to_coach(p_client_id uuid, p_coach_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_link uuid;
  v_code_row public.registration_codes%rowtype;
  v_capacity record;
begin
  select id into v_existing_link from public.coach_clients where client_id = p_client_id limit 1;
  if v_existing_link is not null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_coach_id::text));

  if p_code is not null then
    select * into v_code_row
    from public.registration_codes
    where code = p_code and coach_id = p_coach_id
    for update;

    if not found or v_code_row.status <> 'active' then
      raise exception 'INVALID_CODE: codice coach non valido o disattivato';
    end if;
    if v_code_row.expires_at is not null and v_code_row.expires_at < now() then
      raise exception 'INVALID_CODE: codice coach scaduto';
    end if;
    if v_code_row.max_uses is not null and v_code_row.used_count >= v_code_row.max_uses then
      raise exception 'INVALID_CODE: limite di utilizzi del codice raggiunto';
    end if;
  end if;

  select * into v_capacity from public._coach_capacity(p_coach_id);

  if not v_capacity.has_active_subscription then
    raise exception 'SUBSCRIPTION_REQUIRED: il coach non ha un abbonamento attivo';
  end if;
  if v_capacity.max_clients is not null and v_capacity.used_clients >= v_capacity.max_clients then
    raise exception 'CLIENT_LIMIT_REACHED: limite clienti del coach raggiunto';
  end if;

  insert into public.client_profiles (user_id)
  values (p_client_id)
  on conflict (user_id) do nothing;

  insert into public.coach_clients (coach_id, client_id, status, linked_by_code)
  values (p_coach_id, p_client_id, 'active', p_code);

  if p_code is not null then
    update public.registration_codes set used_count = used_count + 1 where id = v_code_row.id;
  end if;
end;
$$;

revoke all on function public._link_client_to_coach(uuid, uuid, text) from public, anon, authenticated;

-- RPC pubblica: il cliente autenticato (deve gia' avere una sessione, quindi
-- chiamata dopo signUp con sessione immediata o al primo login se "Confirm
-- email" era attivo — vedi mobile/src/lib/auth-service.ts,
-- completeClientOnboarding/ensureClientOnboarding) chiede di essere collegato
-- al coach del proprio codice. auth.uid() e' sempre il cliente stesso: nessun
-- utente puo' collegare un ALTRO utente arbitrario passando un p_client_id
-- diverso (a differenza della funzione interna sopra, qui non c'e' alcun
-- parametro client_id da falsificare).
create or replace function public.register_client_with_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  select coach_id into v_coach_id
  from public.registration_codes
  where code = p_code
  limit 1;

  if v_coach_id is null then
    raise exception 'INVALID_CODE: codice coach non valido';
  end if;

  perform public._link_client_to_coach(auth.uid(), v_coach_id, p_code);
end;
$$;

grant execute on function public.register_client_with_code(text) to authenticated;

-- RPC pubblica di sola lettura, chiamabile ANCHE da un utente non ancora
-- autenticato (anon): serve per rifiutare la registrazione PRIMA di creare
-- l'account Supabase Auth (signUp), quando il coach non ha un abbonamento
-- attivo o ha gia' raggiunto il limite clienti — stesso principio gia' usato
-- per la validazione del codice (registration_codes_public_read_active), che
-- avviene anch'essa prima di signUp. Non espone numeri (used/max/nome
-- pacchetto): solo un booleano + un motivo, sufficiente per il messaggio
-- "Abbonamento necessario" / "Limite clienti raggiunto" lato UI.
create or replace function public.can_coach_accept_client(p_coach_id uuid)
returns table(allowed boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
begin
  select * into c from public._coach_capacity(p_coach_id);

  if not c.has_active_subscription then
    return query select false, 'subscription_required';
    return;
  end if;
  if c.max_clients is not null and c.used_clients >= c.max_clients then
    return query select false, 'client_limit_reached';
    return;
  end if;
  return query select true, null::text;
end;
$$;

grant execute on function public.can_coach_accept_client(uuid) to anon, authenticated;

-- RPC pubblica autenticata: capacita' completa (con i numeri) per il coach
-- stesso (area "Clienti", contatore "Clienti utilizzati: X su Y" / "Posti
-- disponibili: Z") o per il superadmin su un coach qualsiasi (pannello
-- superadmin, dettaglio/lista coach). Chiunque altro viene rifiutato.
create or replace function public.get_coach_client_capacity(p_coach_id uuid)
returns table(
  has_active_subscription boolean,
  package_name text,
  max_clients integer,
  used_clients integer,
  available_slots integer,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (auth.uid() <> p_coach_id and not public.is_superadmin()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    c.has_active_subscription,
    c.package_name,
    c.max_clients,
    c.used_clients,
    case when c.max_clients is null then null else greatest(c.max_clients - c.used_clients, 0) end,
    c.expires_at
  from public._coach_capacity(p_coach_id) c;
end;
$$;

grant execute on function public.get_coach_client_capacity(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- Libreria esercizi FitCoach + integrazione catalogo YMove (2026-07-12,
-- opzione B: il coach crea esercizi FitCoach partendo dal catalogo YMove,
-- mai un semplice link esterno). Prima di questa sezione NON esisteva alcuna
-- tabella esercizi su Supabase: la libreria era ed e' ancora, per gli
-- esercizi "storici", un file locale condiviso (mobile/src/data/
-- exercise-library.ts, 44 esercizi, id testuali tipo 'petto-panca-piana') —
-- questa tabella NON li sostituisce, coesiste: mobile/src/hooks/
-- use-exercise-resolver.ts prova prima quel file locale, poi questa tabella.
--
-- source='custom': esercizio creato manualmente da un coach (coach_id
-- valorizzato, visibile solo a quel coach + ai suoi clienti tramite
-- coach_clients, stesso scoping gia' usato per exercise_videos).
-- source='ymove': esercizio importato dal catalogo YMove. QUESTI sono
-- condivisi globalmente (coach_id NULL apposta): se un coach importa un
-- esercizio YMove gia' importato da un altro coach, si riusa la stessa riga
-- (vincolo univoco su ymove_exercise_id) invece di duplicare — stesso
-- principio "riutilizza, non duplicare" richiesto esplicitamente. Nessun URL
-- video/thumbnail/HLS viene MAI salvato qui: quei link sono firmati e
-- scadono, vengono richiesti ogni volta al bisogno tramite l'Edge Function
-- ymove-exercises (vedi supabase/functions/ymove-exercises/index.ts).
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  technical_notes text,
  muscle_group text,
  equipment text,
  difficulty text,
  exercise_type text,
  source text not null default 'custom' check (source in ('custom', 'ymove')),
  ymove_exercise_id text,
  ymove_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un esercizio 'ymove' e' sempre globale (coach_id null); un esercizio
  -- 'custom' appartiene sempre a un coach preciso. Evita lo stato ambiguo
  -- "custom ma senza proprietario" o "ymove ma intestato a un coach".
  constraint exercises_source_ownership check (
    (source = 'ymove' and coach_id is null) or (source = 'custom' and coach_id is not null)
  )
);

-- Riuso globale: un esercizio YMove va importato una sola volta in assoluto,
-- non una volta per coach (vedi commento sopra).
create unique index if not exists exercises_ymove_exercise_id_unique
  on public.exercises(ymove_exercise_id) where ymove_exercise_id is not null;

create index if not exists exercises_coach_id_idx on public.exercises(coach_id);
create index if not exists exercises_source_idx on public.exercises(source);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at before update on public.exercises
for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;

drop policy if exists exercises_superadmin_all on public.exercises;
create policy exercises_superadmin_all on public.exercises
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Catalogo YMove importato: condiviso, leggibile da chiunque sia autenticato
-- (coach o cliente) — sono solo metadati di un esercizio (nome/muscolo/
-- attrezzatura/difficolta'/istruzioni), mai dati sensibili, mai un video/URL.
drop policy if exists exercises_ymove_read_all on public.exercises;
create policy exercises_ymove_read_all on public.exercises
  for select using (source = 'ymove' and auth.uid() is not null);

-- Esercizi custom: il coach proprietario gestisce i propri (stesso scoping di
-- exercise_videos), il cliente collegato a quel coach li legge (mai scrive).
drop policy if exists exercises_coach_own_all on public.exercises;
create policy exercises_coach_own_all on public.exercises
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists exercises_client_read_own_coach on public.exercises;
create policy exercises_client_read_own_coach on public.exercises
  for select using (
    source = 'custom'
    and exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercises.coach_id
        and coach_clients.status in ('active', 'invited')
    )
  );

-- Import: un coach autenticato puo' inserire SOLO un proprio 'custom' o un
-- 'ymove' condiviso (mai un 'ymove' intestato a se stesso, mai un 'custom' di
-- un altro coach) — coerente col vincolo exercises_source_ownership sopra.
-- L'eliminazione E la modifica dei testi di un 'ymove' condiviso restano
-- riservate al superadmin (policy _superadmin_all): nessun coach puo'
-- modificare/eliminare il testo GLOBALE di un esercizio importato da un
-- altro coach. La personalizzazione per-coach del testo italiano vive nella
-- tabella exercise_text_overrides (sezione "Traduzione italiana..." piu' in
-- basso) — vedi docs/DECISIONS.md, 2026-07-13, per il perche' la policy
-- "wiki-style" precedente (che permetteva a QUALUNQUE coach di modificare il
-- testo condiviso) e' stata rimossa: un coach non deve poter cambiare cio'
-- che vedono gli altri coach.
drop policy if exists exercises_coach_insert on public.exercises;
create policy exercises_coach_insert on public.exercises
  for insert
  with check (
    public.current_app_role() = 'coach'
    and (
      (source = 'custom' and coach_id = auth.uid())
      or (source = 'ymove' and coach_id is null)
    )
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- Traduzione italiana esercizi YMove + associazione video su esercizi
-- esistenti (2026-07-13). Due estensioni distinte:
--
-- 1) Traduzione: name/description/technical_notes di public.exercises
--    restano i testi ATTUALMENTE mostrati/modificabili (in italiano dopo
--    l'import, modificabili a mano dal coach in qualunque momento dopo) — non
--    sono nuove colonne, sono quelle gia' esistenti. Le tre colonne nuove
--    sotto conservano SEPARATAMENTE il testo originale YMove cosi' come
--    ricevuto, mai piu' toccato dopo l'import (nessuna ri-traduzione ad ogni
--    apertura: la traduzione avviene una sola volta, lato mobile, in
--    fitcoach-exercises-service.ts, chiamando l'azione 'translate' della Edge
--    Function SOLO quando si crea la riga la prima volta).
alter table public.exercises add column if not exists ymove_original_title text;
alter table public.exercises add column if not exists ymove_original_description text;
alter table public.exercises add column if not exists ymove_original_instructions text;

-- CORREZIONE (2026-07-13, continuazione): la policy exercises_coach_update_
-- ymove_text (rimossa qui) permetteva a QUALUNQUE coach di modificare
-- name/description/technical_notes di un esercizio 'ymove' condiviso — un
-- bug di design, non solo di sicurezza: un coach vedeva il proprio testo
-- cambiare a sua insaputa se un altro coach modificava lo stesso esercizio
-- condiviso. Ora SOLO il superadmin puo' modificare il testo GLOBALE
-- (gia' coperto da exercises_superadmin_all sopra, nessuna policy aggiuntiva
-- serve). Ogni coach personalizza il proprio testo nella tabella dedicata
-- sotto, mai nella riga condivisa.
drop policy if exists exercises_coach_update_ymove_text on public.exercises;

-- Personalizzazione per-coach del testo italiano di un esercizio (solo
-- source='ymove' nell'uso applicativo attuale, ma non vincolato a livello
-- DB: exercise_id referenzia qualunque riga di public.exercises). In
-- lettura, l'app usa PRIMA l'override del coach (o quello del proprio coach,
-- per un cliente), poi ricade sul testo globale di public.exercises se
-- l'override non esiste — vedi mobile/src/lib/fitcoach-exercises-service.ts,
-- getFitCoachExerciseById.
create table if not exists public.exercise_text_overrides (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  name text not null,
  description text,
  technical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, exercise_id)
);

create index if not exists exercise_text_overrides_exercise_id_idx on public.exercise_text_overrides(exercise_id);

drop trigger if exists exercise_text_overrides_set_updated_at on public.exercise_text_overrides;
create trigger exercise_text_overrides_set_updated_at before update on public.exercise_text_overrides
for each row execute function public.set_updated_at();

alter table public.exercise_text_overrides enable row level security;

drop policy if exists exercise_text_overrides_superadmin_all on public.exercise_text_overrides;
create policy exercise_text_overrides_superadmin_all on public.exercise_text_overrides
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Il coach gestisce SOLO la propria personalizzazione, mai quella di un
-- altro coach per lo stesso esercizio (garantito anche dal vincolo univoco
-- coach_id+exercise_id sopra, oltre che da questa policy).
drop policy if exists exercise_text_overrides_coach_own_all on public.exercise_text_overrides;
create policy exercise_text_overrides_coach_own_all on public.exercise_text_overrides
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Il cliente legge SOLO l'override del PROPRIO coach (mai quello di un
-- coach diverso a cui non e' collegato), per qualunque esercizio.
drop policy if exists exercise_text_overrides_client_read_own_coach on public.exercise_text_overrides;
create policy exercise_text_overrides_client_read_own_coach on public.exercise_text_overrides
  for select using (
    exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercise_text_overrides.coach_id
        and coach_clients.status in ('active', 'invited')
    )
  );

-- 2) Associazione video YMove su un esercizio ESISTENTE (locale storico o
-- FitCoach 'custom'), senza creare un nuovo esercizio: riusa la tabella
-- exercise_videos gia' esistente (coach_id + exercise_id, stesso scoping
-- gia' usato per i video caricati manualmente) invece di inventare una
-- struttura parallela — coerente con la regola "non duplicare" della prima
-- integrazione YMove. Una riga exercise_videos ora rappresenta O un file
-- caricato (video_path/video_url valorizzati) O un collegamento YMove
-- (ymove_exercise_id/ymove_slug valorizzati), mai entrambi vuoti: da qui il
-- check "almeno una sorgente" e le due colonne NOT NULL originarie rese
-- nullable.
alter table public.exercise_videos add column if not exists ymove_exercise_id text;
alter table public.exercise_videos add column if not exists ymove_slug text;
alter table public.exercise_videos alter column video_path drop not null;
alter table public.exercise_videos alter column video_url drop not null;

alter table public.exercise_videos drop constraint if exists exercise_videos_has_source;
alter table public.exercise_videos add constraint exercise_videos_has_source
  check (video_path is not null or ymove_exercise_id is not null);

-- Un coach non puo' collegare lo STESSO esercizio YMove a due esercizi
-- diversi nella propria libreria (evita duplicati silenziosi, vedi requisito
-- esplicito): coach diversi possono pero' collegare lo stesso esercizio
-- YMove ciascuno al proprio, senza conflitti (nessun vincolo globale).
create unique index if not exists exercise_videos_coach_ymove_unique
  on public.exercise_videos(coach_id, ymove_exercise_id) where ymove_exercise_id is not null;

notify pgrst, 'reload schema';

-- ============================================================================
-- Migrazione schede e allenamenti a Supabase (2026-07-14). Sposta la fonte di
-- verita' di schede/allenamenti da Zustand/AsyncStorage
-- (mobile/src/store/training-store.ts) a Supabase, in modo progressivo — vedi
-- docs/WORKLOG.md per la strategia lato app (AsyncStorage resta cache
-- offline, mai piu' fonte definitiva). Quattro tabelle NUOVE, nessuna
-- esistente duplicata (verificato: nessuna workout_* era mai stata creata
-- prima d'ora — la sezione "workout_templates/workout_plans/workout_days/
-- workout_day_exercises" in docs/SUPABASE_SCHEMA.md e' una bozza di
-- pianificazione del 2026-07-08 mai implementata, con una forma diversa
-- (es. exercises come FK rigida) superata da questa implementazione reale).
--
-- Nota di modellazione IMPORTANTE: il modello TypeScript odierno
-- (WorkoutPlan, mobile/src/types/training.ts) e' FLAT — un piano e' una
-- singola sessione con un elenco piatto di esercizi, nessun concetto di
-- "giorno". Lo schema qui sotto introduce pero' workout_days come livello
-- intermedio tra workout_plans e workout_day_exercises (pronto per un futuro
-- multi-giorno). Per non riscrivere il modello TS/UI esistente in ~15 file
-- (fuori scope, alto rischio), il servizio mobile
-- (mobile/src/lib/workout-plan-service.ts) crea/gestisce SEMPRE E SOLO UN
-- workout_days implicito per ogni workout_plans (day_order=1), in modo
-- trasparente per l'app: chi legge/scrive vede sempre un WorkoutPlan con un
-- array piatto di esercizi, esattamente come oggi.
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  goal text,
  level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_templates_coach_id_idx on public.workout_templates(coach_id);

drop trigger if exists workout_templates_set_updated_at on public.workout_templates;
create trigger workout_templates_set_updated_at before update on public.workout_templates
for each row execute function public.set_updated_at();

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  name text not null,
  -- Stato di validita' derivato dalla scadenza ('active'/'expiring'/'expired',
  -- vedi computeWorkoutPlanStatus in mobile/src/types/training.ts). Colonna
  -- di comodo, ricalcolata dal servizio ad ogni salvataggio strutturale:
  -- l'app NON si fida MAI solo di questo valore per la UI (lo ricalcola
  -- sempre anche lato client dalla data di scadenza) — utile solo per
  -- eventuali filtri/ricerche lato server in futuro.
  status text not null default 'active' check (status in ('active', 'expiring', 'expired')),
  start_date date not null,
  expiry_date date not null,
  scheduled_time text,
  -- Stato "sessione" (l'ha eseguita o no) — WorkoutSessionStatus lato TS.
  session_status text not null default 'todo' check (session_status in ('todo', 'completed', 'skipped', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  day_label text,
  week_label text,
  -- Abbonamento locale collegato (subscription-store.ts, demo per-cliente,
  -- fuori scope di questa migrazione): resta un id testuale libero, MAI una
  -- foreign key verso una tabella che non esiste ancora su Supabase.
  subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date >= start_date)
);
create index if not exists workout_plans_coach_id_idx on public.workout_plans(coach_id);
create index if not exists workout_plans_client_id_idx on public.workout_plans(client_id);
create index if not exists workout_plans_template_id_idx on public.workout_plans(template_id);

drop trigger if exists workout_plans_set_updated_at on public.workout_plans;
create trigger workout_plans_set_updated_at before update on public.workout_plans
for each row execute function public.set_updated_at();

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  name text,
  day_order integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_plan_id, day_order)
);
create index if not exists workout_days_workout_plan_id_idx on public.workout_days(workout_plan_id);

drop trigger if exists workout_days_set_updated_at on public.workout_days;
create trigger workout_days_set_updated_at before update on public.workout_days
for each row execute function public.set_updated_at();

-- exercise_id e' SEMPRE text, MAI una foreign key: deve contenere sia gli id
-- testuali dei 44 esercizi storici locali (mai su Supabase, vivono in
-- mobile/src/data/exercise-library.ts) sia gli UUID di public.exercises
-- (custom/ymove) — vedi mobile/src/hooks/use-exercise-resolver.ts per come i
-- tre casi vengono risolti in lettura. Un vincolo FK qui romperebbe la
-- compatibilita' con i 44 esercizi locali, che non hanno (e non devono avere)
-- una riga in public.exercises.
create table if not exists public.workout_day_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id text not null,
  exercise_order integer not null default 0,
  sets integer not null default 3,
  reps integer not null default 10,
  reps_min integer,
  reps_max integer,
  target_weight numeric(6,2),
  rest_seconds integer not null default 60,
  notes text,
  technique_type text not null default 'normal' check (technique_type in ('normal', 'superset', 'stripping', 'circuit')),
  superset_group_id text,
  -- Non ancora scritto da mobile/src/lib/workout-plan-service.ts (nessun
  -- campo equivalente su WorkoutExercise oggi): colonna pronta per un futuro
  -- utilizzo (es. esercizio cardio a tempo invece che a serie/ripetizioni),
  -- richiesta esplicitamente nello schema. Sempre NULL finche' l'app non la
  -- popola.
  duration_seconds integer,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_day_exercises_workout_day_id_idx on public.workout_day_exercises(workout_day_id);
create index if not exists workout_day_exercises_exercise_id_idx on public.workout_day_exercises(exercise_id);

drop trigger if exists workout_day_exercises_set_updated_at on public.workout_day_exercises;
create trigger workout_day_exercises_set_updated_at before update on public.workout_day_exercises
for each row execute function public.set_updated_at();

alter table public.workout_templates enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_day_exercises enable row level security;

-- workout_templates: solo il coach proprietario gestisce i propri modelli
-- personalizzati. I 7 modelli predefiniti restano dati statici locali
-- (mobile/src/data/workout-plan-templates.ts, non toccati): questa tabella
-- e' pronta per una futura UI "i miei modelli", non ancora costruita in
-- questo intervento (nessuna schermata la richiede oggi).
drop policy if exists workout_templates_superadmin_all on public.workout_templates;
create policy workout_templates_superadmin_all on public.workout_templates
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists workout_templates_coach_own_all on public.workout_templates;
create policy workout_templates_coach_own_all on public.workout_templates
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- workout_plans: il coach gestisce (CRUD completo) solo le proprie schede, e
-- solo per i propri clienti reali (is_coach_for_client, gia' esistente sopra)
-- — assegnare una scheda a un cliente non collegato viene rifiutato sia qui
-- sia (di nuovo, prima ancora di arrivare qui) dalla RPC save_workout_plan
-- sotto. Il cliente LEGGE SOLO le proprie schede (client_id = auth.uid()):
-- NESSUNA policy di insert/update/delete diretta per il cliente su questa
-- tabella. Gli aggiornamenti di sessione consentiti al cliente (session_
-- status/started_at/completed_at/duration_seconds e il completamento dei
-- singoli esercizi) passano SEMPRE dalla RPC
-- update_workout_session_progress sotto (security definer): e' li', non con
-- un privilegio a livello di colonna, che si applica la regola "il cliente
-- non puo' modificare serie/esercizi/peso target/struttura della scheda".
drop policy if exists workout_plans_superadmin_all on public.workout_plans;
create policy workout_plans_superadmin_all on public.workout_plans
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists workout_plans_coach_scope on public.workout_plans;
create policy workout_plans_coach_scope on public.workout_plans
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_coach_for_client(client_id));
drop policy if exists workout_plans_client_read on public.workout_plans;
create policy workout_plans_client_read on public.workout_plans
  for select using (client_id = auth.uid());

-- workout_days/workout_day_exercises: nessuna colonna coach_id/client_id
-- diretta (evita denormalizzazione): lo scoping passa sempre dalla riga
-- workout_plans genitore tramite EXISTS/JOIN.
drop policy if exists workout_days_superadmin_all on public.workout_days;
create policy workout_days_superadmin_all on public.workout_days
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists workout_days_coach_scope on public.workout_days;
create policy workout_days_coach_scope on public.workout_days
  for all using (
    exists (select 1 from public.workout_plans where workout_plans.id = workout_days.workout_plan_id and workout_plans.coach_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workout_plans where workout_plans.id = workout_days.workout_plan_id and workout_plans.coach_id = auth.uid())
  );
drop policy if exists workout_days_client_read on public.workout_days;
create policy workout_days_client_read on public.workout_days
  for select using (
    exists (select 1 from public.workout_plans where workout_plans.id = workout_days.workout_plan_id and workout_plans.client_id = auth.uid())
  );

drop policy if exists workout_day_exercises_superadmin_all on public.workout_day_exercises;
create policy workout_day_exercises_superadmin_all on public.workout_day_exercises
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists workout_day_exercises_coach_scope on public.workout_day_exercises;
create policy workout_day_exercises_coach_scope on public.workout_day_exercises
  for all using (
    exists (
      select 1 from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      where workout_days.id = workout_day_exercises.workout_day_id and workout_plans.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      where workout_days.id = workout_day_exercises.workout_day_id and workout_plans.coach_id = auth.uid()
    )
  );
drop policy if exists workout_day_exercises_client_read on public.workout_day_exercises;
create policy workout_day_exercises_client_read on public.workout_day_exercises
  for select using (
    exists (
      select 1 from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      where workout_days.id = workout_day_exercises.workout_day_id and workout_plans.client_id = auth.uid()
    )
  );

-- Validazione UUID SICURA (2026-07-14, bug reale corretto): un cast diretto
-- `(testo)::uuid` su un valore non validato SOLLEVA un'eccezione Postgres
-- ("invalid input syntax for type uuid") non gestita dal codice applicativo
-- — il bug reale segnalato dall'utente ("invalid input syntax for type
-- uuid: \"1\"") veniva esattamente da qui: WorkoutPlan/WorkoutExercise
-- possono avere id locali testuali/numerici (es. "1", "we-1") prima del
-- primo salvataggio, e questa funzione provava a convertirli direttamente in
-- uuid. is_valid_uuid richiama SEMPRE PRIMA di ogni cast, in modo che un id
-- locale venga trattato come "riga nuova" invece di far fallire l'intera
-- chiamata. Nessuna eccezione per un input null o vuoto (ritorna false).
create or replace function public.is_valid_uuid(value text)
returns boolean
language sql
immutable
as $$
  select value is not null and value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Salvataggio atomico multi-tabella (workout_plans + workout_days +
-- workout_day_exercises): SECURITY DEFINER, un solo statement PL/pgSQL per
-- chiamata, quindi o va tutto a buon fine o (in caso di eccezione) NIENTE
-- viene scritto — nessuna scheda parzialmente salvata. Autorizzazione
-- verificata esplicitamente (bypassa la RLS, deve rifarla a mano): il
-- chiamante deve essere il coach proprietario (o superadmin) E il cliente
-- indicato deve essere davvero collegato a quel coach.
--
-- payload atteso (jsonb): { id?, coach_id, client_id, template_id?, name,
-- start_date, expiry_date, scheduled_time?, session_status?, day_label?,
-- week_label?, subscription_id?, exercises: [{ id?, exercise_id,
-- exercise_order, sets, reps, reps_min?, reps_max?, target_weight?,
-- rest_seconds, notes?, technique_type?, superset_group_id? }] }.
-- Un id di scheda/esercizio assente, vuoto O NON UN UUID VALIDO (2026-07-14:
-- prima si controllava solo "assente o vuoto", non il formato — vedi
-- is_valid_uuid sopra) = nuova riga; un UUID valido = aggiornamento
-- in-place. Qualunque riga workout_day_exercises esistente NON ricomparsa
-- nel payload viene eliminata (l'editor invia sempre la lista COMPLETA e
-- aggiornata degli esercizi, mai un delta). exercise_id (l'ESERCIZIO, non la
-- riga) resta SEMPRE testo libero, mai validato/castato come uuid: puo'
-- essere un id locale dei 44 storici, un UUID Supabase custom/ymove — vedi
-- commento sulla tabella workout_day_exercises piu' sopra.
create or replace function public.save_workout_plan(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_coach_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_day_id uuid;
  v_status text;
  v_start_date date;
  v_expiry_date date;
  v_exercise jsonb;
  v_seen_ids uuid[] := '{}';
  v_ex_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  -- coach_id/client_id sono sempre popolati dall'app con id di sessione
  -- reali, ma non ci si fida MAI del solo "e' presente": deve anche essere
  -- un uuid valido, altrimenti il cast sotto solleverebbe la stessa
  -- eccezione non gestita del bug originale.
  v_coach_id := case when public.is_valid_uuid(payload->>'coach_id') then (payload->>'coach_id')::uuid else null end;
  v_client_id := case when public.is_valid_uuid(payload->>'client_id') then (payload->>'client_id')::uuid else null end;

  if v_coach_id is null or v_client_id is null then
    raise exception 'INVALID_PAYLOAD: coach_id o client_id mancante o non valido';
  end if;
  if v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il coach proprietario di questa scheda';
  end if;
  if not public.is_superadmin() and not public.is_coach_for_client(v_client_id) then
    raise exception 'NOT_YOUR_CLIENT: il cliente indicato non risulta collegato a questo coach';
  end if;

  v_start_date := (payload->>'start_date')::date;
  v_expiry_date := (payload->>'expiry_date')::date;
  if v_start_date is null or v_expiry_date is null then
    raise exception 'INVALID_PAYLOAD: data allenamento o scadenza mancante';
  end if;

  v_template_id := case when public.is_valid_uuid(payload->>'template_id') then (payload->>'template_id')::uuid else null end;

  -- Stesso calcolo di WORKOUT_PLAN_EXPIRING_WITHIN_DAYS (7 giorni) usato lato
  -- client in computeWorkoutPlanStatus (mobile/src/types/training.ts): mero
  -- valore di comodo, l'app ricalcola sempre autonomamente per la UI.
  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  if public.is_valid_uuid(payload->>'id') then
    v_plan_id := (payload->>'id')::uuid;
    update public.workout_plans set
      client_id = v_client_id,
      template_id = v_template_id,
      name = payload->>'name',
      status = v_status,
      start_date = v_start_date,
      expiry_date = v_expiry_date,
      scheduled_time = nullif(payload->>'scheduled_time', ''),
      session_status = coalesce(nullif(payload->>'session_status', ''), 'todo'),
      day_label = nullif(payload->>'day_label', ''),
      week_label = nullif(payload->>'week_label', ''),
      subscription_id = nullif(payload->>'subscription_id', '')
    where id = v_plan_id and coach_id = v_coach_id
    returning id into v_plan_id;

    if v_plan_id is null then
      raise exception 'NOT_FOUND: scheda non trovata o non di proprieta'' di questo coach';
    end if;
  else
    -- payload->>'id' assente, vuoto o non un uuid valido (es. "1", un
    -- placeholder locale mai salvato prima): SEMPRE trattato come scheda
    -- NUOVA, mai un tentativo di cast che romperebbe la chiamata.
    insert into public.workout_plans (
      coach_id, client_id, template_id, name, status, start_date, expiry_date,
      scheduled_time, session_status, day_label, week_label, subscription_id
    ) values (
      v_coach_id, v_client_id, v_template_id, payload->>'name', v_status,
      v_start_date, v_expiry_date, nullif(payload->>'scheduled_time', ''),
      coalesce(nullif(payload->>'session_status', ''), 'todo'), nullif(payload->>'day_label', ''),
      nullif(payload->>'week_label', ''), nullif(payload->>'subscription_id', '')
    )
    returning id into v_plan_id;
  end if;

  select id into v_day_id from public.workout_days where workout_plan_id = v_plan_id and day_order = 1;
  if v_day_id is null then
    insert into public.workout_days (workout_plan_id, day_order) values (v_plan_id, 1) returning id into v_day_id;
  end if;

  for v_exercise in select * from jsonb_array_elements(coalesce(payload->'exercises', '[]'::jsonb))
  loop
    if public.is_valid_uuid(v_exercise->>'id') then
      v_ex_id := (v_exercise->>'id')::uuid;
      update public.workout_day_exercises set
        exercise_id = v_exercise->>'exercise_id',
        exercise_order = (v_exercise->>'exercise_order')::integer,
        sets = (v_exercise->>'sets')::integer,
        reps = (v_exercise->>'reps')::integer,
        reps_min = nullif(v_exercise->>'reps_min', '')::integer,
        reps_max = nullif(v_exercise->>'reps_max', '')::integer,
        target_weight = nullif(v_exercise->>'target_weight', '')::numeric,
        rest_seconds = (v_exercise->>'rest_seconds')::integer,
        notes = coalesce(v_exercise->>'notes', ''),
        technique_type = coalesce(nullif(v_exercise->>'technique_type', ''), 'normal'),
        superset_group_id = nullif(v_exercise->>'superset_group_id', '')
      where id = v_ex_id and workout_day_id = v_day_id
      returning id into v_ex_id;

      if v_ex_id is null then
        raise exception 'INVALID_PAYLOAD: esercizio scheda non trovato per aggiornamento';
      end if;
    else
      -- v_exercise->>'id' assente, vuoto o non un uuid valido (es. "1", "2",
      -- "3", un id locale mai salvato prima): SEMPRE trattato come riga
      -- NUOVA, mai un tentativo di cast. exercise_id (l'ESERCIZIO) resta
      -- testo libero, mai castato: puo' essere "lat-machine-avanti" (locale)
      -- o un uuid Supabase/YMove, entrambi validi senza distinzione qui.
      insert into public.workout_day_exercises (
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        target_weight, rest_seconds, notes, technique_type, superset_group_id
      ) values (
        v_day_id, v_exercise->>'exercise_id', (v_exercise->>'exercise_order')::integer,
        (v_exercise->>'sets')::integer, (v_exercise->>'reps')::integer,
        nullif(v_exercise->>'reps_min', '')::integer, nullif(v_exercise->>'reps_max', '')::integer,
        nullif(v_exercise->>'target_weight', '')::numeric, (v_exercise->>'rest_seconds')::integer,
        coalesce(v_exercise->>'notes', ''), coalesce(nullif(v_exercise->>'technique_type', ''), 'normal'),
        nullif(v_exercise->>'superset_group_id', '')
      )
      returning id into v_ex_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_ex_id);
  end loop;

  delete from public.workout_day_exercises
  where workout_day_id = v_day_id
    and (array_length(v_seen_ids, 1) is null or id <> all (v_seen_ids));

  -- Realtime (2026-07-14): tocca SEMPRE updated_at su workout_plans, anche
  -- quando l'unica cosa cambiata e' la lista esercizi (workout_day_exercises
  -- e' una tabella diversa, il trigger set_updated_at di workout_plans non
  -- scatterebbe da solo per quelle righe) — senza questo, la subscription
  -- Realtime su workout_plans non riceverebbe alcun evento per un salvataggio
  -- che ha modificato solo gli esercizi.
  update public.workout_plans set updated_at = now() where id = v_plan_id;

  return v_plan_id;
end;
$$;

-- is_valid_uuid resta eseguibile di default (nessun revoke): e' un helper
-- puro senza alcun effetto/dato sensibile, stesso trattamento gia' riservato
-- a is_superadmin()/is_coach_for_client() piu' sopra in questo file.
revoke all on function public.save_workout_plan(jsonb) from public, anon;
grant execute on function public.save_workout_plan(jsonb) to authenticated;

-- Aggiornamento di sessione consentito al CLIENTE (oltre che al coach, per il
-- toggle manuale Da fare/Completato/Saltato/Annullato in schede/[id].tsx):
-- SECURITY DEFINER, tocca SOLO session_status/started_at/completed_at/
-- duration_seconds su workout_plans e SOLO la colonna completed su
-- workout_day_exercises — mai serie/ripetizioni/peso/esercizi/struttura. E'
-- qui, non con un privilegio a livello di colonna, che si applica la regola
-- "il cliente puo' aggiornare solo i dati di sessione consentiti".
-- p_clear_started_at distingue esplicitamente "non toccare started_at" da
-- "riportalo a NULL" (necessario per "Fine allenamento", che deve azzerarlo).
create or replace function public.update_workout_session_progress(
  p_plan_id uuid,
  p_session_status text default null,
  p_started_at timestamptz default null,
  p_clear_started_at boolean default false,
  p_completed_at timestamptz default null,
  p_duration_seconds integer default null,
  p_completed_exercise_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.workout_plans%rowtype;
  v_day_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if p_session_status is not null and p_session_status not in ('todo', 'completed', 'skipped', 'cancelled') then
    raise exception 'INVALID_PAYLOAD: stato sessione non valido';
  end if;

  select * into v_plan from public.workout_plans where id = p_plan_id;
  if not found then
    raise exception 'NOT_FOUND: scheda non trovata';
  end if;
  if v_plan.coach_id <> auth.uid() and v_plan.client_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non autorizzato su questa scheda';
  end if;

  update public.workout_plans set
    session_status = coalesce(p_session_status, session_status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = p_plan_id;

  if p_completed_exercise_ids is not null then
    select id into v_day_id from public.workout_days where workout_plan_id = p_plan_id and day_order = 1;
    if v_day_id is not null then
      update public.workout_day_exercises set completed = (id = any (p_completed_exercise_ids))
      where workout_day_id = v_day_id;
    end if;
  end if;
end;
$$;

revoke all on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

-- Realtime: senza aggiungere la tabella alla pubblicazione supabase_realtime,
-- nessun evento verrebbe mai consegnato ai client sottoscritti,
-- indipendentemente dal codice lato app. Guardia idempotente (Postgres non
-- ha "add table if not exists" per le pubblicazioni): rieseguibile senza
-- errori se gia' presente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_plans'
  ) then
    alter publication supabase_realtime add table public.workout_plans;
  end if;
end $$;

notify pgrst, 'reload schema';
