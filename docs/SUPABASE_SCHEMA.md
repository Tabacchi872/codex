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

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `status text check in ('invited','active','archived','blocked')`, `started_at date`, `ended_at date`, `notes text`, `created_at timestamptz`.

Vincoli: unique `(coach_id, client_id)`.

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
- `payment_events`: insert solo da service role/backend function, lettura solo superadmin e coach proprietario con campi filtrati via view.
- `plans`: lettura per coach autenticati, scrittura solo superadmin.
- `coach_billing`: lettura coach proprietario e superadmin, scrittura solo superadmin/backend function.

## Funzioni backend previste

- `get_coach_entitlements(coach_id uuid)`: ritorna piano, limiti, feature e stato billing.
- `can_add_client(coach_id uuid)`: controlla stato coach, billing e limite clienti.
- `set_coach_plan(coach_id uuid, plan_id uuid, reason text)`: override superadmin.
- `block_coach(coach_id uuid, reason text)` e `unblock_coach(coach_id uuid)`.
- `record_payment_event(payload jsonb)`: normalizza webhook RevenueCat/Stripe.
