# Supabase schema ufficiale

Questo documento descrive la base database per clienti, coach e superadmin. La app mobile resta ancora su login locale demo: non sono stati aggiunti URL Supabase, anon key, pacchetti o client reale.

Il SQL eseguibile e in `docs/SUPABASE_SCHEMA.sql`. Questa sezione e il file SQL sono il riferimento aggiornato; le note storiche sotto restano solo come contesto della fase precedente.

## Ruoli ufficiali

- `superadmin`: gestisce piattaforma, piani, billing e notifiche amministrative.
- `coach`: gestisce solo i propri clienti, appuntamenti, abbonamenti cliente e messaggi.
- `cliente`: vede solo il proprio profilo e i dati assegnati dal proprio coach.

## Tabelle ufficiali

- `profiles`: `id uuid primary key`, `role text check in ('superadmin','coach','cliente')`, `full_name`, `email`, `phone`, `avatar_url`, `is_active`, `created_at`, `updated_at`.
- `coach_profiles`: `id uuid primary key`, `user_id references profiles(id)`, `business_name`, `bio`, `phone`, `billing_status`, `created_at`, `updated_at`.
- `billing_profiles`: `id uuid primary key`, `coach_id references profiles(id)`, dati fiscali/intestazione fattura, PEC, codice SDI, email fatturazione, `created_at`, `updated_at`.
- `client_profiles`: `id uuid primary key`, `user_id references profiles(id)`, `goal`, `height`, `weight`, `notes`, `created_at`, `updated_at`.
- `registration_codes`: `id uuid primary key`, `coach_id references profiles(id)`, `code text unique not null`, `status check in ('active','disabled','expired')`, `max_uses`, `used_count`, `expires_at`, `created_at`, `updated_at`.
- `coach_clients`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `status`, `linked_by_code`, `created_at`, `updated_at`.
- `plans`: `id uuid primary key`, `code`, `name`, `price_monthly`, `price_yearly`, `max_clients`, `features jsonb`, `is_active`, `created_at`, `updated_at`.
- `coach_billing`: `id uuid primary key`, `coach_id references profiles(id)`, `plan_id references plans(id)`, `status check in ('trial','active','past_due','canceled','blocked')`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `provider`, `provider_customer_id`, `provider_subscription_id`, `created_at`, `updated_at`.
- `payment_events`: `id uuid primary key`, `coach_id references profiles(id)`, `provider`, `event_type`, `provider_event_id`, `payload jsonb`, `processed_at`, `created_at`.
- `invoices`: `id uuid primary key`, `coach_id references profiles(id)`, `billing_profile_id references billing_profiles(id)`, `invoice_number`, `status`, importi in centesimi, aliquota indicativa, periodo, riferimenti pagamento, stato SdI, `pdf_url`, `xml_url`, `created_at`, `updated_at`.
- `invoice_items`: `id uuid primary key`, `invoice_id references invoices(id)`, `description`, `quantity`, `unit_amount_cents`, `tax_rate_basis_points`, `total_cents`, `sort_order`, `created_at`, `updated_at`.
- `subscriptions`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `name`, `start_date`, `end_date`, `total_sessions`, `used_sessions`, `status`, `created_at`, `updated_at`.
- `appointments`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `title`, `description`, `start_at`, `end_at`, `status`, `created_at`, `updated_at`.
- `messages`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `sender_id references profiles(id)`, `sender_role`, `body`, `read_at`, `created_at`.
- `admin_notifications`: `id uuid primary key`, `title`, `description`, `type`, `read_at`, `created_at`.
- `push_tokens`: `id uuid primary key`, `user_id references profiles(id)`, `token`, `platform`, `device_id`, `created_at`, `updated_at`.

## RLS ufficiale iniziale

Le policy in `docs/SUPABASE_SCHEMA.sql` sono una base da validare prima della produzione.

- Superadmin: accesso completo alle tabelle operative, piani, billing, eventi pagamento e notifiche admin.
- Coach: accesso ai dati con `coach_id = auth.uid()` e ai clienti collegati tramite `coach_clients`.
- Cliente: accesso solo a `profiles`, `client_profiles`, appuntamenti, subscription e messaggi in cui `client_id = auth.uid()`.
- Registrazione cliente: consentita solo tramite codice coach valido in `registration_codes` con status `active`, non scaduto e con usi disponibili.
- Codici coach: il superadmin li gestisce tutti; il coach legge il proprio codice; la validazione pubblica deve passare da RPC/Edge Function o flusso controllato, non da lettura libera della tabella.
- Coach non vede altri coach: `coach_profiles` e `profiles` non hanno policy di lettura generale tra coach.
- Cliente non vede superadmin: nessuna policy cliente su `admin_notifications`, scrittura piani o billing.
- Superadmin non registrabile pubblicamente: gli account `superadmin` restano creati manualmente/internamente.
- Superadmin gestisce piani e billing; il coach legge solo il proprio billing.
- Fatturazione: superadmin gestisce profili fatturazione e fatture; coach legge il proprio profilo e le proprie fatture.
- Eventi pagamento: in produzione gli insert dovranno passare da backend/Edge Function con service role.

## Note fiscali e fatturazione

- Questa struttura prepara la fatturazione automatica futura ma non genera fatture reali.
- IVA ordinaria Italia: 22% salvo diverso parere del commercialista o regime fiscale specifico.
- Fattura elettronica via SdI per soggetti italiani quando applicabile.
- Pagamenti mobile Apple/Google da gestire e riconciliare separatamente.
- Pagamenti web Stripe da collegare dopo, con webhook e riconciliazione prima dell'emissione.
- Calcoli fiscali, numerazione ufficiale, invio SdI, conservazione sostitutiva e storno devono essere implementati con provider e validazione fiscale prima della produzione.

## Email future (Supabase Auth)

Nessuna email viene inviata ora: login/registrazione restano locali (AsyncStorage), senza SMTP/provider collegato. Quando Supabase Auth sara' attivato, questi flussi email sono gia' previsti e andranno configurati (template + provider SMTP in dashboard Supabase, o provider esterno tipo Resend/Postmark dietro Auth):

- **Conferma registrazione**: email di verifica indirizzo all'iscrizione di coach e cliente (oggi l'account e' attivo subito, senza verifica).
- **Reset password**: link "Password dimenticata" in login (oggi presente ma disabilitato in UI) verra' collegato al flusso `resetPasswordForEmail` di Supabase Auth.
- **Invito cliente**: email al cliente quando il coach lo registra/collega (percorso alternativo alla condivisione manuale del codice coach), utile quando il coach crea l'account per conto del cliente invece che il cliente si registri da solo.
- **Conferma cambio email**: verifica del nuovo indirizzo quando un coach o cliente cambia l'email di accesso.

## Cosa manca per collegare Supabase reale

- Creare progetto Supabase.
- Eseguire `docs/SUPABASE_SCHEMA.sql` nel SQL editor o in una migration.
- Collegare `profiles.id` a `auth.users.id` quando si attiva Supabase Auth.
- Aggiungere `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Installare `@supabase/supabase-js` solo dopo conferma.
- Sostituire il login locale con Supabase Auth mantenendo i redirect: coach `/`, cliente `/cliente-home`, superadmin `/superadmin`.
- Validare RLS con utenti reali per i tre ruoli.

## Fase 1 collegata (2026-07-08): cosa e' cambiato davvero

Questa sezione documenta lo stato reale dopo il collegamento Supabase Fase 1 (`mobile/src/lib/supabase.ts`, `mobile/src/lib/auth-service.ts`). `docs/SUPABASE_SCHEMA.sql` e' stato aggiornato di conseguenza:

- `profiles.id` ora referenzia `auth.users(id) on delete cascade` (prima era una `uuid primary key` isolata).
- Nuovo trigger `public.handle_new_user()` su `auth.users` (after insert, security definer): crea automaticamente la riga `profiles` leggendo `role`/`full_name`/`phone` da `raw_user_meta_data`, passati da `supabase.auth.signUp({ options: { data: {...} } })`. Bypassa la RLS di `profiles` (nessuna policy self-insert necessaria).
- Funzione `public.increment_registration_code_usage(code_id uuid)` (security definer) presente nello schema ma non piu' chiamata da `auth-service.ts`: sostituita con un update diretto su `registration_codes` + nuova policy `registration_codes_increment_usage` (`status = 'active'`), piu' semplice da far funzionare su un progetto reale senza dipendere da una funzione SQL aggiuntiva con i permessi giusti. Stesso compromesso di sicurezza delle altre policy pubbliche di questa fase (vedi sotto).
- Nuove policy: `registration_codes_coach_insert_own` (il coach crea il proprio codice), `registration_codes_public_read_active` (lettura pubblica dei soli codici attivi, necessaria per validare un codice prima che il cliente abbia un account), `coach_profiles_public_read` (lettura pubblica per controllare se il coach puo' accettare clienti), `coach_clients_client_self_insert` (il cliente appena registrato collega se stesso al coach).
- **Semplificazione nota (non ideale, da rafforzare prima della produzione)**: la validazione del codice coach e il collegamento `coach_clients` avvengono lato app (`auth-service.ts`) con policy pubbliche/self-insert, non tramite una funzione `register_client_with_code()` security definer che validi tutto atomicamente lato server (quella funzione resta nell'elenco "Funzioni backend previste" sotto, non ancora implementata). Un utente autenticato potrebbe in teoria forzare un insert in `coach_clients` con un `coach_id` arbitrario bypassando il controllo app-side.
- **Requisito operativo Fase 1**: in Authentication → Providers → Email su Supabase, "Confirm email" va disattivato. Il flusso attuale scrive `coach_profiles`/`billing_profiles`/`registration_codes` (coach) o `client_profiles`/`coach_clients` (cliente) subito dopo `signUp`, nella stessa sessione: se la conferma email resta obbligatoria, `signUp` crea l'utente Auth ma non restituisce una sessione attiva, quindi questi insert falliscono per RLS (errore visibile in UI, gestito senza crash — non dato silenzioso). Vedi `docs/EMAIL_SETUP.md`.
- Il "limite clienti" per la registrazione reale usa oggi `registration_codes.max_uses`/`used_count` (non i piani/`plans`): e' una semplificazione voluta per la Fase 1, diversa dalla logica locale demo (`lib/coach-code.ts`, basata su piano/`clientLimit`). Da unificare quando `coach_billing`/`plans` saranno collegati alla registrazione reale.

---

# Supabase schema fase 1

Questo schema prepara il backend ufficiale senza migrare la demo locale da AsyncStorage. I nomi sono stabili per la fase 2, ma le policy RLS vanno validate su un progetto Supabase reale prima della migrazione.

## Ruoli

- `superadmin`: gestisce coach, piani, blocchi manuali, override e billing.
- `coach`: gestisce i propri clienti, schede, appuntamenti e messaggi.
- `cliente`: accede solo ai dati assegnati dal proprio coach.

## Tabelle core

### profiles

Profilo applicativo collegato a `auth.users`.

Campi principali: `id uuid primary key references auth.users(id)`, `role text check in ('superadmin','coach','cliente')`, `email text`, `full_name text`, `phone text`, `avatar_url text`, `is_active boolean default true`, `blocked_at timestamptz`, `blocked_reason text`, `created_at timestamptz`, `updated_at timestamptz`.

Indici: `role`, `email`.

### coach_clients

Relazione tra coach e clienti.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `status text check in ('invited','active','archived','blocked')`, `linked_by_code text null`, `started_at date`, `ended_at date`, `notes text`, `created_at timestamptz`.

Vincoli: unique `(coach_id, client_id)`.

### billing_profiles

Dati fiscali e intestazione fattura del coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id) unique`, `subject_type text check in ('private','freelancer','sole_proprietorship','company')`, `legal_name text`, `vat_number text`, `fiscal_code text`, `address text`, `postal_code text`, `city text`, `province text`, `country text`, `pec text`, `sdi_code text`, `billing_email text`, `created_at timestamptz`, `updated_at timestamptz`.

Regola minima: `legal_name`, `billing_email` e `country` obbligatori. Per partita IVA italiana serve PEC o codice SDI; `0000000` puo rappresentare codice SDI non comunicato quando ammesso dal processo fiscale.

### registration_codes

Codici ufficiali per collegare un cliente a un coach in fase di registrazione.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `code text unique not null`, `status text check in ('active','disabled','expired')`, `max_uses integer null`, `used_count integer default 0`, `expires_at timestamptz null`, `created_at timestamptz`, `updated_at timestamptz`.

Regole: un cliente puo registrarsi solo con un codice `active`, non scaduto e non oltre `max_uses`; dopo il collegamento `coach_clients.linked_by_code` conserva il codice usato.

### client_profiles

Dati estesi cliente, separati dal profilo auth.

Campi principali: `client_id uuid primary key references profiles(id)`, `coach_id uuid references profiles(id)`, `birth_date date`, `height_cm numeric`, `weight_kg numeric`, `goals text`, `injuries text`, `training_level text`, `nutrition_notes text`, `emergency_contact text`, `created_at timestamptz`, `updated_at timestamptz`.

### plans

Catalogo piani coach.

Campi principali: `id uuid primary key`, `code text unique`, `name text`, `description text`, `client_limit integer`, `features jsonb`, `is_active boolean`, `sort_order integer`, `created_at timestamptz`, `updated_at timestamptz`.

Esempio `features`: `{"workout_templates":true,"appointments":true,"messages_realtime":true,"push_notifications":false,"advanced_analytics":false}`.

### coach_billing

Stato billing corrente del coach.

Campi principali: `coach_id uuid primary key references profiles(id)`, `plan_id uuid references plans(id)`, `status text check in ('trialing','active','past_due','canceled','blocked','manual_override')`, `provider text check in ('revenuecat','apple','google','stripe','manual')`, `provider_customer_id text`, `provider_subscription_id text`, `current_period_start timestamptz`, `current_period_end timestamptz`, `cancel_at_period_end boolean`, `manual_override_until timestamptz`, `updated_by uuid references profiles(id)`, `updated_at timestamptz`.

### invoices

Testate fattura preparate per automazione futura. Non implica emissione reale.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `billing_profile_id uuid references billing_profiles(id)`, `invoice_number text unique`, `status text check in ('draft','ready','issued','void','paid')`, `currency text`, `subtotal_cents integer`, `tax_rate_basis_points integer`, `tax_cents integer`, `total_cents integer`, `issued_at timestamptz`, `due_at timestamptz`, `period_start date`, `period_end date`, `payment_provider text`, `payment_reference text`, `sdi_status text`, `pdf_url text`, `xml_url text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

### invoice_items

Righe fattura collegate a `invoices`.

Campi principali: `id uuid primary key`, `invoice_id uuid references invoices(id)`, `description text`, `quantity numeric`, `unit_amount_cents integer`, `tax_rate_basis_points integer`, `total_cents integer`, `sort_order integer`, `created_at timestamptz`, `updated_at timestamptz`.

### payment_events

Storico append-only degli eventi pagamento.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `provider text`, `event_type text`, `provider_event_id text`, `provider_subscription_id text`, `amount_cents integer`, `currency text`, `payload jsonb`, `created_at timestamptz`.

Vincoli: unique `(provider, provider_event_id)` quando disponibile.

### subscriptions

Abbonamenti cliente gestiti dal coach dentro l'app, distinti dal billing coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `name text`, `status text check in ('active','expiring','expired','paused','canceled')`, `starts_on date`, `ends_on date`, `price_cents integer`, `currency text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

## Allenamenti

### workout_templates

Modelli riutilizzabili dal coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `title text`, `description text`, `level text`, `tags text[]`, `is_archived boolean`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_plans

Schede assegnate ai clienti.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `template_id uuid references workout_templates(id)`, `title text`, `description text`, `starts_on date`, `ends_on date`, `status text check in ('draft','active','completed','archived')`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_days

Giorni di una scheda o template.

Campi principali: `id uuid primary key`, `workout_plan_id uuid references workout_plans(id)`, `template_id uuid references workout_templates(id)`, `title text`, `day_index integer`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

Vincolo: un giorno appartiene a un piano assegnato oppure a un template.

### exercises

Libreria esercizi ufficiale e custom coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id) null`, `name text`, `muscle_group text`, `equipment text`, `instructions text`, `video_url text`, `thumbnail_url text`, `is_public boolean`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_day_exercises

Esercizi dentro un giorno allenamento.

Campi principali: `id uuid primary key`, `workout_day_id uuid references workout_days(id)`, `exercise_id uuid references exercises(id)`, `sort_order integer`, `sets integer`, `reps text`, `rest_seconds integer`, `tempo text`, `load_notes text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

## Operativita

### appointments

Appuntamenti coach-cliente.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `starts_at timestamptz`, `ends_at timestamptz`, `title text`, `location text`, `status text check in ('scheduled','completed','canceled','no_show')`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

### conversations

Conversazioni tra coach e cliente.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `last_message_at timestamptz`, `created_at timestamptz`.

Vincoli: unique `(coach_id, client_id)`.

### messages

Messaggi realtime.

Campi principali: `id uuid primary key`, `conversation_id uuid references conversations(id)`, `sender_id uuid references profiles(id)`, `body text`, `attachment_url text`, `read_at timestamptz`, `created_at timestamptz`.

Indici: `(conversation_id, created_at)`.

### push_tokens

Token push Expo/APNs/FCM per notifiche future.

Campi principali: `id uuid primary key`, `profile_id uuid references profiles(id)`, `token text unique`, `platform text check in ('ios','android','web')`, `device_id text`, `is_active boolean`, `last_seen_at timestamptz`, `created_at timestamptz`.

## Policy RLS iniziali

- `superadmin`: accesso completo a tutte le tabelle operative e billing.
- `coach`: legge/scrive solo righe con `coach_id = auth.uid()` o relazioni in `coach_clients`.
- `cliente`: legge solo il proprio `profiles`, `client_profiles`, schede assegnate, appuntamenti, conversazioni e messaggi.
- `registration_codes`: gestione completa solo superadmin; coach legge i propri codici; validazione registrazione cliente da implementare tramite funzione controllata.
- `billing_profiles`: superadmin gestisce tutti i profili; coach legge e aggiorna il proprio.
- `invoices` e `invoice_items`: superadmin gestisce tutto; coach legge le proprie fatture.
- `payment_events`: insert solo da service role/backend function, lettura solo superadmin e coach proprietario con campi filtrati via view.
- `plans`: lettura per coach autenticati, scrittura solo superadmin.
- `coach_billing`: lettura coach proprietario e superadmin, scrittura solo superadmin/backend function.

## Funzioni backend previste

- `get_coach_entitlements(coach_id uuid)`: ritorna piano, limiti, feature e stato billing.
- `can_add_client(coach_id uuid)`: controlla stato coach, billing e limite clienti.
- `validate_registration_code(code text)`: controlla codice attivo, scadenza, usi e possibilita del coach di accettare clienti.
- `register_client_with_code(code text, profile jsonb)`: crea profilo cliente e relazione `coach_clients` in modo atomico.
- `set_coach_plan(coach_id uuid, plan_id uuid, reason text)`: override superadmin.
- `block_coach(coach_id uuid, reason text)` e `unblock_coach(coach_id uuid)`.
- `record_payment_event(payload jsonb)`: normalizza webhook RevenueCat/Stripe.
