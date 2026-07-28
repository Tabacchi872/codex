-- Sotto-blocco 2.3 — "Programmi automatici": eleggibilita', check-in mensile
-- e motore atomico di revisione del ciclo.
--
-- Precondizione: BUG-056 e' gia' stato chiuso (migration precedente). Questa
-- migrazione NON tocca contenuto di template/esercizi/metadati: solo
-- funzioni, un vincolo CHECK additivo, una policy RLS e due colonne di
-- supporto (dedup notifiche).
--
-- Ambito dichiarato (fuori scope, volutamente non incluso qui):
-- schermate mobile check-in/review, pannello Superadmin, RPC di override
-- Superadmin, trigger di passaggio a coach (2.4), centro notifiche visibile,
-- job cron/periodici. Il sistema resta on-demand: e' il client (o una sua
-- chiamata esplicita) a invocare check_cycle_review_eligibility /
-- submit_monthly_checkin / run_cycle_review quando serve.

-- ============================================================================
-- PARTE A — Helper di classificazione stato ciclo (centralizzati)
-- ============================================================================
-- Prima di questa migrazione, assign_initial_auto_program() controllava solo
-- gli stati storici ('draft','active','pending_review'), ormai superati dal
-- CHECK a 11 stati introdotto nel 2.1. Questi helper diventano l'UNICA fonte
-- di verita' per "quali stati sono aperti/terminali/bloccati": nessuna nuova
-- funzione deve piu' scrivere una propria lista di stati.

create or replace function public._cycle_open_statuses()
returns text[]
language sql
immutable
as $$
  select array[
    'draft','active','checkin_due','review_pending',
    'pending_subscription','paused_subscription',
    'pending_safety_review','pending_template'
  ]::text[]
$$;

create or replace function public._cycle_terminal_statuses()
returns text[]
language sql
immutable
as $$
  select array['completed','replaced','cancelled']::text[]
$$;

-- Aperti ma non rivedibili automaticamente senza un evento esterno (checkin,
-- ripristino abbonamento, intervento Superadmin).
create or replace function public._cycle_blocked_statuses()
returns text[]
language sql
immutable
as $$
  select array[
    'pending_subscription','paused_subscription',
    'pending_safety_review','pending_template'
  ]::text[]
$$;

create or replace function public._exercise_level_ordinal(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'beginner' then 1
    when 'intermediate' then 2
    when 'advanced' then 3
    else 2
  end
$$;

revoke all on function public._cycle_open_statuses() from public;
revoke all on function public._cycle_terminal_statuses() from public;
revoke all on function public._cycle_blocked_statuses() from public;
revoke all on function public._exercise_level_ordinal(text) from public;
grant execute on function public._cycle_open_statuses() to authenticated;
grant execute on function public._cycle_terminal_statuses() to authenticated;
grant execute on function public._cycle_blocked_statuses() to authenticated;
grant execute on function public._exercise_level_ordinal(text) to authenticated;

-- ============================================================================
-- PARTE B — Motore di matching automatico condiviso (estratto da
-- assign_initial_auto_program per non duplicare la stessa cascata a 4 stadi
-- dentro run_cycle_review, riusata identica da entrambe).
-- ============================================================================
create or replace function public._match_auto_template(
  p_goal text, p_level text, p_location text, p_days integer, p_duration integer,
  p_exclude_template_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_template_id uuid;
begin
  -- Stage 1: match esatto goal+level+location.
  select id into v_template_id
  from public.workout_templates
  where is_system and is_active and auto_eligible
    and goal = p_goal and level = p_level and location = p_location
    and (p_exclude_template_id is null or id <> p_exclude_template_id)
  order by abs(coalesce(sessions_per_week, p_days) - p_days),
           abs(coalesce(estimated_session_minutes, p_duration) - p_duration),
           sort_order
  limit 1;

  -- Stage 2: stessa location+level, qualunque goal.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and level = p_level and location = p_location
      and (p_exclude_template_id is null or id <> p_exclude_template_id)
    order by abs(coalesce(sessions_per_week, p_days) - p_days),
             abs(coalesce(estimated_session_minutes, p_duration) - p_duration),
             sort_order
    limit 1;
  end if;

  -- Stage 3: stessa location+goal, livello piu' vicino.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and goal = p_goal and location = p_location
      and (p_exclude_template_id is null or id <> p_exclude_template_id)
    order by abs(public._level_ordinal(level) - public._level_ordinal(p_level)),
             abs(coalesce(sessions_per_week, p_days) - p_days),
             sort_order
    limit 1;
  end if;

  -- Stage 4: solo location, livello piu' vicino, qualunque goal.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and location = p_location
      and (p_exclude_template_id is null or id <> p_exclude_template_id)
    order by abs(public._level_ordinal(level) - public._level_ordinal(p_level)),
             abs(coalesce(sessions_per_week, p_days) - p_days),
             sort_order
    limit 1;
  end if;

  return v_template_id;
end;
$function$;

revoke all on function public._match_auto_template(text,text,text,integer,integer,uuid) from public;
grant execute on function public._match_auto_template(text,text,text,integer,integer,uuid) to authenticated;

-- ============================================================================
-- PARTE C — Fix assign_initial_auto_program (sezione 2 della richiesta)
-- ============================================================================
-- Due difetti corretti nella STESSA funzione, stessa causa radice (lessico di
-- stato non aggiornato dopo il 2.1):
-- 1) Il controllo di idempotenza (fast-path pre-lock + ricontrollo post-lock)
--    testava ancora 'draft','active','pending_review': un cliente il cui
--    ciclo e' oggi in un qualunque altro stato aperto (checkin_due,
--    review_pending, pending_subscription, paused_subscription,
--    pending_safety_review, pending_template) NON veniva riconosciuto come
--    "ciclo gia' esistente", con rischio di tentativo di doppia creazione.
-- 2) BUG LIVE (non solo pulizia): la funzione inserisce ancora
--    status='pending_review' in due punti (supervisione professionale
--    richiesta; nessun piano compatibile dopo le esclusioni). Questo valore
--    non e' piu' ammesso dal CHECK a 11 stati introdotto nel 2.1: un cliente
--    reale che oggi attivasse uno di questi due rami otterrebbe un errore DB
--    (violazione CHECK), non un'assegnazione "in attesa di revisione" come
--    inteso. Mappatura corretta, gia' decisa nel 2.1 (docs/DECISIONS.md):
--      - supervisione professionale richiesta -> 'pending_safety_review'
--      - nessun piano compatibile dopo esclusioni -> 'pending_template'
create or replace function public.assign_initial_auto_program()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_profile public.client_fitness_profile%rowtype;
  v_onboarding_mode text;
  v_goals text[];
  v_experience text;
  v_training_days integer;
  v_existing_cycle uuid;
  v_goal text;
  v_level text;
  v_location text;
  v_days integer;
  v_duration integer;
  v_template_id uuid;
  v_plan_ids uuid[];
  v_final_plan_ids uuid[] := '{}';
  v_removed_days text[] := '{}';
  v_pid uuid;
  v_day_label text;
  v_remaining_count integer;
  v_snapshot jsonb;
  v_cycle_id uuid;
  v_decision_reason text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  v_client_id := auth.uid();
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' richiedere il proprio programma automatico';
  end if;

  select * into v_profile from public.client_fitness_profile where client_id = v_client_id;
  if not found or not v_profile.completed then
    raise exception 'INVALID_STATE: questionario fitness non completato';
  end if;

  if not public.client_has_no_active_coach(v_client_id) then
    raise exception 'FORBIDDEN: cliente collegato a un coach, il sistema automatico non si applica';
  end if;

  -- Fast path (nessun lock): evita il costo del lock nel caso comune in cui
  -- il ciclo esiste gia'. Usa la lista centralizzata di stati aperti, non
  -- piu' una lista propria.
  select id into v_existing_cycle from public.client_program_cycles
  where client_id = v_client_id and status = any(public._cycle_open_statuses())
  limit 1;
  if v_existing_cycle is not null then
    return v_existing_cycle;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_client_id::text));

  select id into v_existing_cycle from public.client_program_cycles
  where client_id = v_client_id and status = any(public._cycle_open_statuses())
  limit 1;
  if v_existing_cycle is not null then
    return v_existing_cycle;
  end if;

  if not public._has_active_client_pro_entitlement(v_client_id) then
    raise exception 'CLIENT_PRO_REQUIRED: nessun piano Client Pro attivo';
  end if;

  select client_mode, goals, experience_level, training_days_per_week
  into v_onboarding_mode, v_goals, v_experience, v_training_days
  from public.client_onboarding where client_id = v_client_id;

  if v_onboarding_mode is null or v_onboarding_mode <> 'self_guided' then
    raise exception 'INVALID_STATE: onboarding cliente non completato o non self_guided';
  end if;

  v_snapshot := jsonb_build_object(
    'fitness_profile', to_jsonb(v_profile),
    'onboarding_goals', to_jsonb(v_goals),
    'onboarding_experience_level', v_experience,
    'onboarding_training_days_per_week', v_training_days
  );

  if v_profile.requires_professional_supervision then
    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, fitness_profile_snapshot, started_at, created_by
    ) values (
      v_client_id, 'pending_safety_review', 1, 'auto_initial',
      'Il questionario segnala una limitazione che richiede il parere di un professionista: nessuna scheda assegnata automaticamente, in attesa di intervento Superadmin.',
      v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
    select profiles.id, 'superadmin', 'auto_program_requires_supervision',
      'Cliente in attesa di supervisione professionale',
      'Un cliente ha completato il questionario fitness segnalando una limitazione che richiede il tuo intervento prima di assegnare un programma.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id),
      'auto_program_requires_supervision:' || v_cycle_id::text
    from public.profiles where profiles.role = 'superadmin';

    return v_cycle_id;
  end if;

  v_level := case v_experience
    when 'beginner' then 'Principiante'
    when 'novice' then 'Principiante'
    when 'intermediate' then 'Intermedio'
    when 'advanced' then 'Avanzato'
    when 'competitive' then 'Avanzato'
    else 'Intermedio'
  end;

  v_goal := case v_goals[1]
    when 'Perdere peso' then 'Dimagrimento'
    when 'Costruire muscoli' then 'Massa muscolare'
    when 'Diventare più forte' then 'Forza'
    when 'Migliorare i fondamentali' then 'Principianti'
    when 'Migliorare il condizionamento' then 'Performance'
    when 'Preparazione sportiva' then 'Performance'
    else 'Principianti'
  end;

  v_location := case v_profile.location when 'gym' then 'Palestra' when 'home' then 'Casa' else 'Palestra' end;
  v_days := coalesce(v_training_days, 3);
  v_duration := coalesce(v_profile.session_duration_minutes, 45);

  v_template_id := public._match_auto_template(v_goal, v_level, v_location, v_days, v_duration);

  if v_template_id is null then
    raise exception 'NO_TEMPLATE_AVAILABLE: nessun modello automatico disponibile per questa combinazione';
  end if;

  v_plan_ids := public._copy_template_days_to_plans(v_template_id, v_client_id, null, 'auto_system');

  delete from public.workout_day_exercises wde
  using public.workout_days wd
  where wde.workout_day_id = wd.id
    and wd.workout_plan_id = any (v_plan_ids)
    and wde.exercise_id in (
      select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active
    );

  foreach v_pid in array v_plan_ids loop
    select count(*) into v_remaining_count
    from public.workout_day_exercises wde
    join public.workout_days wd on wd.id = wde.workout_day_id
    where wd.workout_plan_id = v_pid;

    if v_remaining_count = 0 then
      select day_label into v_day_label from public.workout_plans where id = v_pid;
      v_removed_days := array_append(v_removed_days, coalesce(v_day_label, 'Workout'));
      delete from public.workout_plans where id = v_pid;
    else
      v_final_plan_ids := array_append(v_final_plan_ids, v_pid);
    end if;
  end loop;

  if array_length(v_final_plan_ids, 1) is null then
    v_decision_reason := 'Il modello selezionato è risultato interamente incompatibile con gli esercizi esclusi dal cliente: nessuna scheda creata, in attesa di intervento Superadmin.';

    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, template_id, fitness_profile_snapshot, started_at, created_by
    ) values (
      v_client_id, 'pending_template', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
    select profiles.id, 'superadmin', 'auto_program_requires_supervision',
      'Cliente senza programma assegnabile automaticamente',
      'Il modello scelto dal motore automatico è risultato vuoto dopo aver rimosso gli esercizi esclusi dal cliente.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id),
      'auto_program_requires_supervision:' || v_cycle_id::text
    from public.profiles where profiles.role = 'superadmin';

    return v_cycle_id;
  end if;

  v_decision_reason := case
    when array_length(v_removed_days, 1) is null then
      'Programma assegnato automaticamente in base a obiettivo, livello, luogo e giorni disponibili indicati nel questionario.'
    else
      'Programma assegnato automaticamente; ' || array_length(v_removed_days, 1)::text || ' giorno/i del modello omesso/i perché composto/i solo da esercizi esclusi dal cliente.'
  end;

  insert into public.client_program_cycles (
    client_id, status, cycle_number, source, decision_reason, template_id, fitness_profile_snapshot, started_at, review_due_at, created_by
  ) values (
    v_client_id, 'active', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, current_date + 28, v_client_id
  ) returning id into v_cycle_id;

  insert into public.client_program_cycle_plans (cycle_id, workout_plan_id)
  select v_cycle_id, unnest(v_final_plan_ids);

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (v_client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma è pronto', v_decision_reason,
    jsonb_build_object('cycle_id', v_cycle_id, 'template_id', v_template_id),
    'auto_program_assigned:' || v_cycle_id::text);

  return v_cycle_id;
end;
$function$;

-- ============================================================================
-- PARTE D — Estensioni schema
-- ============================================================================

-- D.1: client_cycle_reviews.eligibility_result deve poter registrare anche
-- gli esiti 'no_active_cycle' e 'forbidden' richiesti da
-- check_cycle_review_eligibility. 0 righe reali oggi in questa tabella:
-- estensione additiva sicura, nessun dato da migrare.
alter table public.client_cycle_reviews
  drop constraint client_cycle_reviews_eligibility_result_check;
alter table public.client_cycle_reviews
  add constraint client_cycle_reviews_eligibility_result_check
  check (
    eligibility_result is null or eligibility_result = any(array[
      'eligible','cycle_not_due','checkin_required','insufficient_sessions',
      'insufficient_progress_data','subscription_required','coach_assigned',
      'safety_review_required','already_reviewed','no_active_cycle','forbidden'
    ]::text[])
  );

-- D.2: chiusura di una policy RLS troppo permissiva. client_monthly_checkins
-- ha oggi una policy ALL per il proprietario (client_id = auth.uid()) che
-- permetterebbe scrittura DIRETTA via REST, bypassando tutte le validazioni
-- di submit_monthly_checkin (proprieta' del ciclo corrente, campi vietati,
-- verifica esercizi liked/disliked, blocco post-lock lato applicativo prima
-- del trigger DB). Nessun consumer esistente scrive oggi su questa tabella
-- (0 righe reali, nessuna UI/RPC 2.0-2.2 la tocca): rimuoverla non rompe
-- nulla di gia' funzionante. Da qui in avanti l'UNICO percorso di scrittura
-- e' submit_monthly_checkin (e run_cycle_review per il lock finale).
drop policy if exists client_monthly_checkins_owner_all on public.client_monthly_checkins;
create policy client_monthly_checkins_owner_read on public.client_monthly_checkins
  for select
  using (client_id = auth.uid());

-- D.3: deduplicazione notifiche. Nessuna colonna di dedup esisteva finora;
-- run_cycle_review/assign_initial_auto_program la usano per garantire "una
-- sola notifica per evento", non una ad ogni retry/riapertura.
alter table public.app_notifications add column if not exists dedup_key text;
create unique index if not exists app_notifications_recipient_dedup_key_idx
  on public.app_notifications (recipient_id, dedup_key)
  where dedup_key is not null;

-- ============================================================================
-- PARTE E — Helper di configurazione e arrotondamento
-- ============================================================================
create or replace function public._active_review_config_version()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select max(config_version) from public.auto_program_review_config where is_active
$$;

create or replace function public._review_config_value(p_key text, p_config_version integer)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select value from public.auto_program_review_config
  where key = p_key and is_active and config_version = p_config_version
$$;

-- Arrotondamento deterministico e coerente con l'attrezzo: 2.5kg per
-- manubri/bilanciere, 5kg per macchine/cavi/altro. Se l'incremento richiesto
-- arrotonda a 0 (carico troppo leggero perche' il 10% raggiunga uno scatto
-- pieno), non forza un incremento minimo inventato: nessun incremento questo
-- ciclo su quell'esercizio (la gerarchia tenta comunque le ripetizioni prima
-- del carico, vedi run_cycle_review).
create or replace function public._round_load_increment(p_current numeric, p_ratio numeric, p_equipment_tag text)
returns numeric
language sql
immutable
as $$
  select case
    when p_current is null or p_current <= 0 then p_current
    else p_current + (
      case
        when p_equipment_tag ilike '%manubri%' or p_equipment_tag ilike '%bilanciere%' then
          round((p_current * p_ratio) / 2.5) * 2.5
        else
          round((p_current * p_ratio) / 5.0) * 5.0
      end
    )
  end
$$;

revoke all on function public._active_review_config_version() from public;
revoke all on function public._review_config_value(text, integer) from public;
revoke all on function public._round_load_increment(numeric, numeric, text) from public;
grant execute on function public._active_review_config_version() to authenticated;
grant execute on function public._review_config_value(text, integer) to authenticated;
grant execute on function public._round_load_increment(numeric, numeric, text) to authenticated;

-- ============================================================================
-- PARTE E.2 — Metriche di progresso del ciclo (condivise da
-- check_cycle_review_eligibility e run_cycle_review, un'unica formula).
-- ============================================================================
-- sessions_expected: giorni-scheda distinti nel ciclo * settimane trascorse
-- (limitate a nominal_cycle_days). sessions_completed: combinazioni distinte
-- (workout_plan_id, session_date) in exercise_progress_history entro il
-- ciclo — una "sessione" self-guided e' l'insieme dei set loggati per un
-- piano-giorno in una data. Righe storiche senza dati di carico/RPE (2.0)
-- NON vengono mai trattate come performance negativa: contano solo per
-- l'esistenza della sessione, mai per il trend.
create or replace function public._compute_cycle_progress_metrics(p_cycle_id uuid)
returns table (
  sessions_expected integer,
  sessions_completed integer,
  completion_ratio numeric,
  primary_total integer,
  primary_evaluable integer,
  evaluable_ratio numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_cycle public.client_program_cycles%rowtype;
  v_config_version integer;
  v_nominal_days numeric;
  v_days_per_week integer;
  v_weeks_elapsed numeric;
  v_sessions_expected integer;
  v_sessions_completed integer;
  v_primary_total integer;
  v_primary_evaluable integer;
begin
  select * into v_cycle from public.client_program_cycles where id = p_cycle_id;
  if not found then
    raise exception 'NOT_FOUND: ciclo % inesistente', p_cycle_id;
  end if;

  v_config_version := public._active_review_config_version();
  v_nominal_days := public._review_config_value('nominal_cycle_days', v_config_version);

  select count(distinct wp.id) into v_days_per_week
  from public.client_program_cycle_plans cpp
  join public.workout_plans wp on wp.id = cpp.workout_plan_id
  where cpp.cycle_id = p_cycle_id;

  v_weeks_elapsed := greatest(1, ceil(least((current_date - v_cycle.started_at)::numeric, v_nominal_days) / 7.0));
  v_sessions_expected := greatest(1, coalesce(v_days_per_week, 0)) * v_weeks_elapsed::integer;

  select count(distinct (eph.workout_plan_id, eph.session_date)) into v_sessions_completed
  from public.exercise_progress_history eph
  join public.client_program_cycle_plans cpp on cpp.workout_plan_id = eph.workout_plan_id and cpp.cycle_id = p_cycle_id
  where eph.session_date >= v_cycle.started_at and eph.session_date <= current_date;

  select count(*) into v_primary_total
  from public.client_program_cycle_plans cpp
  join public.workout_plans wp on wp.id = cpp.workout_plan_id
  join public.workout_days wd on wd.workout_plan_id = wp.id
  join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  join public.exercise_movement_metadata emm on emm.exercise_id = wde.exercise_id
  where cpp.cycle_id = p_cycle_id and emm.role = 'primary';

  select count(distinct wde.id) into v_primary_evaluable
  from public.client_program_cycle_plans cpp
  join public.workout_plans wp on wp.id = cpp.workout_plan_id
  join public.workout_days wd on wd.workout_plan_id = wp.id
  join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  join public.exercise_movement_metadata emm on emm.exercise_id = wde.exercise_id
  where cpp.cycle_id = p_cycle_id and emm.role = 'primary'
    and exists (
      select 1 from public.exercise_progress_history eph
      where eph.workout_exercise_id = wde.id and eph.weight_kg is not null and eph.reps_completed is not null
    );

  return query select
    v_sessions_expected,
    v_sessions_completed,
    case when v_sessions_expected > 0 then least(1.0, v_sessions_completed::numeric / v_sessions_expected) else 0::numeric end,
    v_primary_total,
    v_primary_evaluable,
    case when v_primary_total > 0 then v_primary_evaluable::numeric / v_primary_total else 1.0::numeric end;
end;
$function$;

revoke all on function public._compute_cycle_progress_metrics(uuid) from public;
grant execute on function public._compute_cycle_progress_metrics(uuid) to authenticated;

-- ============================================================================
-- PARTE F — check_cycle_review_eligibility
-- ============================================================================
-- Pura: nessuna scrittura, nessun effetto collaterale. Richiamabile in
-- qualunque momento. Identita' derivata esclusivamente da auth.uid() (nessun
-- parametro client_id: il chiamante non puo' scegliere un cliente
-- arbitrario). cycle_id opzionale: se assente, risolve il ciclo corrente del
-- cliente (stato aperto piu' recente).
--
-- Ordine di priorita' dei result_code (deterministico, non affidato
-- all'ordine di valutazione SQL implicito — ogni ramo e' un return esplicito
-- e la funzione esce alla prima condizione soddisfatta):
--   0. forbidden               — non autenticato, non cliente, o cycle_id
--                                 non appartenente al chiamante
--   1. no_active_cycle         — nessun ciclo trovato, oppure il ciclo dato/
--                                 risolto e' in uno stato terminale senza
--                                 valore (completed/cancelled)
--   2. already_reviewed        — ciclo 'replaced', o 'pending_template', o
--                                 esiste gia' una review definitiva
--                                 (decision <> 'insufficient_data') per
--                                 questo cycle_id
--   3. safety_review_required  — status = 'pending_safety_review' (verificato
--                                 DIRETTAMENTE sullo stato, PRIMA del check
--                                 sulla tabella review: questo stato puo'
--                                 essere stato impostato da
--                                 assign_initial_auto_program senza alcuna
--                                 riga in client_cycle_reviews — se il check
--                                 "already_reviewed" fosse valutato prima,
--                                 questo caso non verrebbe mai intercettato)
--   4. coach_assigned          — client_has_no_active_coach() = false
--   5. subscription_required   — nessun entitlement Client Pro attivo ORA
--   6. cycle_not_due           — current_date < review_due_at
--   7. checkin_required        — nessun check-in submitted/locked per il ciclo
--   8. insufficient_sessions   — sessioni/aderenza sotto soglia di config
--   9. insufficient_progress_data — dati esercizi principali sotto soglia
--  10. eligible                — nessuna delle condizioni sopra
--
-- Nota sui "giorni effettivi di abbonamento attivo": le colonne
-- client_program_cycles.effective_active_days/checkin_available_at/
-- suspended_at/resumed_at esistono in schema (2.1) ma NESSUNA funzione le
-- mantiene ancora (confermato: 0 scritture, sempre default). Calcolarle con
-- certezza richiederebbe un trigger sui cambi di user_subscriptions o un job
-- periodico: entrambi fuori perimetro del 2.3 (on-demand, niente cron).
-- Per la sola decisione "e' il momento del check-in?" questa funzione usa
-- client_program_cycles.review_due_at, gia' popolato in modo affidabile alla
-- creazione del ciclo (started_at + nominal_cycle_days) — non un intervallo
-- inventato. Il gap sulle pause effettive resta segnalato in
-- docs/DECISIONS.md, non nascosto dietro una formula approssimata.
create or replace function public.check_cycle_review_eligibility(p_cycle_id uuid default null)
returns table (
  eligible boolean,
  result_code text,
  cycle_id uuid,
  cycle_status text,
  sessions_expected integer,
  sessions_completed integer,
  completion_ratio numeric,
  primary_exercises_total integer,
  primary_exercises_evaluable integer,
  evaluable_ratio numeric,
  checkin_required boolean,
  checkin_present boolean,
  review_already_definitive boolean,
  expected_review_date date,
  config_version integer,
  blocking_reasons text[]
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_cycle public.client_program_cycles%rowtype;
  v_checkin public.client_monthly_checkins%rowtype;
  v_has_definitive_review boolean;
  v_config_version integer;
  v_min_completion_ratio numeric;
  v_min_sessions numeric;
  v_min_exercise_data_ratio numeric;
  v_sessions_expected integer;
  v_sessions_completed integer;
  v_completion_ratio numeric;
  v_primary_total integer;
  v_primary_evaluable integer;
  v_evaluable_ratio numeric;
begin
  if auth.uid() is null then
    return query select false, 'forbidden'::text, null::uuid, null::text, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, null::boolean, null::date, null::integer, array['NOT_AUTHENTICATED']::text[];
    return;
  end if;
  v_client_id := auth.uid();

  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    return query select false, 'forbidden'::text, null::uuid, null::text, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, null::boolean, null::date, null::integer, array['NOT_A_CLIENT']::text[];
    return;
  end if;

  if p_cycle_id is not null then
    select * into v_cycle from public.client_program_cycles where id = p_cycle_id;
    if not found then
      return query select false, 'no_active_cycle'::text, p_cycle_id, null::text, null::integer, null::integer, null::numeric,
        null::integer, null::integer, null::numeric, null::boolean, null::boolean, null::boolean, null::date, null::integer, array['CYCLE_NOT_FOUND']::text[];
      return;
    end if;
    if v_cycle.client_id <> v_client_id then
      return query select false, 'forbidden'::text, p_cycle_id, null::text, null::integer, null::integer, null::numeric,
        null::integer, null::integer, null::numeric, null::boolean, null::boolean, null::boolean, null::date, null::integer, array['NOT_OWNER']::text[];
      return;
    end if;
  else
    select * into v_cycle from public.client_program_cycles
    where client_id = v_client_id and status = any(public._cycle_open_statuses())
    order by started_at desc limit 1;
    if not found then
      return query select false, 'no_active_cycle'::text, null::uuid, null::text, null::integer, null::integer, null::numeric,
        null::integer, null::integer, null::numeric, null::boolean, null::boolean, null::boolean, null::date, null::integer, array['NO_OPEN_CYCLE']::text[];
      return;
    end if;
  end if;

  if v_cycle.status = any(array['completed','cancelled']::text[]) then
    return query select false, 'no_active_cycle'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, true, null::date, null::integer, array['CYCLE_TERMINAL']::text[];
    return;
  end if;

  if v_cycle.status = 'replaced' then
    return query select false, 'already_reviewed'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, true, null::date, null::integer, array['CYCLE_REPLACED']::text[];
    return;
  end if;

  if v_cycle.status = 'pending_safety_review' then
    return query select false, 'safety_review_required'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, false, null::date, null::integer, array['SAFETY_BLOCK']::text[];
    return;
  end if;

  select exists(
    select 1 from public.client_cycle_reviews where cycle_id = v_cycle.id and decision <> 'insufficient_data'
  ) into v_has_definitive_review;

  if v_cycle.status = 'pending_template' or v_has_definitive_review then
    return query select false, 'already_reviewed'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, true, null::date, null::integer, array['DEFINITIVE_REVIEW_EXISTS']::text[];
    return;
  end if;

  if not public.client_has_no_active_coach(v_client_id) then
    return query select false, 'coach_assigned'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, false, v_cycle.review_due_at, null::integer, array['COACH_ASSIGNED']::text[];
    return;
  end if;

  if not public._has_active_client_pro_entitlement(v_client_id) then
    return query select false, 'subscription_required'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, null::boolean, null::boolean, false, v_cycle.review_due_at, null::integer, array['NO_ENTITLEMENT']::text[];
    return;
  end if;

  if v_cycle.review_due_at is null or current_date < v_cycle.review_due_at then
    return query select false, 'cycle_not_due'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, false, false, false, v_cycle.review_due_at, null::integer, array['NOT_DUE_YET']::text[];
    return;
  end if;

  select * into v_checkin from public.client_monthly_checkins
  where cycle_id = v_cycle.id and status in ('submitted','locked')
  order by updated_at desc limit 1;

  if not found then
    return query select false, 'checkin_required'::text, v_cycle.id, v_cycle.status, null::integer, null::integer, null::numeric,
      null::integer, null::integer, null::numeric, true, false, false, v_cycle.review_due_at, null::integer, array['CHECKIN_MISSING']::text[];
    return;
  end if;

  v_config_version := public._active_review_config_version();
  v_min_completion_ratio := public._review_config_value('min_completion_ratio', v_config_version);
  v_min_sessions := public._review_config_value('min_sessions', v_config_version);
  v_min_exercise_data_ratio := public._review_config_value('min_exercise_data_ratio', v_config_version);

  select m.sessions_expected, m.sessions_completed, m.completion_ratio, m.primary_total, m.primary_evaluable, m.evaluable_ratio
  into v_sessions_expected, v_sessions_completed, v_completion_ratio, v_primary_total, v_primary_evaluable, v_evaluable_ratio
  from public._compute_cycle_progress_metrics(v_cycle.id) m;

  if v_sessions_completed < v_min_sessions or v_completion_ratio < v_min_completion_ratio then
    return query select false, 'insufficient_sessions'::text, v_cycle.id, v_cycle.status, v_sessions_expected, v_sessions_completed, round(v_completion_ratio,4),
      v_primary_total, v_primary_evaluable, round(v_evaluable_ratio,4), true, true, false, v_cycle.review_due_at, v_config_version, array['LOW_ADHERENCE']::text[];
    return;
  end if;

  if v_evaluable_ratio < v_min_exercise_data_ratio then
    return query select false, 'insufficient_progress_data'::text, v_cycle.id, v_cycle.status, v_sessions_expected, v_sessions_completed, round(v_completion_ratio,4),
      v_primary_total, v_primary_evaluable, round(v_evaluable_ratio,4), true, true, false, v_cycle.review_due_at, v_config_version, array['LOW_EXERCISE_DATA']::text[];
    return;
  end if;

  return query select true, 'eligible'::text, v_cycle.id, v_cycle.status, v_sessions_expected, v_sessions_completed, round(v_completion_ratio,4),
    v_primary_total, v_primary_evaluable, round(v_evaluable_ratio,4), true, true, false, v_cycle.review_due_at, v_config_version, '{}'::text[];
end;
$function$;

revoke all on function public.check_cycle_review_eligibility(uuid) from public;
grant execute on function public.check_cycle_review_eligibility(uuid) to authenticated;

-- ============================================================================
-- PARTE G — submit_monthly_checkin
-- ============================================================================
-- Creazione/aggiornamento autorevole del check-in mensile. Il cliente NON
-- puo' impostare direttamente: client_id (derivato da auth.uid()), decisione,
-- stato della review, esito di sicurezza, configurazione, versione
-- algoritmo, aggregati di progresso — nessuno di questi e' un parametro di
-- questa funzione, tutti vengono scritti solo da run_cycle_review.
-- Editabile liberamente finche' locked_at is null (upsert su UNIQUE(cycle_id));
-- il trigger gia' esistente prevent_client_monthly_checkin_edit_after_lock
-- blocca comunque qualunque UPDATE dopo il lock, anche in caso di bug futuro
-- in questa funzione — difesa in profondita', non l'unico cancello.
create or replace function public.submit_monthly_checkin(
  p_cycle_id uuid,
  p_perceived_difficulty text default null,
  p_sessions_completed_estimate integer default null,
  p_has_pain_or_limitation boolean default false,
  p_pain_areas text[] default '{}',
  p_pain_notes text default null,
  p_requires_professional_supervision boolean default false,
  p_wants_to_continue boolean default true,
  p_available_minutes integer default null,
  p_goal_changed_to text default null,
  p_variety_preference text default null,
  p_liked_exercise_ids text[] default '{}',
  p_disliked_exercise_ids text[] default '{}',
  p_notes text default null,
  p_perceived_fatigue text default null,
  p_recovery_quality text default null,
  p_satisfaction text default null,
  p_available_days_per_week integer default null,
  p_location text default null,
  p_equipment_level text default null,
  p_equipment_no_longer_available text[] default '{}',
  p_equipment_newly_available text[] default '{}',
  p_main_skip_reason text default null,
  p_submit boolean default false
)
returns public.client_monthly_checkins
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_cycle public.client_program_cycles%rowtype;
  v_existing public.client_monthly_checkins%rowtype;
  v_result public.client_monthly_checkins%rowtype;
  v_status text;
  v_bad_liked text[];
  v_bad_disliked text[];
  v_dup_liked integer;
  v_dup_disliked integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_client_id := auth.uid();

  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' sottomettere il proprio check-in';
  end if;

  select * into v_cycle from public.client_program_cycles where id = p_cycle_id;
  if not found or v_cycle.client_id <> v_client_id then
    raise exception 'FORBIDDEN_OR_NOT_FOUND: ciclo non trovato o non appartenente al cliente';
  end if;

  if not public.client_has_no_active_coach(v_client_id) then
    raise exception 'FORBIDDEN: cliente collegato a un coach, il check-in automatico non si applica';
  end if;

  if not public._has_active_client_pro_entitlement(v_client_id) then
    raise exception 'CLIENT_PRO_REQUIRED: nessun piano Client Pro attivo';
  end if;

  if v_cycle.status <> all(array['active','checkin_due','review_pending']::text[]) then
    raise exception 'INVALID_CYCLE_STATE: lo stato % non consente la sottomissione di un check-in', v_cycle.status;
  end if;

  if exists (select 1 from public.client_cycle_reviews where cycle_id = p_cycle_id and decision <> 'insufficient_data') then
    raise exception 'ALREADY_REVIEWED: questo ciclo ha gia'' una decisione definitiva';
  end if;

  -- Serializza sottomissioni concorrenti dello STESSO ciclo (doppio tap,
  -- due device): la seconda chiamata attende il commit della prima e poi
  -- rilegge lo stato di lock sotto la propria SELECT ... FOR UPDATE.
  perform pg_advisory_xact_lock(hashtext(p_cycle_id::text));

  select * into v_existing from public.client_monthly_checkins where cycle_id = p_cycle_id for update;

  if found and v_existing.locked_at is not null then
    raise exception 'CHECKIN_LOCKED: il check-in e'' immutabile dopo l''avvio della review';
  end if;

  select coalesce(array_agg(x), '{}') into v_bad_liked
  from unnest(coalesce(p_liked_exercise_ids, '{}'::text[])) x
  where not exists (
    select 1 from public.client_program_cycle_plans cpp
    join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
    join public.workout_day_exercises wde on wde.workout_day_id = wd.id
    where cpp.cycle_id = p_cycle_id and wde.exercise_id = x
  );
  if coalesce(array_length(v_bad_liked,1),0) > 0 then
    raise exception 'INVALID_LIKED_EXERCISE: % non appartiene al piano di questo ciclo', v_bad_liked;
  end if;

  select coalesce(array_agg(x), '{}') into v_bad_disliked
  from unnest(coalesce(p_disliked_exercise_ids, '{}'::text[])) x
  where not exists (
    select 1 from public.client_program_cycle_plans cpp
    join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
    join public.workout_day_exercises wde on wde.workout_day_id = wd.id
    where cpp.cycle_id = p_cycle_id and wde.exercise_id = x
  );
  if coalesce(array_length(v_bad_disliked,1),0) > 0 then
    raise exception 'INVALID_DISLIKED_EXERCISE: % non appartiene al piano di questo ciclo', v_bad_disliked;
  end if;

  select count(*) into v_dup_liked from unnest(coalesce(p_liked_exercise_ids,'{}'::text[])) x;
  if v_dup_liked <> (select count(distinct x) from unnest(coalesce(p_liked_exercise_ids,'{}'::text[])) x) then
    raise exception 'DUPLICATE_LIKED_EXERCISE';
  end if;
  select count(*) into v_dup_disliked from unnest(coalesce(p_disliked_exercise_ids,'{}'::text[])) x;
  if v_dup_disliked <> (select count(distinct x) from unnest(coalesce(p_disliked_exercise_ids,'{}'::text[])) x) then
    raise exception 'DUPLICATE_DISLIKED_EXERCISE';
  end if;

  v_status := case when p_submit then 'submitted' else 'draft' end;

  insert into public.client_monthly_checkins (
    client_id, cycle_id, perceived_difficulty, sessions_completed_estimate, has_pain_or_limitation, pain_areas, pain_notes,
    requires_professional_supervision, wants_to_continue, available_minutes, goal_changed_to, variety_preference,
    liked_exercise_ids, disliked_exercise_ids, notes, perceived_fatigue, recovery_quality, satisfaction,
    available_days_per_week, location, equipment_level, equipment_no_longer_available, equipment_newly_available,
    main_skip_reason, status, completed_at
  ) values (
    v_client_id, p_cycle_id, p_perceived_difficulty, p_sessions_completed_estimate, coalesce(p_has_pain_or_limitation,false), coalesce(p_pain_areas,'{}'), p_pain_notes,
    coalesce(p_requires_professional_supervision,false), coalesce(p_wants_to_continue,true), p_available_minutes, p_goal_changed_to, p_variety_preference,
    coalesce(p_liked_exercise_ids,'{}'), coalesce(p_disliked_exercise_ids,'{}'), p_notes, p_perceived_fatigue, p_recovery_quality, p_satisfaction,
    p_available_days_per_week, p_location, p_equipment_level, coalesce(p_equipment_no_longer_available,'{}'), coalesce(p_equipment_newly_available,'{}'),
    p_main_skip_reason, v_status, case when p_submit then now() else null end
  )
  on conflict (cycle_id) do update set
    perceived_difficulty = excluded.perceived_difficulty,
    sessions_completed_estimate = excluded.sessions_completed_estimate,
    has_pain_or_limitation = excluded.has_pain_or_limitation,
    pain_areas = excluded.pain_areas,
    pain_notes = excluded.pain_notes,
    requires_professional_supervision = excluded.requires_professional_supervision,
    wants_to_continue = excluded.wants_to_continue,
    available_minutes = excluded.available_minutes,
    goal_changed_to = excluded.goal_changed_to,
    variety_preference = excluded.variety_preference,
    liked_exercise_ids = excluded.liked_exercise_ids,
    disliked_exercise_ids = excluded.disliked_exercise_ids,
    notes = excluded.notes,
    perceived_fatigue = excluded.perceived_fatigue,
    recovery_quality = excluded.recovery_quality,
    satisfaction = excluded.satisfaction,
    available_days_per_week = excluded.available_days_per_week,
    location = excluded.location,
    equipment_level = excluded.equipment_level,
    equipment_no_longer_available = excluded.equipment_no_longer_available,
    equipment_newly_available = excluded.equipment_newly_available,
    main_skip_reason = excluded.main_skip_reason,
    status = excluded.status,
    completed_at = excluded.completed_at,
    updated_at = now()
  where public.client_monthly_checkins.locked_at is null
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.submit_monthly_checkin(
  uuid, text, integer, boolean, text[], text, boolean, boolean, integer, text, text, text[], text[], text,
  text, text, text, integer, text, text, text[], text[], text, boolean
) from public;
grant execute on function public.submit_monthly_checkin(
  uuid, text, integer, boolean, text[], text, boolean, boolean, integer, text, text, text[], text[], text,
  text, text, text, integer, text, text, text[], text[], text, boolean
) to authenticated;

-- ============================================================================
-- PARTE H — run_cycle_review: motore atomico di revisione (17 passi)
-- ============================================================================
-- Un'unica transazione, idempotente: doppio tap, due device, retry dopo
-- timeout devono ottenere lo STESSO risultato, mai una seconda riga di
-- decisione/ciclo/notifica. Serializzazione:
--   1) lock riga (SELECT ... FOR UPDATE) sul ciclo interessato: una seconda
--      chiamata concorrente sullo STESSO ciclo attende il commit della prima,
--      poi rilegge lo stato gia' aggiornato e ricade nel ramo idempotente
--      (stato terminale/bloccato con review gia' esistente).
--   2) advisory lock per client_id (difesa aggiuntiva contro una
--      assign_initial_auto_program concorrente per lo stesso cliente).
--   3) ogni precondizione (coach, entitlement, checkin, scadenza, soglie) e'
--      riletta DOPO il lock, mai fidandosi di una lettura precedente.
--
-- Ordine di decisione (sezione 10, fisso, non affidato all'ordine SQL):
--   1. blocked_safety  2. blocked_subscription  3. manual_review
--   4. insufficient_data  5. pending_template  6. regress  7. progress
--   8. partial_change  9. maintain
-- Ogni ramo e' un return esplicito nell'ordine sopra: la funzione non
-- valuta MAI due condizioni "in parallelo" lasciando all'ottimizzatore la
-- scelta di quale vince.
create or replace function public.run_cycle_review(p_cycle_id uuid default null)
returns table (
  decision text,
  cycle_id uuid,
  next_cycle_id uuid,
  decision_reason text,
  blocked boolean,
  result_code text,
  metrics jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_cycle public.client_program_cycles%rowtype;
  v_checkin public.client_monthly_checkins%rowtype;
  v_review public.client_cycle_reviews%rowtype;
  v_review_id uuid;
  v_template public.workout_templates%rowtype;
  v_config_version integer;
  v_min_completion_ratio numeric;
  v_min_sessions numeric;
  v_min_exercise_data_ratio numeric;
  v_progress_min_completion_ratio numeric;
  v_regress_max_completion_ratio numeric;
  v_trend_rpe_high numeric;
  v_max_load_increase_ratio numeric;
  v_max_added_sets_per_exercise numeric;
  v_max_exercise_change_ratio numeric;
  v_metrics record;
  v_decision text;
  v_decision_reason text;
  v_next_template_id uuid;
  v_new_location text;
  v_new_goal text;
  v_structural_change boolean;
  v_candidate_template_id uuid;
  v_lower_level text;
  v_severe_regress boolean;
  v_regress_trigger boolean;
  v_progress_trigger boolean;
  v_negative_primary integer := 0;
  v_pain_exercises integer := 0;
  v_total_exercises integer := 0;
  v_all_exercises jsonb := '[]'::jsonb;
  v_ex record;
  v_trend text;
  v_new_cycle_id uuid;
  v_day_map jsonb := '{}'::jsonb;
  v_new_plan_ids uuid[] := '{}';
  v_old_plan record;
  v_new_plan_id uuid;
  v_new_day_id uuid;
  v_old_day_id uuid;
  v_item record;
  v_action text;
  v_new_exercise_id text;
  v_new_sets integer;
  v_new_reps integer;
  v_new_weight numeric;
  v_new_rest integer;
  v_reason text;
  v_candidate text;
  v_kept_count integer := 0;
  v_replaced_count integer := 0;
  v_progressed_count integer := 0;
  v_regressed_count integer := 0;
  v_max_replacements integer;
  v_replaced_so_far integer := 0;
  v_delta numeric;
  v_old2 record;
  v_new2 record;
  v_notification_type text;
  v_notification_title text;
  v_notification_body text;
begin
  -- ---- STEP 1: identita' da auth.uid() -------------------------------
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_client_id := auth.uid();
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' avviare la revisione del proprio ciclo';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_client_id::text));

  -- ---- STEP 2-3: risolvi e blocca il ciclo (rilettura sotto lock) ----
  if p_cycle_id is not null then
    select * into v_cycle from public.client_program_cycles where id = p_cycle_id for update;
    if not found then
      raise exception 'NO_ACTIVE_CYCLE: ciclo non trovato';
    end if;
    if v_cycle.client_id <> v_client_id then
      raise exception 'FORBIDDEN: ciclo non appartenente al chiamante';
    end if;
  else
    select * into v_cycle from public.client_program_cycles
    where client_id = v_client_id and status = any(public._cycle_open_statuses())
    order by started_at desc limit 1
    for update;
    if not found then
      raise exception 'NO_ACTIVE_CYCLE: nessun ciclo aperto per questo cliente';
    end if;
  end if;

  if v_cycle.status = 'cancelled' then
    raise exception 'NO_ACTIVE_CYCLE: ciclo cancellato, nulla da rivedere automaticamente';
  end if;

  -- ---- STEP 4: idempotenza sugli stati gia' conclusi/bloccati --------
  if v_cycle.status = any(array['completed','replaced']::text[]) then
    select * into v_review from public.client_cycle_reviews
    where cycle_id = v_cycle.id and decision <> 'insufficient_data'
    order by reviewed_at desc limit 1;
    if not found then
      raise exception 'INTERNAL_INCONSISTENCY: ciclo % in stato terminale senza review definitiva', v_cycle.id;
    end if;
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'already_reviewed'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- Controllo difensivo aggiuntivo: se per qualunque motivo esiste gia' una
  -- review definitiva per un ciclo il cui stato e' rimasto aperto (non
  -- dovrebbe accadere, essendo tutto atomico), la richiesta viene comunque
  -- risolta in modo idempotente invece di rielaborare.
  select * into v_review from public.client_cycle_reviews
  where cycle_id = v_cycle.id and decision <> 'insufficient_data'
  order by reviewed_at desc limit 1;
  if found and v_cycle.status <> any(array['pending_safety_review','pending_template']::text[]) then
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'already_reviewed'::text, v_review.metrics_snapshot;
    return;
  end if;

  if v_cycle.status = 'pending_safety_review' then
    select * into v_review from public.client_cycle_reviews where cycle_id = v_cycle.id and decision = 'blocked_safety' order by reviewed_at desc limit 1;
    if not found then
      insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
      values (v_cycle.id, 'blocked_safety', coalesce(v_cycle.decision_reason, 'Ciclo bloccato per necessita'' di supervisione professionale.'), 'safety_review_required', 'automatic', now())
      returning * into v_review;

      insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
      select p.id, 'superadmin', 'review_blocked_safety', 'Revisione bloccata per sicurezza',
        'Un ciclo cliente richiede supervisione professionale prima di proseguire.',
        jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id),
        'review_blocked_safety:' || v_cycle.id::text
      from public.profiles p where p.role = 'superadmin'
      on conflict do nothing;
    end if;
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'safety_review_required'::text, v_review.metrics_snapshot;
    return;
  end if;

  if v_cycle.status = 'pending_template' then
    select * into v_review from public.client_cycle_reviews where cycle_id = v_cycle.id and decision = 'pending_template' order by reviewed_at desc limit 1;
    if not found then
      insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
      values (v_cycle.id, 'pending_template', coalesce(v_cycle.decision_reason, 'Nessun modello compatibile disponibile.'), 'already_reviewed', 'automatic', now())
      returning * into v_review;

      insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
      select p.id, 'superadmin', 'review_blocked_no_template', 'Nessun modello compatibile',
        'Il motore automatico non ha trovato un modello compatibile per un cliente.',
        jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id),
        'review_blocked_no_template:' || v_cycle.id::text
      from public.profiles p where p.role = 'superadmin'
      on conflict do nothing;
    end if;
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'already_reviewed'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- ---- STEP 5: nessun coach attivo ------------------------------------
  if not public.client_has_no_active_coach(v_client_id) then
    insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
    values (v_cycle.id, 'manual_review', 'Al cliente e'' stato assegnato un coach: la revisione automatica si arresta qui (il passaggio di gestione al coach e'' fuori perimetro di questo sotto-blocco).', 'coach_assigned', 'automatic', now())
    returning * into v_review;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    select p.id, 'superadmin', 'review_manual_required', 'Revisione manuale richiesta',
      'Un cliente con ciclo automatico in corso ha ora un coach assegnato.',
      jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id),
      'review_manual_required:' || v_cycle.id::text
    from public.profiles p where p.role = 'superadmin'
    on conflict do nothing;

    return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, 'coach_assigned'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- ---- STEP 6: entitlement Client Pro attivo --------------------------
  if not public._has_active_client_pro_entitlement(v_client_id) then
    update public.client_program_cycles
    set status = 'paused_subscription', suspended_at = now(),
        suspended_reason = 'Abbonamento Client Pro non attivo al momento della revisione.'
    where id = v_cycle.id;

    insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
    values (v_cycle.id, 'blocked_subscription', 'Nessun abbonamento Client Pro attivo: revisione sospesa in attesa di ripristino.', 'subscription_required', 'automatic', now())
    returning * into v_review;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    values (v_client_id, 'cliente', 'review_blocked_subscription', 'Programma in pausa',
      'Il tuo abbonamento non risulta attivo: la revisione del ciclo e'' sospesa.',
      jsonb_build_object('cycle_id', v_cycle.id), 'review_blocked_subscription:' || v_cycle.id::text)
    on conflict do nothing;

    return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, 'subscription_required'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- ---- STEP 7: scadenza e presenza del check-in -----------------------
  if v_cycle.review_due_at is null or current_date < v_cycle.review_due_at then
    raise exception 'CYCLE_NOT_DUE: il ciclo non e'' ancora giunto alla data di revisione (%)', v_cycle.review_due_at;
  end if;

  select * into v_checkin from public.client_monthly_checkins
  where cycle_id = v_cycle.id and status in ('submitted','locked')
  order by updated_at desc limit 1;
  if not found then
    raise exception 'CHECKIN_REQUIRED: nessun check-in mensile sottomesso per questo ciclo';
  end if;

  -- ---- STEP 8: sicurezza del check-in ---------------------------------
  if v_checkin.has_pain_or_limitation or v_checkin.requires_professional_supervision then
    update public.client_program_cycles
    set status = 'pending_safety_review', suspended_at = now(),
        suspended_reason = 'Il check-in segnala dolore/limitazione o necessita'' di supervisione professionale.'
    where id = v_cycle.id;

    update public.client_monthly_checkins set locked_at = now() where id = v_checkin.id;

    insert into public.client_cycle_reviews(cycle_id, checkin_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
    values (
      v_cycle.id, v_checkin.id, 'blocked_safety',
      'Il check-in mensile segnala dolore, una limitazione o la necessita'' di un parere professionale: il programma resta invariato in attesa di intervento Superadmin.',
      'safety_review_required', 'automatic', now()
    ) returning * into v_review;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    select p.id, 'superadmin', 'review_blocked_safety', 'Check-in con segnalazione di sicurezza',
      'Un cliente ha segnalato dolore, una limitazione o la necessita'' di supervisione professionale nel check-in mensile.',
      jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id, 'checkin_id', v_checkin.id),
      'review_blocked_safety:' || v_cycle.id::text
    from public.profiles p where p.role = 'superadmin'
    on conflict do nothing;

    return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, 'safety_review_required'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- ---- STEP 9: config attiva + metriche di progresso ------------------
  v_config_version := public._active_review_config_version();
  v_min_completion_ratio := public._review_config_value('min_completion_ratio', v_config_version);
  v_min_sessions := public._review_config_value('min_sessions', v_config_version);
  v_min_exercise_data_ratio := public._review_config_value('min_exercise_data_ratio', v_config_version);
  v_progress_min_completion_ratio := public._review_config_value('progress_min_completion_ratio', v_config_version);
  v_regress_max_completion_ratio := public._review_config_value('regress_max_completion_ratio', v_config_version);
  v_trend_rpe_high := public._review_config_value('trend_rpe_high', v_config_version);
  v_max_load_increase_ratio := public._review_config_value('max_load_increase_ratio', v_config_version);
  v_max_added_sets_per_exercise := public._review_config_value('max_added_sets_per_exercise', v_config_version);
  v_max_exercise_change_ratio := public._review_config_value('max_exercise_change_ratio', v_config_version);

  select m.sessions_expected, m.sessions_completed, m.completion_ratio, m.primary_total, m.primary_evaluable, m.evaluable_ratio
  into v_metrics
  from public._compute_cycle_progress_metrics(v_cycle.id) m;

  -- ---- STEP 10: eleggibilita' numerica (insufficient_data) ------------
  if v_metrics.sessions_completed < v_min_sessions or v_metrics.completion_ratio < v_min_completion_ratio or v_metrics.evaluable_ratio < v_min_exercise_data_ratio then
    v_decision_reason := case
      when v_metrics.sessions_completed < v_min_sessions or v_metrics.completion_ratio < v_min_completion_ratio then
        format('Sessioni completate insufficienti per una valutazione affidabile (%s/%s attese, aderenza %s%%).', v_metrics.sessions_completed, v_metrics.sessions_expected, round(v_metrics.completion_ratio*100))
      else
        format('Dati di carico/RPE insufficienti sugli esercizi principali (%s%% valutabile, minimo richiesto %s%%).', round(v_metrics.evaluable_ratio*100), round(v_min_exercise_data_ratio*100))
    end;

    insert into public.client_cycle_reviews(
      cycle_id, checkin_id, decision, decision_reason, eligibility_result, metrics_snapshot,
      completion_ratio, sessions_planned, sessions_completed, exercises_evaluable_ratio,
      config_version, algorithm_version, origin, reviewed_at
    ) values (
      v_cycle.id, v_checkin.id, 'insufficient_data', v_decision_reason,
      case when v_metrics.sessions_completed < v_min_sessions or v_metrics.completion_ratio < v_min_completion_ratio then 'insufficient_sessions' else 'insufficient_progress_data' end,
      jsonb_build_object('sessions_expected', v_metrics.sessions_expected, 'sessions_completed', v_metrics.sessions_completed, 'completion_ratio', v_metrics.completion_ratio, 'evaluable_ratio', v_metrics.evaluable_ratio),
      v_metrics.completion_ratio, v_metrics.sessions_expected, v_metrics.sessions_completed, v_metrics.evaluable_ratio,
      v_config_version, 1, 'automatic', now()
    ) returning * into v_review;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    values (v_client_id, 'cliente', 'review_insufficient_data', 'Dati insufficienti per la revisione', v_decision_reason,
      jsonb_build_object('cycle_id', v_cycle.id),
      'review_insufficient_data:' || v_cycle.id::text || ':' || current_date::text)
    on conflict do nothing;

    return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, false, v_review.eligibility_result, v_review.metrics_snapshot;
    return;
  end if;

  -- ---- STEP 11: snapshot per-esercizio (trend) ------------------------
  select * into v_template from public.workout_templates where id = v_cycle.template_id;

  for v_ex in
    select
      wde.id as workout_exercise_id, wd.id as workout_day_id, wp.id as workout_plan_id, wde.exercise_id,
      wde.exercise_order, wde.sets, wde.reps, wde.reps_min, wde.reps_max, wde.target_weight,
      wde.rest_seconds, wde.notes, wde.technique_type, wde.superset_group_id, wde.duration_seconds, wde.rpe_rir,
      emm.role, emm.equipment_tag, emm.substitution_group, emm.min_level, emm.compatible_locations,
      stats.first_weight, stats.last_weight, stats.first_reps, stats.last_reps, stats.avg_rpe, stats.n_points, stats.any_pain
    from public.client_program_cycle_plans cpp
    join public.workout_plans wp on wp.id = cpp.workout_plan_id
    join public.workout_days wd on wd.workout_plan_id = wp.id
    join public.workout_day_exercises wde on wde.workout_day_id = wd.id
    join public.exercise_movement_metadata emm on emm.exercise_id = wde.exercise_id
    left join lateral (
      select
        (array_agg(eph.weight_kg order by eph.performed_at asc))[1] as first_weight,
        (array_agg(eph.weight_kg order by eph.performed_at desc))[1] as last_weight,
        (array_agg(eph.reps_completed order by eph.performed_at asc))[1] as first_reps,
        (array_agg(eph.reps_completed order by eph.performed_at desc))[1] as last_reps,
        avg(eph.perceived_effort) as avg_rpe,
        count(*) as n_points,
        bool_or(coalesce(eph.has_pain,false)) as any_pain
      from public.exercise_progress_history eph
      where eph.workout_exercise_id = wde.id
    ) stats on true
    where cpp.cycle_id = v_cycle.id
    order by wd.id, wde.exercise_order
  loop
    if v_ex.any_pain then
      v_trend := 'blocked_safety';
    elsif coalesce(v_ex.n_points,0) = 0 then
      v_trend := 'not_evaluable';
    elsif v_ex.avg_rpe is not null and v_ex.avg_rpe >= v_trend_rpe_high then
      v_trend := 'negative';
    elsif v_ex.last_weight is not null and v_ex.first_weight is not null and v_ex.last_weight < v_ex.first_weight then
      v_trend := 'negative';
    elsif v_ex.last_reps is not null and v_ex.first_reps is not null and v_ex.last_reps < v_ex.first_reps
      and (v_ex.last_weight is null or v_ex.last_weight = v_ex.first_weight) then
      v_trend := 'negative';
    elsif (v_ex.last_weight is not null and v_ex.first_weight is not null and v_ex.last_weight > v_ex.first_weight)
       or (v_ex.last_reps is not null and v_ex.first_reps is not null and v_ex.last_reps > v_ex.first_reps) then
      v_trend := 'positive';
    else
      v_trend := 'stable';
    end if;

    if v_trend = 'blocked_safety' then
      v_pain_exercises := v_pain_exercises + 1;
    end if;
    if v_trend = 'negative' and v_ex.role = 'primary' then
      v_negative_primary := v_negative_primary + 1;
    end if;
    v_total_exercises := v_total_exercises + 1;

    v_all_exercises := v_all_exercises || jsonb_build_array(jsonb_build_object(
      'workout_exercise_id', v_ex.workout_exercise_id, 'workout_day_id', v_ex.workout_day_id, 'workout_plan_id', v_ex.workout_plan_id,
      'exercise_id', v_ex.exercise_id, 'exercise_order', v_ex.exercise_order, 'sets', v_ex.sets, 'reps', v_ex.reps,
      'reps_min', v_ex.reps_min, 'reps_max', v_ex.reps_max, 'target_weight', v_ex.target_weight, 'rest_seconds', v_ex.rest_seconds,
      'notes', v_ex.notes, 'technique_type', v_ex.technique_type, 'superset_group_id', v_ex.superset_group_id,
      'duration_seconds', v_ex.duration_seconds, 'rpe_rir', v_ex.rpe_rir, 'role', v_ex.role, 'equipment_tag', v_ex.equipment_tag,
      'substitution_group', v_ex.substitution_group, 'min_level', v_ex.min_level, 'compatible_locations', to_jsonb(v_ex.compatible_locations),
      'trend', v_trend
    ));
  end loop;

  -- ---- STEP 12: rilevazione cambio strutturale (equipaggiamento/luogo/obiettivo) ----
  v_next_template_id := v_cycle.template_id;
  if v_template.id is not null then
    v_new_location := coalesce(case v_checkin.location when 'gym' then 'Palestra' when 'home' then 'Casa' else null end, v_template.location);
    v_new_goal := coalesce(case v_checkin.goal_changed_to
        when 'Perdere peso' then 'Dimagrimento'
        when 'Costruire muscoli' then 'Massa muscolare'
        when 'Diventare più forte' then 'Forza'
        when 'Migliorare i fondamentali' then 'Principianti'
        when 'Migliorare il condizionamento' then 'Performance'
        when 'Preparazione sportiva' then 'Performance'
        else null
      end, v_template.goal);
    v_structural_change := (v_new_location is distinct from v_template.location) or (v_new_goal is distinct from v_template.goal);

    if v_structural_change then
      v_candidate_template_id := public._match_auto_template(
        v_new_goal, v_template.level, v_new_location,
        coalesce(v_checkin.available_days_per_week, v_template.sessions_per_week, 3),
        coalesce(v_checkin.available_minutes, v_template.estimated_session_minutes, 45),
        v_cycle.template_id
      );
      if v_candidate_template_id is null then
        -- ---- Decisione: pending_template (sezione 14) -----------------
        update public.client_program_cycles set status = 'pending_template' where id = v_cycle.id;

        insert into public.client_cycle_reviews(
          cycle_id, checkin_id, decision, decision_reason, eligibility_result, metrics_snapshot,
          completion_ratio, sessions_planned, sessions_completed, exercises_evaluable_ratio,
          previous_template_id, config_version, algorithm_version, origin, reviewed_at
        ) values (
          v_cycle.id, v_checkin.id, 'pending_template',
          'Il check-in segnala un cambio di luogo/attrezzatura/obiettivo per cui non esiste un modello automatico compatibile: nessun ciclo successivo creato, in attesa di intervento Superadmin.',
          'already_reviewed', jsonb_build_object('exercises', v_all_exercises, 'requested_goal', v_new_goal, 'requested_location', v_new_location),
          v_metrics.completion_ratio, v_metrics.sessions_expected, v_metrics.sessions_completed, v_metrics.evaluable_ratio,
          v_cycle.template_id, v_config_version, 1, 'automatic', now()
        ) returning * into v_review;

        update public.client_monthly_checkins set locked_at = now() where id = v_checkin.id;

        insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
        select p.id, 'superadmin', 'review_blocked_no_template', 'Nessun modello compatibile dopo il check-in',
          'Un cliente ha segnalato un cambio di luogo/attrezzatura/obiettivo per cui il motore automatico non ha trovato un modello compatibile.',
          jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id),
          'review_blocked_no_template:' || v_cycle.id::text
        from public.profiles p where p.role = 'superadmin'
        on conflict do nothing;

        return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, v_review.eligibility_result, v_review.metrics_snapshot;
        return;
      else
        v_next_template_id := v_candidate_template_id;
      end if;
    end if;
  end if;

  -- ---- STEP 13: determinazione decisione (regress/progress/partial_change/maintain) ----
  v_severe_regress := v_metrics.completion_ratio < (v_regress_max_completion_ratio * 0.5);
  v_regress_trigger := v_metrics.completion_ratio <= v_regress_max_completion_ratio
    or not v_checkin.wants_to_continue
    or (v_checkin.available_minutes is not null and v_template.estimated_session_minutes is not null and v_checkin.available_minutes < v_template.estimated_session_minutes * 0.6)
    or (v_checkin.available_days_per_week is not null and v_template.sessions_per_week is not null and v_checkin.available_days_per_week < v_template.sessions_per_week)
    or (v_total_exercises > 0 and v_negative_primary > (v_total_exercises / 2));

  v_progress_trigger := (not v_regress_trigger)
    and v_metrics.completion_ratio >= v_progress_min_completion_ratio
    and v_pain_exercises = 0
    and v_negative_primary = 0;

  if v_regress_trigger then
    v_decision := 'regress';
  elsif v_progress_trigger then
    v_decision := 'progress';
  elsif v_pain_exercises > 0
     or coalesce(array_length(v_checkin.disliked_exercise_ids,1),0) > 0
     or v_next_template_id is distinct from v_cycle.template_id then
    v_decision := 'partial_change';
  else
    v_decision := 'maintain';
  end if;

  -- Regressione severa: se il solo alleggerimento di carico/serie non basta,
  -- si tenta anche un modello di un livello piu' semplice (sezione 12,
  -- "scegliere una variante piu' semplice"), mai sotto Principiante.
  if v_decision = 'regress' and v_severe_regress and v_next_template_id = v_cycle.template_id and v_template.id is not null then
    v_lower_level := case v_template.level when 'Avanzato' then 'Intermedio' when 'Intermedio' then 'Principiante' else null end;
    if v_lower_level is not null then
      v_candidate_template_id := public._match_auto_template(
        v_template.goal, v_lower_level, v_template.location,
        coalesce(v_checkin.available_days_per_week, v_template.sessions_per_week, 3),
        coalesce(v_checkin.available_minutes, v_template.estimated_session_minutes, 45),
        v_cycle.template_id
      );
      if v_candidate_template_id is not null then
        v_next_template_id := v_candidate_template_id;
      end if;
    end if;
  end if;

  v_decision_reason := case v_decision
    when 'regress' then format('Programma semplificato: aderenza %s%% nel ciclo (soglia %s%%) o segnali del check-in indicano un sovraccarico.', round(v_metrics.completion_ratio*100), round(v_regress_max_completion_ratio*100))
    when 'progress' then format('Programma progredito: aderenza %s%% (soglia %s%%), nessun esercizio principale in calo o con dolore.', round(v_metrics.completion_ratio*100), round(v_progress_min_completion_ratio*100))
    when 'partial_change' then 'Sostituzione parziale degli esercizi: dolore, preferenze del check-in o cambio di modello segnalati, aderenza e dati nella norma per il resto.'
    else 'Programma mantenuto: aderenza e dati nella norma, nessuna variazione necessaria.'
  end;

  -- ---- STEP 14: crea la review (id necessario per gli audit) ----------
  insert into public.client_cycle_reviews(
    cycle_id, checkin_id, decision, decision_reason, eligibility_result,
    completion_ratio, sessions_planned, sessions_completed, exercises_evaluable_ratio,
    previous_template_id, next_template_id, config_version, algorithm_version, origin, reviewed_at
  ) values (
    v_cycle.id, v_checkin.id, v_decision, v_decision_reason, 'eligible',
    v_metrics.completion_ratio, v_metrics.sessions_expected, v_metrics.sessions_completed, v_metrics.evaluable_ratio,
    v_cycle.template_id, v_next_template_id, v_config_version, 1, 'automatic', now()
  ) returning id into v_review_id;

  -- ---- STEP 15: crea il ciclo successivo -------------------------------
  insert into public.client_program_cycles(
    client_id, status, cycle_number, previous_cycle_id, source, decision_reason, template_id,
    fitness_profile_snapshot, started_at, review_due_at, created_by, config_version, algorithm_version
  ) values (
    v_client_id, 'active', v_cycle.cycle_number + 1, v_cycle.id,
    case v_decision
      when 'progress' then 'auto_progression'
      when 'regress' then 'auto_regression'
      when 'partial_change' then 'auto_partial_change'
      else 'auto_maintain'
    end,
    v_decision_reason, v_next_template_id, v_cycle.fitness_profile_snapshot, current_date,
    current_date + coalesce(public._review_config_value('nominal_cycle_days', v_config_version), 28)::integer,
    v_client_id, v_config_version, 1
  ) returning id into v_new_cycle_id;

  v_max_replacements := floor(v_total_exercises * v_max_exercise_change_ratio);

  if v_next_template_id is distinct from v_cycle.template_id and v_next_template_id is not null then
    -- ---- STEP 16a: cambio strutturale di modello -----------------------
    -- Mai carry-over di sets/reps da un layout strutturalmente diverso:
    -- piani interamente nuovi dal nuovo modello, stessa logica
    -- dell'assegnazione iniziale (esclusi gli esercizi esclusi dal cliente).
    v_new_plan_ids := public._copy_template_days_to_plans(v_next_template_id, v_client_id, null, 'auto_system');

    delete from public.workout_day_exercises wde
    using public.workout_days wd
    where wde.workout_day_id = wd.id
      and wd.workout_plan_id = any(v_new_plan_ids)
      and wde.exercise_id in (select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active);

    for v_old2 in
      select wde.exercise_id, wde.sets, wde.reps, wde.reps_min, wde.reps_max, wde.target_weight, wde.rest_seconds
      from public.client_program_cycle_plans cpp
      join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
      join public.workout_day_exercises wde on wde.workout_day_id = wd.id
      where cpp.cycle_id = v_cycle.id
    loop
      insert into public.client_cycle_exercise_transitions(client_id, review_id, previous_cycle_id, next_cycle_id, previous_exercise_id, action, reason, previous_parameters, origin)
      values (v_client_id, v_review_id, v_cycle.id, v_new_cycle_id, v_old2.exercise_id, 'removed',
        'Cambio struttura del modello (luogo/attrezzatura/obiettivo aggiornati dal check-in).',
        jsonb_build_object('sets', v_old2.sets,'reps',v_old2.reps,'reps_min',v_old2.reps_min,'reps_max',v_old2.reps_max,'target_weight',v_old2.target_weight,'rest_seconds',v_old2.rest_seconds),
        'automatic');
    end loop;

    for v_new2 in
      select wde.exercise_id, wde.sets, wde.reps, wde.reps_min, wde.reps_max, wde.target_weight, wde.rest_seconds
      from public.workout_days wd
      join public.workout_day_exercises wde on wde.workout_day_id = wd.id
      where wd.workout_plan_id = any(v_new_plan_ids)
    loop
      insert into public.client_cycle_exercise_transitions(client_id, review_id, previous_cycle_id, next_cycle_id, new_exercise_id, action, reason, new_parameters, origin)
      values (v_client_id, v_review_id, v_cycle.id, v_new_cycle_id, v_new2.exercise_id, 'added',
        'Nuovo modello selezionato in base ai nuovi parametri del check-in.',
        jsonb_build_object('sets', v_new2.sets,'reps',v_new2.reps,'reps_min',v_new2.reps_min,'reps_max',v_new2.reps_max,'target_weight',v_new2.target_weight,'rest_seconds',v_new2.rest_seconds),
        'automatic');
      v_replaced_count := v_replaced_count + 1;
    end loop;
  else
    -- ---- STEP 16b: percorso normale — copia 1:1 con eventuali delta ----
    for v_old_plan in
      select wp.* from public.client_program_cycle_plans cpp
      join public.workout_plans wp on wp.id = cpp.workout_plan_id
      where cpp.cycle_id = v_cycle.id
      order by wp.day_label
    loop
      insert into public.workout_plans(coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
      values (null, v_client_id, v_next_template_id, v_old_plan.name, 'active', current_date, current_date + 90, 'todo', v_old_plan.day_label, 'auto_system')
      returning id into v_new_plan_id;

      v_new_plan_ids := array_append(v_new_plan_ids, v_new_plan_id);

      select id into v_old_day_id from public.workout_days where workout_plan_id = v_old_plan.id limit 1;
      insert into public.workout_days(workout_plan_id, day_order) values (v_new_plan_id, 1) returning id into v_new_day_id;

      v_day_map := v_day_map || jsonb_build_object(v_old_day_id::text, v_new_day_id::text);
    end loop;

    for v_item in
      select *
      from jsonb_to_recordset(v_all_exercises) as t(
        workout_exercise_id uuid, workout_day_id uuid, workout_plan_id uuid, exercise_id text,
        exercise_order integer, sets integer, reps integer, reps_min integer, reps_max integer,
        target_weight numeric, rest_seconds integer, notes text, technique_type text,
        superset_group_id text, duration_seconds integer, rpe_rir text, role text, equipment_tag text,
        substitution_group text, min_level text, compatible_locations text[], trend text
      )
      order by
        case when v_decision = 'partial_change' then
          case
            when t.trend = 'blocked_safety' then 4
            when t.exercise_id = any(coalesce(v_checkin.disliked_exercise_ids,'{}'::text[])) then 3
            when t.trend = 'stable' then 2
            when t.role = 'accessory' then 1
            else 0
          end
        else 0 end desc,
        t.workout_day_id, t.exercise_order
    loop
      v_new_day_id := (v_day_map ->> v_item.workout_day_id::text)::uuid;
      v_action := 'kept';
      v_new_exercise_id := v_item.exercise_id;
      v_new_sets := v_item.sets;
      v_new_reps := v_item.reps;
      v_new_weight := v_item.target_weight;
      v_new_rest := v_item.rest_seconds;
      v_reason := null;
      v_candidate := null;

      if v_decision = 'partial_change' and v_replaced_so_far < v_max_replacements and (
           v_item.trend = 'blocked_safety'
           or v_item.exercise_id = any(coalesce(v_checkin.disliked_exercise_ids,'{}'::text[]))
           or v_item.trend = 'stable'
           or v_item.role = 'accessory'
         ) then
        if v_item.role = 'primary' then
          select alt_meta.exercise_id into v_candidate
          from public.exercise_movement_metadata alt_meta
          where alt_meta.substitution_group = v_item.substitution_group
            and alt_meta.exercise_id <> v_item.exercise_id
            and alt_meta.is_active and alt_meta.eligible_for_substitution
            and v_item.compatible_locations && alt_meta.compatible_locations
            and public._exercise_level_ordinal(alt_meta.min_level) <= public._exercise_level_ordinal(v_item.min_level)
            and alt_meta.exercise_id not in (select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active)
            and not exists (select 1 from public.workout_day_exercises where workout_day_id = v_new_day_id and exercise_id = alt_meta.exercise_id)
          order by alt_meta.exercise_id
          limit 1;
        else
          select alt.alternative_exercise_id into v_candidate
          from public.exercise_alternatives alt
          join public.exercise_movement_metadata alt_meta on alt_meta.exercise_id = alt.alternative_exercise_id
          where alt.source_exercise_id = v_item.exercise_id and alt.is_active and alt_meta.is_active
            and alt_meta.exercise_id not in (select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active)
            and not exists (select 1 from public.workout_day_exercises where workout_day_id = v_new_day_id and exercise_id = alt_meta.exercise_id)
          order by alt.priority, alt.alternative_exercise_id
          limit 1;
        end if;

        if v_candidate is not null then
          v_action := 'replaced';
          v_new_exercise_id := v_candidate;
          v_replaced_so_far := v_replaced_so_far + 1;
          v_reason := case
            when v_item.trend = 'blocked_safety' then 'Esercizio sostituito: segnalazione di dolore durante l''esecuzione.'
            when v_item.exercise_id = any(coalesce(v_checkin.disliked_exercise_ids,'{}'::text[])) then 'Esercizio sostituito: indicato come sgradito nel check-in.'
            when v_item.trend = 'stable' then 'Esercizio sostituito: nessun progresso rilevato nel ciclo, cambio per variare lo stimolo.'
            else 'Esercizio sostituito per varieta''.'
          end;
        end if;
      elsif v_decision = 'progress' and v_item.trend in ('positive','stable') then
        if v_item.reps_max is not null and v_item.reps < v_item.reps_max then
          v_new_reps := v_item.reps + 1;
          v_action := 'progressed';
          v_reason := 'Aumento ripetizioni (dato positivo/stabile nel ciclo).';
        elsif v_item.target_weight is not null then
          v_new_weight := public._round_load_increment(v_item.target_weight, v_max_load_increase_ratio, v_item.equipment_tag);
          if v_new_weight is distinct from v_item.target_weight then
            v_action := 'progressed';
            v_reason := 'Aumento carico (max 10% per ciclo).';
          end if;
        elsif v_max_added_sets_per_exercise >= 1 then
          v_new_sets := v_item.sets + 1;
          v_action := 'progressed';
          v_reason := 'Aggiunta di una serie (progressione).';
        elsif v_item.rest_seconds is not null and v_item.rest_seconds > 45 then
          v_new_rest := v_item.rest_seconds - 15;
          v_action := 'progressed';
          v_reason := 'Riduzione controllata del recupero (progressione).';
        end if;
      elsif v_decision = 'regress' and v_item.trend = 'negative' then
        if v_item.target_weight is not null then
          v_delta := public._round_load_increment(v_item.target_weight, v_max_load_increase_ratio, v_item.equipment_tag) - v_item.target_weight;
          if v_delta > 0 then
            v_new_weight := greatest(0, v_item.target_weight - v_delta);
            v_action := 'regressed';
            v_reason := 'Riduzione carico (aderenza/trend negativo nel ciclo).';
          end if;
        elsif v_item.sets > 1 then
          v_new_sets := v_item.sets - 1;
          v_action := 'regressed';
          v_reason := 'Riduzione di una serie (aderenza/trend negativo nel ciclo).';
        elsif v_item.rest_seconds is not null then
          v_new_rest := v_item.rest_seconds + 15;
          v_action := 'regressed';
          v_reason := 'Aumento del recupero (aderenza/trend negativo nel ciclo).';
        end if;
      end if;

      insert into public.workout_day_exercises(
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
      ) values (
        v_new_day_id, v_new_exercise_id, v_item.exercise_order, v_new_sets, v_new_reps, v_item.reps_min, v_item.reps_max,
        v_new_weight, v_new_rest, v_item.notes, v_item.technique_type, v_item.superset_group_id, v_item.duration_seconds, v_item.rpe_rir
      );

      insert into public.client_cycle_exercise_transitions(
        client_id, review_id, previous_cycle_id, next_cycle_id, previous_exercise_id, new_exercise_id, action, reason,
        previous_parameters, new_parameters, origin
      ) values (
        v_client_id, v_review_id, v_cycle.id, v_new_cycle_id, v_item.exercise_id, v_new_exercise_id, v_action,
        coalesce(v_reason, 'Nessuna variazione: aderenza e dati nella norma.'),
        jsonb_build_object('sets',v_item.sets,'reps',v_item.reps,'reps_min',v_item.reps_min,'reps_max',v_item.reps_max,'target_weight',v_item.target_weight,'rest_seconds',v_item.rest_seconds),
        jsonb_build_object('sets',v_new_sets,'reps',v_new_reps,'reps_min',v_item.reps_min,'reps_max',v_item.reps_max,'target_weight',v_new_weight,'rest_seconds',v_new_rest),
        'automatic'
      );

      if v_action = 'kept' then v_kept_count := v_kept_count + 1;
      elsif v_action = 'replaced' then v_replaced_count := v_replaced_count + 1;
      elsif v_action = 'progressed' then v_progressed_count := v_progressed_count + 1;
      elsif v_action = 'regressed' then v_regressed_count := v_regressed_count + 1;
      end if;
    end loop;
  end if;

  insert into public.client_program_cycle_plans(cycle_id, workout_plan_id)
  select v_new_cycle_id, unnest(v_new_plan_ids);

  -- ---- STEP 17: chiudi il ciclo precedente, blocca il check-in, aggiorna la review ----
  update public.client_program_cycles
  set status = case when v_next_template_id is distinct from v_cycle.template_id then 'replaced' else 'completed' end,
      replaced_at = case when v_next_template_id is distinct from v_cycle.template_id then now() else replaced_at end,
      completed_at = case when v_next_template_id is distinct from v_cycle.template_id then completed_at else now() end
  where id = v_cycle.id;

  update public.client_monthly_checkins set status = 'locked', locked_at = now() where id = v_checkin.id;

  update public.client_cycle_reviews
  set next_cycle_id = v_new_cycle_id,
      metrics_snapshot = jsonb_build_object(
        'sessions_expected', v_metrics.sessions_expected, 'sessions_completed', v_metrics.sessions_completed,
        'completion_ratio', v_metrics.completion_ratio, 'evaluable_ratio', v_metrics.evaluable_ratio,
        'exercises', v_all_exercises
      ),
      exercises_kept_count = v_kept_count,
      exercises_replaced_count = v_replaced_count
  where id = v_review_id
  returning * into v_review;

  v_notification_type := case v_decision
    when 'progress' then 'review_progress_applied'
    when 'regress' then 'review_simplified'
    when 'partial_change' then 'review_exercises_replaced'
    else 'review_maintained'
  end;
  v_notification_title := case v_decision
    when 'progress' then 'Il tuo programma e'' progredito'
    when 'regress' then 'Il tuo programma e'' stato semplificato'
    when 'partial_change' then 'Alcuni esercizi sono stati sostituiti'
    else 'Il tuo programma e'' stato confermato'
  end;
  v_notification_body := v_decision_reason;

  insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (v_client_id, 'cliente', v_notification_type, v_notification_title, v_notification_body,
    jsonb_build_object('cycle_id', v_cycle.id, 'next_cycle_id', v_new_cycle_id),
    v_notification_type || ':' || v_cycle.id::text)
  on conflict do nothing;

  return query select v_review.decision, v_cycle.id, v_new_cycle_id, v_review.decision_reason, false, 'eligible'::text, v_review.metrics_snapshot;
end;
$function$;

revoke all on function public.run_cycle_review(uuid) from public;
grant execute on function public.run_cycle_review(uuid) to authenticated;

notify pgrst, 'reload schema';
