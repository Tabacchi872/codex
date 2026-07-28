-- fix: assegnazione programma automatico — priorita' giorni/settimana nel
-- matching + occorrenze ripetute del ciclo di 28 giorni (A-B-C ripetute per
-- 4 settimane), senza duplicare le schede.
--
-- CONTESTO (test reale segnalato dall'utente): nuovo cliente senza coach,
-- Client Pro attivo, questionario compilato -> nessuna scheda in Workout.
-- Riprodotto dal vivo con un account sintetico (mai un account reale
-- toccato): l'intera catena (webhook->user_subscriptions->questionario->
-- assign_initial_auto_program->client_program_cycles->client_program_cycle_
-- plans->workout_plans/workout_days/workout_day_exercises->RLS lettura
-- cliente) funziona ed e' gia' stata verificata in sessioni precedenti.
--
-- BUG REALE TROVATO in questa sessione (non nella catena sopra, che
-- funziona): _match_auto_template filtra per goal+livello+luogo e SOLO POI
-- ordina per vicinanza ai giorni/settimana. Se per un dato goal esiste UN
-- SOLO template compatibile a quel livello/luogo, quello viene scelto anche
-- se il suo sessions_per_week e' molto lontano da quello richiesto (provato
-- dal vivo: goal "Massa muscolare" + Intermedio + Palestra + 3 giorni/sett. ->
-- assegnato "Upper/Lower Ipertrofia", 4 giorni/settimana, perche' e' l'unico
-- template per quel goal a quel livello/luogo — esistono pero' 3 template a
-- 3 giorni/settimana per QUALSIASI ALTRO goal alla stessa combinazione
-- livello/luogo, mai considerati perche' la ricerca si fermava al primo
-- stadio). Corretto anteponendo due nuovi stadi "giorni esatti" (con e senza
-- vincolo di goal) PRIMA della cascata esistente a 4 stadi, che resta
-- invariata come fallback finale quando nessun template a quel livello/
-- luogo copre esattamente i giorni richiesti.
--
-- GAP ARCHITETTURALE (confermato in questa sessione, non un bug di codice
-- esistente: la funzionalita' non e' mai stata costruita): oggi ogni scheda
-- (workout_plans, es. "Upper A") puo' essere completata UNA SOLA VOLTA per
-- sempre (session_status='completed' blocca per sempre via
-- exercise_progress_entry_writable/il trigger di immutabilita', voluto fin
-- da BUG-003 per proteggere lo storico coach-guided — MAI toccato qui).
-- Per "A-B-C ripetute per 4 settimane = 12 sessioni" senza creare 12 copie
-- delle schede, introduciamo client_program_cycle_sessions: una riga per
-- ogni occorrenza pianificata (12 per un ciclo a 3gg/4 settimane), che
-- referenzia la scheda A/B/C corrispondente (mai duplicata) e porta il
-- proprio stato/date indipendente. Le 3(N) schede restano esattamente come
-- oggi (struttura esercizi, mai piu' di N righe workout_plans per ciclo);
-- session_status su workout_plans per un piano tracciato a occorrenze non
-- viene piu' portato a 'completed' dal nuovo percorso (resta 'todo': il
-- vecchio trigger/RPC restano quindi invariati e continuano a funzionare
-- esattamente come prima per il percorso coach-guided, che non usa mai
-- occorrenze). Storico serie/carichi/RPE/note resta su
-- exercise_progress_history (gia' esistente, gia' separato per timestamp):
-- aggiunta solo una colonna opzionale cycle_session_id per un collegamento
-- esplicito, non piu' basato sulla vicinanza temporale.

-- ============================================================================
-- PARTE A — Fix priorita' matching: giorni/settimana prima del goal
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
  -- Stage 0: match esatto goal+level+location+giorni esatti.
  select id into v_template_id
  from public.workout_templates
  where is_system and is_active and auto_eligible
    and goal = p_goal and level = p_level and location = p_location
    and sessions_per_week = p_days
    and (p_exclude_template_id is null or id <> p_exclude_template_id)
  order by abs(coalesce(estimated_session_minutes, p_duration) - p_duration), sort_order
  limit 1;

  -- Stage 0.5: stessa location+level, giorni esatti, qualunque goal — i
  -- giorni scelti dal cliente hanno priorita' sul goal quando esiste
  -- un'alternativa compatibile: preferibile un goal diverso con i giorni
  -- giusti piuttosto che il goal esatto con un numero di giorni sbagliato.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and level = p_level and location = p_location
      and sessions_per_week = p_days
      and (p_exclude_template_id is null or id <> p_exclude_template_id)
    order by abs(coalesce(estimated_session_minutes, p_duration) - p_duration), sort_order
    limit 1;
  end if;

  -- Stage 1 (fallback, invariato): nessun template a quel livello/luogo
  -- copre esattamente i giorni richiesti — match esatto goal+level+location,
  -- giorni piu' vicini possibile.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and goal = p_goal and level = p_level and location = p_location
      and (p_exclude_template_id is null or id <> p_exclude_template_id)
    order by abs(coalesce(sessions_per_week, p_days) - p_days),
             abs(coalesce(estimated_session_minutes, p_duration) - p_duration),
             sort_order
    limit 1;
  end if;

  -- Stage 2: stessa location+level, qualunque goal, giorni piu' vicini.
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

-- ============================================================================
-- PARTE B — Nuova tabella: occorrenze pianificate del ciclo
-- ============================================================================
create table if not exists public.client_program_cycle_sessions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.client_program_cycles(id) on delete cascade,
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  occurrence_number integer not null check (occurrence_number > 0),
  week_number integer not null check (week_number > 0),
  day_label text not null,
  scheduled_date date,
  status text not null default 'todo' check (status in ('todo', 'completed', 'skipped', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  completed_exercise_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, occurrence_number)
);

create index if not exists client_program_cycle_sessions_cycle_idx on public.client_program_cycle_sessions(cycle_id);
create index if not exists client_program_cycle_sessions_plan_idx on public.client_program_cycle_sessions(workout_plan_id);

drop trigger if exists client_program_cycle_sessions_set_updated_at on public.client_program_cycle_sessions;
create trigger client_program_cycle_sessions_set_updated_at before update on public.client_program_cycle_sessions
for each row execute function public.set_updated_at();

alter table public.client_program_cycle_sessions enable row level security;

-- Stesso pattern gia' usato da client_program_cycle_plans: nessun insert/
-- update/delete diretto per il cliente, solo lettura; tutte le scritture
-- passano dalle RPC qui sotto (security definer).
drop policy if exists client_program_cycle_sessions_superadmin_all on public.client_program_cycle_sessions;
create policy client_program_cycle_sessions_superadmin_all on public.client_program_cycle_sessions
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_program_cycle_sessions_owner_read on public.client_program_cycle_sessions;
create policy client_program_cycle_sessions_owner_read on public.client_program_cycle_sessions
  for select using (
    exists (
      select 1 from public.client_program_cycles
      where client_program_cycles.id = client_program_cycle_sessions.cycle_id
        and client_program_cycles.client_id = auth.uid()
    )
  );

-- ============================================================================
-- PARTE C — exercise_progress_history: collegamento esplicito all'occorrenza
-- ============================================================================
-- Additiva, nullable: le righe esistenti (create prima di questa migration,
-- quando le occorrenze non esistevano) restano valide con cycle_session_id
-- null, distinguibili solo per timestamp come prima. Da qui in avanti il
-- logging self-guided su un piano tracciato a occorrenze valorizza sempre
-- questa colonna, dando uno storico per-sessione esplicito invece che
-- basato sulla vicinanza temporale.
alter table public.exercise_progress_history
  add column if not exists cycle_session_id uuid references public.client_program_cycle_sessions(id) on delete set null;

create index if not exists exercise_progress_cycle_session_idx
  on public.exercise_progress_history(cycle_session_id);

-- ============================================================================
-- PARTE D — Helper: genera le occorrenze di un ciclo dai suoi plan_ids
-- ============================================================================
-- Sempre 4 settimane (coerente con review_due_at = started_at + 28, gia'
-- esistente): occurrence_number = (settimana-1)*N + indice_giorno, dove N e'
-- il numero di schede (giorni/settimana). Nessuna nuova riga workout_plans:
-- ogni occorrenza referenzia una delle N schede gia' esistenti, mai una
-- copia. scheduled_date e' una stima informativa (distribuzione uniforme
-- nella settimana): nessuna preferenza di giorno della settimana e' oggi
-- raccolta dal questionario, quindi non e' un impegno vincolante, solo un
-- ordinamento cronologico ragionevole per la UI.
create or replace function public._generate_cycle_sessions(
  p_cycle_id uuid,
  p_plan_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_started_at date;
  v_count integer := coalesce(array_length(p_plan_ids, 1), 0);
  v_weeks constant integer := 4;
  v_week integer;
  v_day_index integer;
  v_occurrence integer;
  v_plan_id uuid;
  v_day_label text;
  v_scheduled_date date;
begin
  if v_count = 0 then
    return;
  end if;

  select started_at into v_started_at from public.client_program_cycles where id = p_cycle_id;
  if v_started_at is null then
    v_started_at := current_date;
  end if;

  for v_week in 1..v_weeks loop
    for v_day_index in 1..v_count loop
      v_occurrence := (v_week - 1) * v_count + v_day_index;
      v_plan_id := p_plan_ids[v_day_index];
      select day_label into v_day_label from public.workout_plans where id = v_plan_id;
      v_scheduled_date := v_started_at + (v_week - 1) * 7 + floor((v_day_index - 1) * 7.0 / v_count)::integer;

      insert into public.client_program_cycle_sessions (
        cycle_id, workout_plan_id, occurrence_number, week_number, day_label, scheduled_date
      ) values (
        p_cycle_id, v_plan_id, v_occurrence, v_week, coalesce(v_day_label, 'Workout'), v_scheduled_date
      )
      on conflict (cycle_id, occurrence_number) do nothing;
    end loop;
  end loop;
end;
$function$;

revoke all on function public._generate_cycle_sessions(uuid, uuid[]) from public, anon, authenticated;

-- ============================================================================
-- PARTE E — assign_initial_auto_program: genera le occorrenze dopo la
-- creazione del ciclo iniziale (unico punto di successo reale, status='active')
-- ============================================================================
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

  perform public._generate_cycle_sessions(v_cycle_id, v_final_plan_ids);

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (v_client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma è pronto', v_decision_reason,
    jsonb_build_object('cycle_id', v_cycle_id, 'template_id', v_template_id),
    'auto_program_assigned:' || v_cycle_id::text);

  return v_cycle_id;
end;
$function$;

-- ============================================================================
-- PARTE F — run_cycle_review: genera le occorrenze anche per il ciclo
-- successivo (stesso hook, subito dopo l'insert di client_program_cycle_plans)
-- ============================================================================
create or replace function public.run_cycle_review(p_cycle_id uuid default null::uuid)
 returns table(decision text, cycle_id uuid, next_cycle_id uuid, decision_reason text, blocked boolean, result_code text, metrics jsonb)
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
  v_swap_pid uuid;
  v_swap_remaining integer;
  v_swap_kept_ids uuid[];
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
    where client_cycle_reviews.cycle_id = v_cycle.id and client_cycle_reviews.decision <> 'insufficient_data'
    order by reviewed_at desc limit 1;
    if not found then
      raise exception 'INTERNAL_INCONSISTENCY: ciclo % in stato terminale senza review definitiva', v_cycle.id;
    end if;
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'already_reviewed'::text, v_review.metrics_snapshot;
    return;
  end if;

  -- FIX (questa migration): 'blocked_safety' esclusa qui anche lei — le tre
  -- (insufficient_data, blocked_subscription, blocked_safety) sono blocchi
  -- temporanei/retriable, mai una decisione definitiva sul programma.
  select * into v_review from public.client_cycle_reviews
  where client_cycle_reviews.cycle_id = v_cycle.id
    and client_cycle_reviews.decision <> all(array['insufficient_data','blocked_subscription','blocked_safety']::text[])
    and not exists (
      select 1 from public.client_program_cycles nc
      where nc.id = client_cycle_reviews.next_cycle_id and nc.status = 'cancelled'
    )
  order by reviewed_at desc limit 1;
  -- 'paused_subscription' esce da questo short-circuit, esattamente come
  -- 'pending_safety_review'/'pending_template' — non e' un esito definitivo,
  -- l'entitlement va ricontrollato ad ogni chiamata (puo' cambiare in
  -- autonomia al rinnovo, a differenza degli altri due che aspettano sempre
  -- un intervento umano). FIX (questa migration): `<> all`, non `<> any`
  -- (vedi commento in testa al file).
  if found and v_cycle.status <> all(array['pending_safety_review','pending_template','paused_subscription']::text[]) then
    return query select v_review.decision, v_cycle.id, v_review.next_cycle_id, v_review.decision_reason, true, 'already_reviewed'::text, v_review.metrics_snapshot;
    return;
  end if;

  if v_cycle.status = 'pending_safety_review' then
    select * into v_review from public.client_cycle_reviews where client_cycle_reviews.cycle_id = v_cycle.id and client_cycle_reviews.decision = 'blocked_safety' order by reviewed_at desc limit 1;
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
    select * into v_review from public.client_cycle_reviews where client_cycle_reviews.cycle_id = v_cycle.id and client_cycle_reviews.decision = 'pending_template' order by reviewed_at desc limit 1;
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
    -- FIX (questa migration): se il ciclo e' gia' in pausa per lo stesso
    -- motivo (nessuna riattivazione nel frattempo), non reinserire una
    -- nuova review 'blocked_subscription' ad ogni chiamata di retry —
    -- stesso principio "if not found, insert" usato altrove nella funzione.
    if v_cycle.status = 'paused_subscription' then
      select * into v_review from public.client_cycle_reviews
      where client_cycle_reviews.cycle_id = v_cycle.id and client_cycle_reviews.decision = 'blocked_subscription'
      order by reviewed_at desc limit 1;
      if found then
        return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, 'subscription_required'::text, v_review.metrics_snapshot;
        return;
      end if;
    end if;

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

  -- FIX (questa migration): l'entitlement e' di nuovo attivo. Se il ciclo
  -- proveniva da 'paused_subscription', il ripristino va committato e
  -- restituito SUBITO (vedi commento in testa al file: proseguire nella
  -- stessa chiamata fino a un eventuale 'raise exception' piu' sotto
  -- annullerebbe anche questo UPDATE). Nessuna riga di review inserita:
  -- non e' una decisione sul programma, e' un ripristino di stato — il
  -- chiamante rifara' la chiamata (dopo un check-in se necessario).
  if v_cycle.status = 'paused_subscription' then
    update public.client_program_cycles set status = 'active', resumed_at = now() where id = v_cycle.id;
    return query select 'resumed'::text, v_cycle.id, null::uuid,
      'Abbonamento riattivato: il ciclo e'' stato ripristinato. Se necessario, invia un nuovo check-in per la prossima revisione.'::text,
      false, 'resumed'::text, null::jsonb;
    return;
  end if;

  -- ---- STEP 7: scadenza e presenza del check-in -----------------------
  if v_cycle.review_due_at is null or current_date < v_cycle.review_due_at then
    raise exception 'CYCLE_NOT_DUE: il ciclo non e'' ancora giunto alla data di revisione (%)', v_cycle.review_due_at;
  end if;

  select * into v_checkin from public.client_monthly_checkins
  where client_monthly_checkins.cycle_id = v_cycle.id and status in ('submitted','locked')
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
    select * into v_review from public.client_cycle_reviews
    where client_cycle_reviews.cycle_id = v_cycle.id
      and client_cycle_reviews.checkin_id = v_checkin.id
      and client_cycle_reviews.decision = 'insufficient_data'
    order by reviewed_at desc limit 1;
    if found then
      return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, false, v_review.eligibility_result, v_review.metrics_snapshot;
      return;
    end if;

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

  -- ---- STEP 14.5: chiudi ORA il ciclo precedente (spostato prima della
  -- creazione del nuovo ciclo: lo stato finale e' gia' interamente noto, e
  -- l'indice unico "un solo ciclo corrente per cliente" impedirebbe
  -- altrimenti due cicli 'active' simultanei per lo stesso client_id) -----
  update public.client_program_cycles
  set status = case when v_next_template_id is distinct from v_cycle.template_id then 'replaced' else 'completed' end,
      replaced_at = case when v_next_template_id is distinct from v_cycle.template_id then now() else replaced_at end,
      completed_at = case when v_next_template_id is distinct from v_cycle.template_id then completed_at else now() end
  where id = v_cycle.id;

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
    v_new_plan_ids := public._copy_template_days_to_plans(v_next_template_id, v_client_id, null, 'auto_system');

    delete from public.workout_day_exercises wde
    using public.workout_days wd
    where wde.workout_day_id = wd.id
      and wd.workout_plan_id = any(v_new_plan_ids)
      and wde.exercise_id in (select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active);

    v_swap_kept_ids := '{}';
    foreach v_swap_pid in array v_new_plan_ids loop
      select count(*) into v_swap_remaining
      from public.workout_day_exercises wde
      join public.workout_days wd on wd.id = wde.workout_day_id
      where wd.workout_plan_id = v_swap_pid;
      if v_swap_remaining = 0 then
        delete from public.workout_plans where id = v_swap_pid;
      else
        v_swap_kept_ids := array_append(v_swap_kept_ids, v_swap_pid);
      end if;
    end loop;
    v_new_plan_ids := v_swap_kept_ids;

    if array_length(v_new_plan_ids, 1) is null then
      delete from public.client_program_cycles where id = v_new_cycle_id;

      update public.client_program_cycles
      set status = 'pending_template', replaced_at = null, completed_at = null
      where id = v_cycle.id;

      update public.client_cycle_reviews
      set decision = 'pending_template',
          decision_reason = 'Il nuovo modello compatibile con il check-in è risultato interamente incompatibile con gli esercizi esclusi dal cliente: nessun ciclo successivo creato, in attesa di intervento Superadmin.',
          eligibility_result = 'already_reviewed',
          next_template_id = null,
          metrics_snapshot = jsonb_build_object(
            'exercises', v_all_exercises,
            'attempted_next_template_id', v_next_template_id,
            'requested_goal', v_new_goal,
            'requested_location', v_new_location,
            'excluded_exercise_ids', (
              select coalesce(jsonb_agg(exercise_id), '[]'::jsonb)
              from public.client_excluded_exercises
              where client_id = v_client_id and active
            )
          )
      where id = v_review_id
      returning * into v_review;

      update public.client_monthly_checkins set status = 'locked', locked_at = now() where id = v_checkin.id;

      insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
      select p.id, 'superadmin', 'review_blocked_no_template', 'Nessun modello compatibile dopo esclusioni',
        'Il nuovo modello selezionato dopo il check-in è risultato vuoto dopo aver rimosso gli esercizi esclusi dal cliente.',
        jsonb_build_object('cycle_id', v_cycle.id, 'client_id', v_client_id),
        'review_blocked_no_template:' || v_cycle.id::text
      from public.profiles p where p.role = 'superadmin'
      on conflict do nothing;

      return query select v_review.decision, v_cycle.id, null::uuid, v_review.decision_reason, true, v_review.eligibility_result, v_review.metrics_snapshot;
      return;
    end if;

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

  perform public._generate_cycle_sessions(v_new_cycle_id, v_new_plan_ids);

  -- ---- STEP 17: blocca il check-in e completa la review ----------------
  -- (il ciclo precedente e' gia' stato chiuso allo STEP 14.5)
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

-- ============================================================================
-- PARTE G — RPC: avvia/completa un'occorrenza pianificata del ciclo
-- ============================================================================
-- Stessa forma di update_workout_session_progress, ma opera su
-- client_program_cycle_sessions invece che su workout_plans: ogni occorrenza
-- si blocca UNA VOLTA sola (stesso codice WORKOUT_LOCKED), ma le altre
-- occorrenze della stessa scheda (settimane successive) restano scrivibili
-- perche' sono righe indipendenti. Nessun parametro client_id/cycle_id: il
-- possesso si verifica sempre tramite client_program_cycles.client_id =
-- auth.uid(), mai dichiarato dal chiamante.
create or replace function public.update_program_cycle_session_progress(
  p_session_id uuid,
  p_status text default null,
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
as $function$
declare
  v_client_id uuid;
  v_session public.client_program_cycle_sessions%rowtype;
  v_cycle_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  v_client_id := auth.uid();

  if p_status is not null and p_status not in ('todo', 'completed', 'skipped', 'cancelled') then
    raise exception 'INVALID_PAYLOAD: stato sessione non valido';
  end if;

  select * into v_session from public.client_program_cycle_sessions where id = p_session_id;
  if not found then
    raise exception 'NOT_FOUND: occorrenza non trovata';
  end if;

  select client_id into v_cycle_client_id from public.client_program_cycles where id = v_session.cycle_id;
  if v_cycle_client_id is null or v_cycle_client_id <> v_client_id then
    raise exception 'FORBIDDEN: non autorizzato su questa occorrenza';
  end if;

  if v_session.status = 'completed' then
    raise exception 'WORKOUT_LOCKED: occorrenza gia'' completata, non modificabile';
  end if;

  update public.client_program_cycle_sessions set
    status = coalesce(p_status, status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds),
    completed_exercise_ids = coalesce(p_completed_exercise_ids, completed_exercise_ids)
  where id = p_session_id;
end;
$function$;

revoke all on function public.update_program_cycle_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_program_cycle_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

-- ============================================================================
-- PARTE H — log_self_guided_exercise_progress: collegamento opzionale
-- all'occorrenza (p_cycle_session_id), per uno storico esplicito per-sessione
-- ============================================================================
-- Retrocompatibile: se p_cycle_session_id e' null (piani gia' esistenti prima
-- di questa migration, o percorsi che non usano occorrenze), il comportamento
-- resta IDENTICO a prima — controllo di blocco a livello di piano tramite
-- exercise_progress_entry_writable, come gia' oggi. Se invece e' valorizzato,
-- il blocco si verifica a livello di SINGOLA occorrenza (puo' essere
-- riscritta finche' quella specifica occorrenza non e' 'completed', anche se
-- la scheda in se' e' gia' stata completata in un'altra settimana).
drop function if exists public.log_self_guided_exercise_progress(uuid, uuid, text, jsonb);

create function public.log_self_guided_exercise_progress(
  p_workout_plan_id uuid,
  p_workout_exercise_id uuid,
  p_exercise_id text,
  p_entries jsonb,
  p_cycle_session_id uuid default null
)
returns setof public.exercise_progress_history
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_cycle_status text;
  v_valid_exercise boolean;
  v_entry jsonb;
  v_set_number integer;
  v_reps integer;
  v_weight numeric;
  v_inserted public.exercise_progress_history%rowtype;
  v_session public.client_program_cycle_sessions%rowtype;
  v_session_cycle_client_id uuid;
begin
  if v_client_id is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' registrare i propri progressi';
  end if;
  if not public.client_has_no_active_coach(v_client_id) then
    raise exception 'FORBIDDEN: percorso riservato ai clienti senza coach';
  end if;
  if not public._has_active_client_pro_entitlement(v_client_id) then
    raise exception 'SUBSCRIPTION_REQUIRED: nessun piano Client Pro attivo';
  end if;

  select * into v_plan from public.workout_plans where id = p_workout_plan_id;
  if not found or v_plan.client_id <> v_client_id then
    raise exception 'INVALID_SESSION: scheda non trovata o non tua';
  end if;
  if v_plan.coach_id is not null or v_plan.origin not in ('auto_system', 'superadmin_override') then
    raise exception 'INVALID_SESSION: questa scheda non appartiene al percorso automatico';
  end if;

  select cpc.status into v_cycle_status
  from public.client_program_cycle_plans cpp
  join public.client_program_cycles cpc on cpc.id = cpp.cycle_id
  where cpp.workout_plan_id = p_workout_plan_id;

  if v_cycle_status is null or v_cycle_status in ('draft', 'completed', 'superseded') then
    raise exception 'NO_ACTIVE_PROGRAM: nessun ciclo automatico attivo collegato a questa scheda';
  end if;
  if v_cycle_status in ('suspended', 'pending_review') then
    raise exception 'PROGRAM_PAUSED: il programma e'' in attesa di revisione o sospeso';
  end if;

  select exists (
    select 1 from public.workout_day_exercises wde
    join public.workout_days wd on wd.id = wde.workout_day_id
    where wde.id = p_workout_exercise_id
      and wd.workout_plan_id = p_workout_plan_id
      and wde.exercise_id = p_exercise_id
  ) into v_valid_exercise;
  if not v_valid_exercise then
    raise exception 'INVALID_EXERCISE: esercizio non appartenente a questa scheda';
  end if;

  if p_cycle_session_id is not null then
    select * into v_session from public.client_program_cycle_sessions where id = p_cycle_session_id;
    if not found or v_session.workout_plan_id <> p_workout_plan_id then
      raise exception 'INVALID_SESSION: occorrenza non trovata o non collegata a questa scheda';
    end if;
    select client_id into v_session_cycle_client_id from public.client_program_cycles where id = v_session.cycle_id;
    if v_session_cycle_client_id is null or v_session_cycle_client_id <> v_client_id then
      raise exception 'INVALID_SESSION: occorrenza non tua';
    end if;
    if v_session.status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questa occorrenza e'' gia'' completata e non puo'' essere modificata';
    end if;
  else
    -- Nessuna occorrenza indicata: stesso controllo di blocco gia' esistente
    -- a livello di piano, per retrocompatibilita' con i percorsi che non
    -- usano ancora client_program_cycle_sessions.
    if not public.exercise_progress_entry_writable(p_workout_plan_id, p_workout_exercise_id) then
      raise exception 'WORKOUT_LOCKED: questo workout o questo esercizio e'' gia'' completato e non puo'' essere modificato';
    end if;
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'INVALID_PAYLOAD: nessuna serie da salvare';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_set_number := nullif(v_entry->>'set_number', '')::integer;
    v_reps := nullif(v_entry->>'reps_completed', '')::integer;
    v_weight := nullif(v_entry->>'weight_kg', '')::numeric;
    if v_set_number is null or v_set_number <= 0 or v_reps is null or v_reps <= 0 or v_weight is null or v_weight <= 0 then
      raise exception 'INVALID_PAYLOAD: serie non valida (peso/ripetizioni mancanti o non positivi)';
    end if;

    insert into public.exercise_progress_history (
      client_id, coach_id, exercise_id, workout_plan_id, workout_exercise_id,
      performed_at, session_date, set_number, reps_completed, weight_kg,
      rest_seconds, notes, perceived_effort, created_by, created_by_role, cycle_session_id
    ) values (
      v_client_id, null, p_exercise_id, p_workout_plan_id, p_workout_exercise_id,
      coalesce(nullif(v_entry->>'performed_at', '')::timestamptz, now()),
      coalesce(nullif(v_entry->>'session_date', '')::date, current_date),
      v_set_number, v_reps, v_weight,
      nullif(v_entry->>'rest_seconds', '')::integer,
      nullif(v_entry->>'notes', ''),
      nullif(v_entry->>'perceived_effort', '')::numeric,
      v_client_id, 'client', p_cycle_session_id
    )
    returning * into v_inserted;

    return next v_inserted;
  end loop;

  return;
end;
$$;

revoke all on function public.log_self_guided_exercise_progress(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.log_self_guided_exercise_progress(uuid, uuid, text, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';

