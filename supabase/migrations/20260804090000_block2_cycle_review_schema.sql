-- feat: sotto-blocco 2.1 — schema per cicli, check-in e revisioni automatiche.
--
-- SOLO SCHEMA: nessun motore di revisione, nessuna RPC cliente/Superadmin,
-- nessuna variazione automatica esercizi, nessuna UI, nessuna notifica
-- visibile, nessun seed completo dei metadati esercizio (2.2). Segue
-- esclusivamente docs/BLOCK_2_DESIGN.md + le 4 decisioni approvate il
-- 2026-07-27 (soglie versionate, migration transazionale con mappatura,
-- stato dedicato pending_template, priorità al sotto-blocco 2.0 — già
-- chiuso nel commit 63db088, non toccato qui).
--
-- VERIFICHE READ-ONLY ESEGUITE PRIMA DI QUESTA MIGRATION (nessuna scrittura):
--   client_program_cycles: 1 riga (cliente reale, status='active', source=
--   'auto_initial') — l'unica riga esistente resta valida in ogni riformulazione
--   sotto (nessun UPDATE necessario, scritti comunque a scopo difensivo/
--   idempotente, in linea con "aggiorna prima eventuali valori esistenti").
--   client_cycle_reviews: 0 righe. client_monthly_checkins: 0 righe.
--   superadmin_program_overrides: 0 righe. client_program_cycle_plans: 2 righe
--   (join, non toccate da questa migration). client_excluded_exercises: 16
--   righe (dati reali del cliente, non toccate). Nomi reali dei CHECK
--   constraint verificati via pg_constraint (non assunti):
--   client_program_cycles_status_check, client_cycle_reviews_decision_check,
--   client_program_cycles_source_check, superadmin_program_overrides_action_check,
--   client_cycle_reviews_cycle_id_key (UNIQUE su cycle_id — vedi punto 5 sotto
--   per una scoperta rilevante su questo vincolo).

-- ============================================================================
-- 3) client_program_cycles — 11 stati, nuove colonne, indice one-current esteso
-- ============================================================================

-- 3.1 Mappatura vecchio -> nuovo stato (difensiva: verificato 0 righe con
-- questi valori oggi, l'unica riga reale ha status='active' che resta
-- invariato in ogni caso). 'pending_review' del Blocco 1 copriva DUE cause
-- distinte (dolore/supervisione E nessun template compatibile) con lo stesso
-- valore: senza righe reali da ispezionare, il ramo difensivo sceglie
-- 'pending_template' come default neutro (mai etichettare come problema di
-- sicurezza un caso che potrebbe non esserlo), a meno che decision_reason
-- contenga un segnale esplicito di dolore/supervisione.
update public.client_program_cycles set status = 'replaced' where status = 'superseded';
update public.client_program_cycles set status = 'paused_subscription' where status = 'suspended';
update public.client_program_cycles set status = 'pending_safety_review'
  where status = 'pending_review' and (decision_reason ilike '%dolore%' or decision_reason ilike '%supervisione%' or decision_reason ilike '%professionista%');
update public.client_program_cycles set status = 'pending_template'
  where status = 'pending_review';

alter table public.client_program_cycles drop constraint client_program_cycles_status_check;
alter table public.client_program_cycles add constraint client_program_cycles_status_check
  check (status in (
    'draft', 'active', 'checkin_due', 'review_pending',
    'pending_subscription', 'paused_subscription', 'pending_safety_review', 'pending_template',
    'completed', 'replaced', 'cancelled'
  ));

-- source: aggiunge 'auto_partial_change' (mancava un source per la decisione
-- 'partial_change', l'unica tra le 4 decisioni che generano un nuovo ciclo a
-- non avere ancora un source dedicato: auto_progression/auto_regression/
-- auto_maintain esistevano già). Additivo, nessun rename.
alter table public.client_program_cycles drop constraint client_program_cycles_source_check;
alter table public.client_program_cycles add constraint client_program_cycles_source_check
  check (source in (
    'auto_initial', 'auto_renewal', 'auto_progression', 'auto_regression',
    'auto_maintain', 'auto_partial_change', 'auto_block_pain', 'superadmin_override'
  ));

-- Rename di colonna per coerenza col nuovo stato 'replaced' (era 'superseded_at').
-- Nessuna riga reale la valorizza oggi (l'unica riga ha status='active').
alter table public.client_program_cycles rename column superseded_at to replaced_at;

alter table public.client_program_cycles
  add column if not exists checkin_available_at date,
  add column if not exists effective_active_days integer not null default 0,
  add column if not exists resumed_at timestamptz,
  add column if not exists config_version integer,
  add column if not exists algorithm_version integer;

alter table public.client_program_cycles drop constraint if exists client_program_cycles_effective_active_days_check;
alter table public.client_program_cycles add constraint client_program_cycles_effective_active_days_check
  check (effective_active_days >= 0);

alter table public.client_program_cycles drop constraint if exists client_program_cycles_review_due_after_start_check;
alter table public.client_program_cycles add constraint client_program_cycles_review_due_after_start_check
  check (review_due_at is null or review_due_at >= started_at);

alter table public.client_program_cycles drop constraint if exists client_program_cycles_checkin_before_review_check;
alter table public.client_program_cycles add constraint client_program_cycles_checkin_before_review_check
  check (checkin_available_at is null or review_due_at is null or checkin_available_at <= review_due_at);

alter table public.client_program_cycles drop constraint if exists client_program_cycles_resumed_after_suspended_check;
alter table public.client_program_cycles add constraint client_program_cycles_resumed_after_suspended_check
  check (resumed_at is null or suspended_at is null or resumed_at >= suspended_at);

comment on column public.client_program_cycles.checkin_available_at is 'Data (nominale) in cui il check-in periodico diventa disponibile per il cliente — non necessariamente coincidente con review_due_at.';
comment on column public.client_program_cycles.effective_active_days is 'Giorni di abbonamento Client Pro effettivamente attivo accumulati per questo ciclo (esclude i periodi paused_subscription) — aggiornato dal futuro motore di revisione (sotto-blocco 2.3), non da questa migration.';
comment on column public.client_program_cycles.resumed_at is 'Timestamp dell''ultima riattivazione dopo paused_subscription/pending_subscription.';
comment on column public.client_program_cycles.config_version is 'Riferimento logico a auto_program_review_config.config_version usato per l''ultima revisione di questo ciclo (nessun FK: config_version non è chiave primaria a sé, è parte di una unique composta con key).';
comment on column public.client_program_cycles.algorithm_version is 'Versione del motore di revisione (Blocco 2, non ancora implementato) che ha prodotto questo ciclo — nullo per il primo ciclo (auto_initial, motore di matching del Blocco 1, non versionato).';

-- Indice one-current-per-client ESTESO a tutti gli stati non terminali
-- (prima copriva solo 'draft','active','pending_review' — con l'estensione a
-- 11 stati, senza questo aggiornamento un cliente potrebbe avere due cicli
-- non terminali simultanei, es. uno 'checkin_due' e uno 'draft', rompendo
-- l'invariante "un solo ciclo in corso per cliente" già garantito dal
-- Blocco 1).
drop index if exists public.client_program_cycles_one_current_per_client_idx;
create unique index client_program_cycles_one_current_per_client_idx
  on public.client_program_cycles(client_id)
  where status in (
    'draft', 'active', 'checkin_due', 'review_pending',
    'pending_subscription', 'paused_subscription', 'pending_safety_review', 'pending_template'
  );

-- ============================================================================
-- 4) client_monthly_checkins — campi periodici, enum/CHECK, lock post-review
-- ============================================================================
alter table public.client_monthly_checkins
  add column if not exists perceived_fatigue text,
  add column if not exists recovery_quality text,
  add column if not exists satisfaction text,
  add column if not exists available_days_per_week integer,
  add column if not exists location text,
  add column if not exists equipment_level text,
  add column if not exists equipment_no_longer_available text[] not null default '{}'::text[],
  add column if not exists equipment_newly_available text[] not null default '{}'::text[],
  add column if not exists main_skip_reason text,
  add column if not exists status text not null default 'draft',
  add column if not exists locked_at timestamptz;

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_perceived_fatigue_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_perceived_fatigue_check
  check (perceived_fatigue is null or perceived_fatigue in ('low', 'moderate', 'high'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_recovery_quality_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_recovery_quality_check
  check (recovery_quality is null or recovery_quality in ('poor', 'fair', 'good'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_satisfaction_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_satisfaction_check
  check (satisfaction is null or satisfaction in ('low', 'medium', 'high'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_available_days_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_available_days_check
  check (available_days_per_week is null or available_days_per_week between 1 and 7);

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_location_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_location_check
  check (location is null or location in ('gym', 'home'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_equipment_level_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_equipment_level_check
  check (equipment_level is null or equipment_level in ('bodyweight_only', 'home_basic', 'full_gym'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_main_skip_reason_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_main_skip_reason_check
  check (main_skip_reason is null or main_skip_reason in ('no_time', 'no_motivation', 'pain_discomfort', 'travel', 'equipment_unavailable', 'too_hard', 'none'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_status_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_status_check
  check (status in ('draft', 'submitted', 'locked'));

alter table public.client_monthly_checkins drop constraint if exists client_monthly_checkins_available_minutes_check;
alter table public.client_monthly_checkins add constraint client_monthly_checkins_available_minutes_check
  check (available_minutes is null or available_minutes between 15 and 180);

comment on column public.client_monthly_checkins.status is 'draft = in compilazione; submitted = inviato, in attesa di revisione; locked = revisione conclusa, immutabile (vedi trigger sotto). Data di invio: completed_at (esistente); data di blocco: locked_at.';

-- Immutabilità minima dopo il blocco: una volta locked_at valorizzato,
-- nessuna modifica ulteriore (eccetto Superadmin, per un eventuale override
-- amministrativo — sezione 10). Vincolo semplice, nessuna logica di business.
create or replace function public.prevent_client_monthly_checkin_edit_after_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.locked_at is not null and not public.is_superadmin() then
    raise exception 'CHECKIN_LOCKED: il check-in è già stato elaborato dalla revisione e non può essere modificato';
  end if;
  return new;
end;
$$;

drop trigger if exists client_monthly_checkins_prevent_edit_after_lock on public.client_monthly_checkins;
create trigger client_monthly_checkins_prevent_edit_after_lock before update on public.client_monthly_checkins
for each row execute function public.prevent_client_monthly_checkin_edit_after_lock();

-- ============================================================================
-- 5) client_cycle_reviews — decisione a 9 valori, eleggibilità, aderenza,
-- versioni, template, timestamp, origine
-- ============================================================================
-- SCOPERTA RILEVANTE durante l'analisi (non solo compatibilità dati, un
-- conflitto logico tra vincolo esistente e requisito nuovo): il Blocco 1 ha
-- gia' un UNIQUE(cycle_id) su questa tabella (client_cycle_reviews_cycle_id_
-- key), che permetterebbe UNA SOLA riga in assoluto per ciclo. Ma la
-- richiesta esplicita di questo sotto-blocco e' "impedire piu' review
-- DEFINITIVE per lo stesso ciclo" — cioe' un tentativo con esito
-- insufficient_data (dati ancora insufficienti, nessuna transizione di
-- stato, sicuro da ritentare) NON deve contare come "review definitiva" e
-- deve poter essere ri-registrato piu' volte per lo stesso ciclo (ogni
-- tentativo e' un audit trail legittimo). Il vincolo originale va quindi
-- sostituito con un indice univoco parziale che esclude 'insufficient_data'.
-- Verificato: 0 righe esistenti, nessun dato da migrare.
alter table public.client_cycle_reviews drop constraint client_cycle_reviews_cycle_id_key;
create unique index client_cycle_reviews_one_definitive_per_cycle_idx
  on public.client_cycle_reviews(cycle_id)
  where decision <> 'insufficient_data';

-- decisione: 'reduce'->'regress', 'superadmin_required'->'manual_review',
-- aggiunte 'partial_change'/'blocked_safety'/'blocked_subscription'/
-- 'pending_template'. Verificato 0 righe esistenti: nessun UPDATE
-- necessario, ma scritto comunque a scopo difensivo/idempotente.
update public.client_cycle_reviews set decision = 'regress' where decision = 'reduce';
update public.client_cycle_reviews set decision = 'manual_review' where decision = 'superadmin_required';
update public.client_cycle_reviews set decision = 'blocked_safety' where decision = 'block_pain';

alter table public.client_cycle_reviews drop constraint client_cycle_reviews_decision_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_decision_check
  check (decision in (
    'progress', 'maintain', 'regress', 'partial_change', 'manual_review',
    'blocked_safety', 'blocked_subscription', 'insufficient_data', 'pending_template'
  ));

alter table public.client_cycle_reviews
  add column if not exists eligibility_result text,
  add column if not exists completion_ratio numeric,
  add column if not exists sessions_planned integer,
  add column if not exists sessions_completed integer,
  add column if not exists exercises_evaluable_ratio numeric,
  add column if not exists config_version integer,
  add column if not exists algorithm_version integer not null default 1,
  add column if not exists exercises_kept_count integer not null default 0,
  add column if not exists exercises_replaced_count integer not null default 0,
  add column if not exists previous_template_id uuid references public.workout_templates(id) on delete set null,
  add column if not exists next_template_id uuid references public.workout_templates(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists error_message text,
  add column if not exists origin text not null default 'automatic',
  add column if not exists superadmin_override_id uuid references public.superadmin_program_overrides(id) on delete set null;

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_eligibility_result_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_eligibility_result_check
  check (eligibility_result is null or eligibility_result in (
    'eligible', 'insufficient_sessions', 'insufficient_progress_data', 'checkin_required',
    'subscription_required', 'coach_assigned', 'safety_review_required', 'already_reviewed', 'cycle_not_due'
  ));

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_completion_ratio_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_completion_ratio_check
  check (completion_ratio is null or completion_ratio between 0 and 1);

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_exercises_evaluable_ratio_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_exercises_evaluable_ratio_check
  check (exercises_evaluable_ratio is null or exercises_evaluable_ratio between 0 and 1);

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_sessions_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_sessions_check
  check (
    (sessions_planned is null or sessions_planned >= 0)
    and (sessions_completed is null or sessions_completed >= 0)
    and (sessions_planned is null or sessions_completed is null or sessions_completed <= sessions_planned)
  );

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_exercise_counts_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_exercise_counts_check
  check (exercises_kept_count >= 0 and exercises_replaced_count >= 0);

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_origin_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_origin_check
  check (origin in ('automatic', 'superadmin'));

alter table public.client_cycle_reviews drop constraint if exists client_cycle_reviews_started_before_reviewed_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_started_before_reviewed_check
  check (started_at is null or started_at <= reviewed_at);

comment on column public.client_cycle_reviews.eligibility_result is 'Esito della funzione di sola lettura check_cycle_review_eligibility (sotto-blocco 2.3, non ancora implementata) — vedi docs/BLOCK_2_DESIGN.md sezione 3.3.';
comment on column public.client_cycle_reviews.config_version is 'Riferimento logico a auto_program_review_config.config_version realmente usato per questa revisione (nessun FK, stesso motivo di client_program_cycles.config_version).';
comment on column public.client_cycle_reviews.decision is 'pending_template è sia una decisione (qui) sia lo stato-ciclo risultante (client_program_cycles.status) — stesso evento da due prospettive diverse (l''esito della review e lo stato in cui il ciclo resta), non un significato duplicato: stessa relazione già esistente tra blocked_safety/blocked_subscription e pending_safety_review/pending_subscription.';

-- ============================================================================
-- 6) auto_program_review_config — soglie versionate (decisione approvata 2026-07-27)
-- ============================================================================
create table if not exists public.auto_program_review_config (
  id uuid primary key default gen_random_uuid(),
  config_version integer not null,
  key text not null,
  value numeric not null,
  description text not null,
  is_active boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_version, key),
  check (valid_until is null or valid_until > valid_from)
);

-- Una sola configurazione attiva per chiave (equivalente a "una sola
-- configurazione attiva" in assoluto, dato che ogni versione attiva porta
-- sempre l'intero set di chiavi con is_active=true insieme).
create unique index if not exists auto_program_review_config_active_key_uidx
  on public.auto_program_review_config(key) where is_active;

drop trigger if exists auto_program_review_config_set_updated_at on public.auto_program_review_config;
create trigger auto_program_review_config_set_updated_at before update on public.auto_program_review_config
for each row execute function public.set_updated_at();

-- Vincolo di integrità semplice (non logica di business): impedisce valori
-- negativi ovunque, e valori fuori [0,1] per le chiavi che il design
-- documenta esplicitamente come rapporti/percentuali.
create or replace function public.validate_auto_program_review_config_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.value < 0 then
    raise exception 'CONFIG_VALUE_NEGATIVE: % non può essere negativo', new.key;
  end if;
  if new.key in (
    'min_completion_ratio', 'min_exercise_data_ratio', 'max_load_increase_ratio',
    'min_exercise_keep_ratio', 'max_exercise_change_ratio',
    'progress_min_completion_ratio', 'regress_max_completion_ratio', 'trend_consistency_stable'
  ) and (new.value < 0 or new.value > 1) then
    raise exception 'CONFIG_VALUE_OUT_OF_RANGE: % deve essere tra 0 e 1', new.key;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_program_review_config_validate_value on public.auto_program_review_config;
create trigger auto_program_review_config_validate_value before insert or update on public.auto_program_review_config
for each row execute function public.validate_auto_program_review_config_value();

alter table public.auto_program_review_config enable row level security;

drop policy if exists auto_program_review_config_superadmin_all on public.auto_program_review_config;
create policy auto_program_review_config_superadmin_all on public.auto_program_review_config
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Seed idempotente (config_version = 1, is_active = true) — soglie approvate
-- il 2026-07-27, mai hardcoded in RPC/servizi/UI.
insert into public.auto_program_review_config (config_version, key, value, description, is_active)
values
  (1, 'nominal_cycle_days', 28, 'Durata nominale del ciclo in giorni di abbonamento attivo', true),
  (1, 'min_completion_ratio', 0.60, 'Soglia minima aderenza per eleggibilità', true),
  (1, 'min_sessions', 4, 'Numero minimo sessioni completate per eleggibilità', true),
  (1, 'min_exercise_data_ratio', 0.50, 'Percentuale minima esercizi principali con dati di carico/RPE', true),
  (1, 'max_load_increase_ratio', 0.10, 'Incremento massimo carico per ciclo', true),
  (1, 'max_added_sets_per_exercise', 1, 'Serie aggiuntive massime per esercizio per ciclo', true),
  (1, 'min_exercise_keep_ratio', 0.60, 'Percentuale minima esercizi mantenuti tra due cicli', true),
  (1, 'max_exercise_change_ratio', 0.40, 'Percentuale massima esercizi sostituiti tra due cicli', true),
  (1, 'progress_min_completion_ratio', 0.85, 'Soglia aderenza per decisione progress', true),
  (1, 'regress_max_completion_ratio', 0.75, 'Soglia aderenza sotto cui si valuta regress', true),
  (1, 'trend_rpe_high', 8.5, 'RPE oltre cui un esercizio è considerato negative', true),
  (1, 'trend_consistency_stable', 0.70, 'Regolarità minima per considerare un esercizio stable', true),
  (1, 'short_pause_days', 7, 'Soglia pausa abbonamento breve (giorni)', true),
  (1, 'medium_pause_days', 21, 'Soglia pausa abbonamento media (giorni, oltre = lunga)', true)
on conflict (config_version, key) do nothing;

-- ============================================================================
-- 7) exercise_movement_metadata — metadati esercizio (schema soltanto, seed
-- completo nel sotto-blocco 2.2)
-- ============================================================================
-- exercise_id: stesso testo libero di workout_day_exercises.exercise_id (id
-- locale es. 'gambe-squat', o uuid-as-text di public.exercises per ymove/
-- custom) — nessun FK possibile, stesso motivo per cui workout_day_
-- exercises.exercise_id stesso non ha mai avuto un FK (catalogo eterogeneo,
-- verificato leggendo lo schema esistente).
create table if not exists public.exercise_movement_metadata (
  exercise_id text primary key,
  movement_pattern text not null check (movement_pattern in (
    'squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull',
    'vertical_push', 'vertical_pull', 'core_anti_extension', 'core_anti_rotation',
    'carry', 'isolation_arms', 'isolation_legs', 'cardio', 'mobility'
  )),
  primary_muscle_group text not null check (primary_muscle_group in (
    'petto', 'dorsali', 'trapezi', 'spalle', 'bicipiti', 'tricipiti', 'avambracci',
    'quadricipiti', 'femorali', 'glutei', 'adduttori', 'abduttori', 'polpacci',
    'addome', 'obliqui', 'lombari', 'full_body', 'cardio', 'mobilita', 'stretching'
  )),
  secondary_muscle_groups text[] not null default '{}'::text[],
  equipment_tag text not null check (equipment_tag in ('bodyweight_only', 'home_basic', 'full_gym')),
  compatible_locations text[] not null default '{}'::text[],
  min_level text not null check (min_level in ('beginner', 'intermediate', 'advanced')),
  role text not null default 'accessory' check (role in ('primary', 'secondary', 'accessory')),
  is_unilateral boolean not null default false,
  movement_class text not null default 'isolation' check (movement_class in ('compound', 'isolation')),
  eligible_for_substitution boolean not null default true,
  substitution_group text,
  contraindications text[] not null default '{}'::text[],
  is_pain_sensitive_default boolean not null default false,
  is_active boolean not null default true,
  metadata_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_movement_metadata_locations_check check (compatible_locations <@ array['gym', 'home']::text[])
);

create index if not exists exercise_movement_metadata_substitution_group_idx
  on public.exercise_movement_metadata(substitution_group) where substitution_group is not null;
-- Scopo: il futuro motore di sostituzione (2.3) cercherà sempre "candidati con
-- lo stesso substitution_group", tipicamente per un gruppo alla volta.

drop trigger if exists exercise_movement_metadata_set_updated_at on public.exercise_movement_metadata;
create trigger exercise_movement_metadata_set_updated_at before update on public.exercise_movement_metadata
for each row execute function public.set_updated_at();

alter table public.exercise_movement_metadata enable row level security;

drop policy if exists exercise_movement_metadata_superadmin_all on public.exercise_movement_metadata;
create policy exercise_movement_metadata_superadmin_all on public.exercise_movement_metadata
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Nessun seed completo qui (appartiene al 2.2). Un solo record minimo per
-- verificare che lo schema/CHECK/trigger funzionino davvero, non un catalogo.
insert into public.exercise_movement_metadata (
  exercise_id, movement_pattern, primary_muscle_group, equipment_tag, compatible_locations, min_level, role, movement_class
) values (
  'gambe-squat', 'squat', 'quadricipiti', 'full_gym', array['gym', 'home'], 'beginner', 'primary', 'compound'
) on conflict (exercise_id) do nothing;

-- ============================================================================
-- 8) exercise_alternatives — relazione di sostituzione tra esercizi
-- ============================================================================
create table if not exists public.exercise_alternatives (
  id uuid primary key default gen_random_uuid(),
  source_exercise_id text not null,
  alternative_exercise_id text not null,
  movement_pattern_match boolean not null default true,
  equipment_tag text check (equipment_tag is null or equipment_tag in ('bodyweight_only', 'home_basic', 'full_gym')),
  relative_difficulty text not null default 'equivalent' check (relative_difficulty in ('easier', 'equivalent', 'harder')),
  priority integer not null default 0,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_alternatives_not_self check (source_exercise_id <> alternative_exercise_id),
  constraint exercise_alternatives_unique_pair unique (source_exercise_id, alternative_exercise_id)
);

create index if not exists exercise_alternatives_source_idx on public.exercise_alternatives(source_exercise_id) where is_active;
-- Scopo: il motore di sostituzione cerca sempre "alternative attive per
-- questo esercizio sorgente" — stesso pattern di accesso di substitution_group.

drop trigger if exists exercise_alternatives_set_updated_at on public.exercise_alternatives;
create trigger exercise_alternatives_set_updated_at before update on public.exercise_alternatives
for each row execute function public.set_updated_at();

-- Impedisce riferimenti a esercizi inesistenti: "esistente" qui significa
-- "registrato in exercise_movement_metadata", il registro di questo
-- sottosistema (nessun FK diretto possibile, catalogo eterogeneo — vedi nota
-- punto 7). Vincolo di integrità semplice, non logica di business.
create or replace function public.validate_exercise_alternative_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.exercise_movement_metadata where exercise_id = new.source_exercise_id) then
    raise exception 'UNKNOWN_EXERCISE: % non è registrato in exercise_movement_metadata', new.source_exercise_id;
  end if;
  if not exists (select 1 from public.exercise_movement_metadata where exercise_id = new.alternative_exercise_id) then
    raise exception 'UNKNOWN_EXERCISE: % non è registrato in exercise_movement_metadata', new.alternative_exercise_id;
  end if;
  return new;
end;
$$;

drop trigger if exists exercise_alternatives_validate_references on public.exercise_alternatives;
create trigger exercise_alternatives_validate_references before insert or update on public.exercise_alternatives
for each row execute function public.validate_exercise_alternative_references();

alter table public.exercise_alternatives enable row level security;

drop policy if exists exercise_alternatives_superadmin_all on public.exercise_alternatives;
create policy exercise_alternatives_superadmin_all on public.exercise_alternatives
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ============================================================================
-- 9) client_cycle_exercise_transitions — audit esercizi vecchio/nuovo ciclo
-- ============================================================================
create table if not exists public.client_cycle_exercise_transitions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  review_id uuid not null references public.client_cycle_reviews(id) on delete cascade,
  previous_cycle_id uuid references public.client_program_cycles(id) on delete set null,
  next_cycle_id uuid references public.client_program_cycles(id) on delete set null,
  previous_exercise_id text,
  new_exercise_id text,
  action text not null check (action in ('kept', 'replaced', 'added', 'removed', 'progressed', 'regressed')),
  reason text,
  previous_parameters jsonb not null default '{}'::jsonb,
  new_parameters jsonb not null default '{}'::jsonb,
  origin text not null default 'automatic' check (origin in ('automatic', 'superadmin_override')),
  override_author uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_cycle_exercise_transitions_unique unique (review_id, previous_exercise_id, new_exercise_id, action)
);

create index if not exists client_cycle_exercise_transitions_client_idx on public.client_cycle_exercise_transitions(client_id);
create index if not exists client_cycle_exercise_transitions_review_idx on public.client_cycle_exercise_transitions(review_id);
-- Scopo: lettura per cliente (owner_read sotto) e per review (superadmin_
-- get_client_program_history, sotto-blocco 2.5, non ancora implementata).

-- Impedisce riferimenti tra clienti diversi: review_id deve appartenere a un
-- ciclo dello STESSO client_id dichiarato sulla riga, e previous_cycle_id/
-- next_cycle_id (se presenti) devono appartenere anch'essi allo stesso
-- cliente. Vincolo di integrità semplice.
create or replace function public.validate_cycle_exercise_transition_client()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_review_client_id uuid;
  v_previous_cycle_client_id uuid;
  v_next_cycle_client_id uuid;
begin
  select cpc.client_id into v_review_client_id
  from public.client_cycle_reviews ccr
  join public.client_program_cycles cpc on cpc.id = ccr.cycle_id
  where ccr.id = new.review_id;

  if v_review_client_id is null or v_review_client_id <> new.client_id then
    raise exception 'CROSS_CLIENT_REFERENCE: review_id non appartiene al client_id dichiarato';
  end if;

  if new.previous_cycle_id is not null then
    select client_id into v_previous_cycle_client_id from public.client_program_cycles where id = new.previous_cycle_id;
    if v_previous_cycle_client_id is null or v_previous_cycle_client_id <> new.client_id then
      raise exception 'CROSS_CLIENT_REFERENCE: previous_cycle_id non appartiene al client_id dichiarato';
    end if;
  end if;

  if new.next_cycle_id is not null then
    select client_id into v_next_cycle_client_id from public.client_program_cycles where id = new.next_cycle_id;
    if v_next_cycle_client_id is null or v_next_cycle_client_id <> new.client_id then
      raise exception 'CROSS_CLIENT_REFERENCE: next_cycle_id non appartiene al client_id dichiarato';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists client_cycle_exercise_transitions_validate_client on public.client_cycle_exercise_transitions;
create trigger client_cycle_exercise_transitions_validate_client before insert or update on public.client_cycle_exercise_transitions
for each row execute function public.validate_cycle_exercise_transition_client();

alter table public.client_cycle_exercise_transitions enable row level security;

drop policy if exists client_cycle_exercise_transitions_superadmin_all on public.client_cycle_exercise_transitions;
create policy client_cycle_exercise_transitions_superadmin_all on public.client_cycle_exercise_transitions
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_cycle_exercise_transitions_owner_read on public.client_cycle_exercise_transitions;
create policy client_cycle_exercise_transitions_owner_read on public.client_cycle_exercise_transitions
  for select using (client_id = auth.uid());

-- ============================================================================
-- 10) superadmin_program_overrides — audit esteso (nessuna RPC in questo sotto-blocco)
-- ============================================================================
alter table public.superadmin_program_overrides drop constraint superadmin_program_overrides_action_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_action_check
  check (action in (
    'manual_assign', 'force_progress', 'force_maintain', 'force_reduce', 'unblock_pain',
    'suspend_cycle', 'resume_cycle', 'disable_template',
    'resolve_safety_review', 'resolve_template_review', 'replace_single_exercise',
    'force_cycle_decision', 'cancel_pending_review'
  ));

alter table public.superadmin_program_overrides
  add column if not exists entity_type text not null default 'cycle',
  add column if not exists entity_id uuid,
  add column if not exists previous_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists review_id uuid references public.client_cycle_reviews(id) on delete set null,
  add column if not exists status text not null default 'applied',
  add column if not exists reverted_at timestamptz,
  add column if not exists reverted_by uuid references public.profiles(id) on delete set null;

alter table public.superadmin_program_overrides drop constraint if exists superadmin_program_overrides_entity_type_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_entity_type_check
  check (entity_type in ('cycle', 'review', 'checkin', 'config', 'exercise_transition'));

alter table public.superadmin_program_overrides drop constraint if exists superadmin_program_overrides_status_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_status_check
  check (status in ('applied', 'reverted'));

alter table public.superadmin_program_overrides drop constraint if exists superadmin_program_overrides_reverted_after_created_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_reverted_after_created_check
  check (reverted_at is null or reverted_at >= created_at);

-- "motivo obbligatorio": notes diventa NOT NULL + non vuoto (0 righe reali
-- oggi, verificato — nessuna riga da correggere prima del vincolo).
alter table public.superadmin_program_overrides alter column notes set not null;
alter table public.superadmin_program_overrides drop constraint if exists superadmin_program_overrides_notes_not_empty_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_notes_not_empty_check
  check (length(trim(notes)) > 0);

comment on column public.superadmin_program_overrides.entity_id is 'Riferimento generico (polimorfico su entity_type) all''entità modificata — nessun FK diretto possibile perché entity_type varia tra tabelle diverse (cycle/review/checkin/config/exercise_transition).';

-- Stessa classe di vincolo di client_cycle_exercise_transitions: cycle_id e
-- (se presente) review_id devono appartenere allo stesso client_id
-- dichiarato sulla riga. Scritto qui e non solo affidato alla RLS
-- (superadmin-only) perché un errore umano di digitazione del Superadmin
-- (client_id sbagliato con cycle_id corretto di un altro cliente) sarebbe
-- comunque un dato di audit scorretto, non un problema di autorizzazione.
create or replace function public.validate_superadmin_program_override_client()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cycle_client_id uuid;
  v_review_cycle_client_id uuid;
begin
  if new.cycle_id is not null then
    select client_id into v_cycle_client_id from public.client_program_cycles where id = new.cycle_id;
    if v_cycle_client_id is null or v_cycle_client_id <> new.client_id then
      raise exception 'CROSS_CLIENT_REFERENCE: cycle_id non appartiene al client_id dichiarato';
    end if;
  end if;

  if new.review_id is not null then
    select cpc.client_id into v_review_cycle_client_id
    from public.client_cycle_reviews ccr
    join public.client_program_cycles cpc on cpc.id = ccr.cycle_id
    where ccr.id = new.review_id;
    if v_review_cycle_client_id is null or v_review_cycle_client_id <> new.client_id then
      raise exception 'CROSS_CLIENT_REFERENCE: review_id non appartiene al client_id dichiarato';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists superadmin_program_overrides_validate_client on public.superadmin_program_overrides;
create trigger superadmin_program_overrides_validate_client before insert or update on public.superadmin_program_overrides
for each row execute function public.validate_superadmin_program_override_client();

-- ============================================================================
-- 11) Ledger pause abbonamento — NESSUNA TABELLA CREATA (decisione esplicita)
-- ============================================================================
-- docs/BLOCK_2_DESIGN.md (sezioni 2.1/12) NON approva una tabella dedicata:
-- propone la ricostruzione di "giorni con abbonamento attivo" per intersezione
-- di intervalli dalle righe storiche di user_subscriptions come meccanismo
-- PRIMARIO, segnalando un contatore materializzato come possibile
-- alternativa futura NON ANCORA DECISA (dipende da una verifica empirica sul
-- comportamento del webhook RevenueCat, mai fatta). La richiesta di questo
-- sotto-blocco condiziona esplicitamente la creazione di un ledger
-- all'approvazione nel documento ("se il documento approva... creala ora"):
-- non essendoci quell'approvazione, nessuna tabella viene creata qui.
-- client_program_cycles.effective_active_days (punto 3) resta il campo
-- pronto ad accogliere il risultato del calcolo, qualunque meccanismo verrà
-- scelto nel sotto-blocco 2.3.

notify pgrst, 'reload schema';
