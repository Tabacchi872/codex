-- feat: RPC per questionario fitness iniziale + assegnazione automatica prima scheda.
--
-- Dipende dallo schema creato in 20260730090000_auto_program_schema_core.sql.
-- Nessuna RPC qui puo' mai toccare una scheda creata da un coach: tutte
-- verificano client_has_no_active_coach() prima di agire, e le schede
-- automatiche sono sempre origin='auto_system'/coach_id null.

-- ============================================================================
-- 1) save_initial_fitness_profile — upsert questionario, client_id sempre da
-- auth.uid() (mai dal payload)
-- ============================================================================
create or replace function public.save_initial_fitness_profile(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_profile_id uuid;
  v_age integer;
  v_location text;
  v_equipment_level text;
  v_duration integer;
  v_style text;
  v_has_pain boolean;
  v_pain_areas text[];
  v_pain_notes text;
  v_requires_supervision boolean;
  v_completed boolean;
  v_exercise_id text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  v_client_id := auth.uid();
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' salvare il proprio questionario fitness';
  end if;

  v_age := nullif(payload->>'age', '')::integer;
  v_location := nullif(payload->>'location', '');
  v_equipment_level := nullif(payload->>'equipment_level', '');
  v_duration := nullif(payload->>'session_duration_minutes', '')::integer;
  v_style := nullif(payload->>'preferred_training_style', '');
  v_has_pain := coalesce((payload->>'has_pain_or_limitation')::boolean, false);
  v_pain_notes := nullif(payload->>'pain_notes', '');
  v_requires_supervision := coalesce((payload->>'requires_professional_supervision')::boolean, false);

  select coalesce(array_agg(elem), '{}'::text[]) into v_pain_areas
  from jsonb_array_elements_text(coalesce(payload->'pain_areas', '[]'::jsonb)) as elem;

  if v_location is not null and v_location not in ('gym', 'home') then
    raise exception 'INVALID_PAYLOAD: luogo non valido';
  end if;
  if v_equipment_level is not null and v_equipment_level not in ('bodyweight_only', 'home_basic', 'full_gym') then
    raise exception 'INVALID_PAYLOAD: attrezzatura non valida';
  end if;
  if v_style is not null and v_style not in ('full_body', 'upper_lower', 'split', 'hybrid', 'no_preference') then
    raise exception 'INVALID_PAYLOAD: stile di allenamento non valido';
  end if;

  v_completed := v_age is not null and v_location is not null and v_duration is not null and v_style is not null;

  insert into public.client_fitness_profile (
    client_id, age, location, equipment_level, session_duration_minutes,
    preferred_training_style, has_pain_or_limitation, pain_areas, pain_notes,
    requires_professional_supervision, completed, completed_at
  ) values (
    v_client_id, v_age, v_location, v_equipment_level, v_duration,
    v_style, v_has_pain, v_pain_areas, v_pain_notes,
    v_requires_supervision, v_completed, case when v_completed then now() else null end
  )
  on conflict (client_id) do update set
    age = excluded.age,
    location = excluded.location,
    equipment_level = excluded.equipment_level,
    session_duration_minutes = excluded.session_duration_minutes,
    preferred_training_style = excluded.preferred_training_style,
    has_pain_or_limitation = excluded.has_pain_or_limitation,
    pain_areas = excluded.pain_areas,
    pain_notes = excluded.pain_notes,
    requires_professional_supervision = excluded.requires_professional_supervision,
    completed = client_fitness_profile.completed or excluded.completed,
    completed_at = coalesce(client_fitness_profile.completed_at, excluded.completed_at)
  returning id into v_profile_id;

  for v_exercise_id in
    select elem from jsonb_array_elements_text(coalesce(payload->'excluded_exercise_ids', '[]'::jsonb)) as elem
  loop
    insert into public.client_excluded_exercises (client_id, exercise_id, reason, active)
    values (v_client_id, v_exercise_id, 'dislike', true)
    on conflict (client_id, exercise_id) do update set active = true, reason = 'dislike', updated_at = now();
  end loop;

  return v_profile_id;
end;
$$;

revoke all on function public.save_initial_fitness_profile(jsonb) from public, anon;
grant execute on function public.save_initial_fitness_profile(jsonb) to authenticated;

-- ============================================================================
-- 2) Funzione interna condivisa: copia i giorni di un modello in schede reali
-- ============================================================================
-- Estratta dal corpo di assign_workout_template_to_client (20260723090000),
-- parametrizzata su coach_id/origin invece che su auth.uid() hardcoded.
-- Nessun controllo di autorizzazione qui dentro: chi chiama (assign_workout_
-- template_to_client, assign_initial_auto_program, superadmin_assign_
-- program_template) ha gia' verificato ownership/idoneita' PRIMA di
-- invocarla. Mai chiamabile direttamente da un client.
create or replace function public._copy_template_days_to_plans(
  p_template_id uuid,
  p_client_id uuid,
  p_coach_id uuid,
  p_origin text
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_name text;
  v_plan_id uuid;
  v_day_id uuid;
  v_plan_ids uuid[] := '{}';
  v_template_day record;
  v_start_date date := current_date;
  v_expiry_date date := current_date + interval '90 days';
  v_status text;
begin
  select name into v_template_name from public.workout_templates where id = p_template_id;
  if v_template_name is null then
    raise exception 'NOT_FOUND: scheda modello non trovata';
  end if;

  if not exists (select 1 from public.workout_template_days where template_id = p_template_id) then
    raise exception 'INVALID_PAYLOAD: il modello non ha alcun giorno da assegnare';
  end if;

  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  for v_template_day in
    select id, name from public.workout_template_days where template_id = p_template_id order by sort_order, created_at
  loop
    insert into public.workout_plans (coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
    values (p_coach_id, p_client_id, p_template_id, v_template_name || ' — ' || v_template_day.name, v_status, v_start_date, v_expiry_date, 'todo', v_template_day.name, p_origin)
    returning id into v_plan_id;

    insert into public.workout_days (workout_plan_id, day_order) values (v_plan_id, 1) returning id into v_day_id;

    insert into public.workout_day_exercises (
      workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
    )
    select v_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
    from public.workout_template_exercises
    where template_day_id = v_template_day.id
    order by exercise_order;

    v_plan_ids := array_append(v_plan_ids, v_plan_id);
  end loop;

  return v_plan_ids;
end;
$$;

revoke all on function public._copy_template_days_to_plans(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ============================================================================
-- 3) assign_workout_template_to_client — rifattorizzata, STESSA firma e
-- STESSO comportamento osservabile (nessuna verifica rimossa/aggiunta)
-- ============================================================================
drop function if exists public.assign_workout_template_to_client(uuid, uuid);

create function public.assign_workout_template_to_client(p_template_id uuid, p_client_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid;
  v_is_system boolean;
  v_template_name text;
  v_client_active boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  select coach_id, is_system, name into v_coach_id, v_is_system, v_template_name
  from public.workout_templates where id = p_template_id;
  if v_template_name is null then
    raise exception 'NOT_FOUND: scheda modello non trovata';
  end if;
  if not v_is_system and v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il proprietario di questo modello';
  end if;

  select exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = p_client_id
      and coach_clients.status = 'active'
  ) into v_client_active;
  if not v_client_active then
    raise exception 'CLIENT_NOT_ACTIVE: il cliente indicato non e'' un cliente active di questo coach';
  end if;

  return public._copy_template_days_to_plans(p_template_id, p_client_id, auth.uid(), 'coach');
end;
$$;

revoke all on function public.assign_workout_template_to_client(uuid, uuid) from public, anon;
grant execute on function public.assign_workout_template_to_client(uuid, uuid) to authenticated;

-- ============================================================================
-- 4) Helper matching: distanza ordinale tra livelli
-- ============================================================================
create or replace function public._level_ordinal(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'Principiante' then 1
    when 'Intermedio' then 2
    when 'Avanzato' then 3
    else 2
  end;
$$;

revoke all on function public._level_ordinal(text) from public, anon, authenticated;

-- ============================================================================
-- 5) assign_initial_auto_program — nessun parametro, sempre auth.uid()
-- ============================================================================
create or replace function public.assign_initial_auto_program()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  -- il ciclo esiste gia'.
  select id into v_existing_cycle from public.client_program_cycles
  where client_id = v_client_id and status in ('draft', 'active', 'pending_review')
  limit 1;
  if v_existing_cycle is not null then
    return v_existing_cycle;
  end if;

  -- Serializza le chiamate concorrenti per lo STESSO cliente: senza questo
  -- lock, due tap ravvicinati potrebbero superare entrambi il controllo sopra
  -- e creare due volte le schede prima che l'indice unico parziale su
  -- client_program_cycles intervenga, lasciando schede orfane. Con il lock,
  -- la seconda chiamata attende il commit della prima e poi ritrova il ciclo
  -- gia' creato nel ricontrollo sotto.
  perform pg_advisory_xact_lock(hashtext(v_client_id::text));

  select id into v_existing_cycle from public.client_program_cycles
  where client_id = v_client_id and status in ('draft', 'active', 'pending_review')
  limit 1;
  if v_existing_cycle is not null then
    return v_existing_cycle;
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

  -- Limitazione importante: mai un allenamento intenso automatico, mai
  -- un'euristica su testo libero. requires_professional_supervision e'
  -- SEMPRE una risposta esplicita e diretta del questionario (vedi UI).
  if v_profile.requires_professional_supervision then
    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, fitness_profile_snapshot, started_at, created_by
    ) values (
      v_client_id, 'pending_review', 1, 'auto_initial',
      'Il questionario segnala una limitazione che richiede il parere di un professionista: nessuna scheda assegnata automaticamente, in attesa di intervento Superadmin.',
      v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data)
    select profiles.id, 'superadmin', 'auto_program_requires_supervision',
      'Cliente in attesa di supervisione professionale',
      'Un cliente ha completato il questionario fitness segnalando una limitazione che richiede il tuo intervento prima di assegnare un programma.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id)
    from public.profiles where profiles.role = 'superadmin';

    return v_cycle_id;
  end if;

  -- === Motore di matching deterministico (mai un'assegnazione casuale) =====
  v_level := case v_experience
    when 'beginner' then 'Principiante'
    when 'novice' then 'Principiante'
    when 'intermediate' then 'Intermedio'
    when 'advanced' then 'Avanzato'
    when 'competitive' then 'Avanzato'
    else 'Intermedio'
  end;

  -- Primo obiettivo selezionato dal cliente (ordine di selezione, non un
  -- criterio di priorita' fisso) come obiettivo primario per il matching.
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

  -- Stage 1: match esatto goal+level+location.
  select id into v_template_id
  from public.workout_templates
  where is_system and is_active and auto_eligible
    and goal = v_goal and level = v_level and location = v_location
  order by abs(coalesce(sessions_per_week, v_days) - v_days),
           abs(coalesce(estimated_session_minutes, v_duration) - v_duration),
           sort_order
  limit 1;

  -- Stage 2: stessa location+level (il luogo/attrezzatura e' un vincolo
  -- pratico piu' stringente dell'obiettivo specifico: rilassiamo il goal
  -- prima della location).
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and level = v_level and location = v_location
    order by abs(coalesce(sessions_per_week, v_days) - v_days),
             abs(coalesce(estimated_session_minutes, v_duration) - v_duration),
             sort_order
    limit 1;
  end if;

  -- Stage 3: stessa location+goal, livello piu' vicino.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and goal = v_goal and location = v_location
    order by abs(public._level_ordinal(level) - public._level_ordinal(v_level)),
             abs(coalesce(sessions_per_week, v_days) - v_days),
             sort_order
    limit 1;
  end if;

  -- Stage 4: solo location, livello piu' vicino, qualunque obiettivo.
  if v_template_id is null then
    select id into v_template_id
    from public.workout_templates
    where is_system and is_active and auto_eligible
      and location = v_location
    order by abs(public._level_ordinal(level) - public._level_ordinal(v_level)),
             abs(coalesce(sessions_per_week, v_days) - v_days),
             sort_order
    limit 1;
  end if;

  if v_template_id is null then
    raise exception 'NO_TEMPLATE_AVAILABLE: nessun modello automatico disponibile per questa combinazione';
  end if;

  v_plan_ids := public._copy_template_days_to_plans(v_template_id, v_client_id, null, 'auto_system');

  -- Rimuove gli esercizi esclusi dal cliente dalla copia appena creata
  -- (nessuna sostituzione con un esercizio equivalente in questo blocco: la
  -- mappatura "esercizio alternativo" non esiste ancora nel catalogo).
  delete from public.workout_day_exercises wde
  using public.workout_days wd
  where wde.workout_day_id = wd.id
    and wd.workout_plan_id = any (v_plan_ids)
    and wde.exercise_id in (
      select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active
    );

  -- Se un giorno resta senza esercizi dopo la rimozione, quel giorno (la
  -- scheda reale corrispondente) non viene mai lasciato vuoto in silenzio:
  -- viene eliminato e il fatto annotato in decision_reason.
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
      v_client_id, 'pending_review', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data)
    select profiles.id, 'superadmin', 'auto_program_requires_supervision',
      'Cliente senza programma assegnabile automaticamente',
      'Il modello scelto dal motore automatico e'' risultato vuoto dopo aver rimosso gli esercizi esclusi dal cliente.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id)
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

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data)
  values (v_client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma è pronto', v_decision_reason, jsonb_build_object('cycle_id', v_cycle_id, 'template_id', v_template_id));

  return v_cycle_id;
end;
$$;

revoke all on function public.assign_initial_auto_program() from public, anon;
grant execute on function public.assign_initial_auto_program() to authenticated;

-- ============================================================================
-- 6) superadmin_assign_program_template — escape hatch minima (RPC-only,
-- nessun pannello UI in questo blocco) per sbloccare i cicli pending_review
-- ============================================================================
create or replace function public.superadmin_assign_program_template(
  p_cycle_id uuid,
  p_template_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.client_program_cycles%rowtype;
  v_plan_ids uuid[];
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo il superadmin puo'' eseguire questa azione';
  end if;

  select * into v_cycle from public.client_program_cycles where id = p_cycle_id for update;
  if not found then
    raise exception 'NOT_FOUND: ciclo non trovato';
  end if;
  if v_cycle.status <> 'pending_review' then
    raise exception 'INVALID_STATE: il ciclo non e'' in attesa di revisione';
  end if;

  v_plan_ids := public._copy_template_days_to_plans(p_template_id, v_cycle.client_id, null, 'superadmin_override');

  update public.client_program_cycles set
    status = 'active',
    template_id = p_template_id,
    started_at = current_date,
    review_due_at = current_date + 28,
    decision_reason = coalesce(nullif(trim(p_notes), ''), 'Programma assegnato manualmente dal Superadmin dopo revisione.'),
    created_by = auth.uid()
  where id = p_cycle_id;

  insert into public.client_program_cycle_plans (cycle_id, workout_plan_id)
  select p_cycle_id, unnest(v_plan_ids);

  insert into public.superadmin_program_overrides (superadmin_id, client_id, cycle_id, action, notes)
  values (auth.uid(), v_cycle.client_id, p_cycle_id, 'manual_assign', p_notes);

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data)
  values (
    v_cycle.client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma è pronto',
    'Il tuo programma è stato assegnato dal team dopo la revisione del questionario.',
    jsonb_build_object('cycle_id', p_cycle_id, 'template_id', p_template_id)
  );

  return p_cycle_id;
end;
$$;

revoke all on function public.superadmin_assign_program_template(uuid, uuid, text) from public, anon;
grant execute on function public.superadmin_assign_program_template(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 7) Fix update_workout_session_progress — bug reale con coach_id nullable
-- ============================================================================
-- "v_plan.coach_id <> auth.uid()" con coach_id NULL restituisce sempre NULL
-- (mai true) in SQL/PLpgSQL: combinato con gli "and" della condizione FORBIDDEN
-- esistente, l'intero "if" collassava a NULL e non sollevava MAI l'eccezione
-- per un piano automatico, disabilitando silenziosamente il controllo di
-- autorizzazione. Stessa firma e stesso tipo di ritorno (returns void) della
-- versione precedente (20260728090000): CREATE OR REPLACE e' sufficiente.
-- Nessuna logica esistente cambiata per il ramo coach_id non nullo, solo
-- avvolta in un ramo "else" esplicito.
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
  v_client_has_active_link boolean;
  v_coach_client_active boolean;
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

  if v_plan.session_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: sessione gia'' completata, non modificabile';
  end if;

  if v_plan.coach_id is null then
    if v_plan.client_id <> auth.uid() and not public.is_superadmin() then
      raise exception 'FORBIDDEN: non autorizzato su questa scheda';
    end if;
  else
    select exists (
      select 1
      from public.coach_clients
      where coach_clients.coach_id = v_plan.coach_id
        and coach_clients.client_id = auth.uid()
        and coach_clients.status = 'active'
    ) into v_client_has_active_link;

    select exists (
      select 1
      from public.coach_clients
      where coach_clients.coach_id = v_plan.coach_id
        and coach_clients.client_id = v_plan.client_id
        and coach_clients.status = 'active'
    ) into v_coach_client_active;

    if v_plan.coach_id <> auth.uid()
       and not (v_plan.client_id = auth.uid() and v_client_has_active_link)
       and not public.is_superadmin() then
      raise exception 'FORBIDDEN: non autorizzato su questa scheda';
    end if;

    if v_plan.coach_id = auth.uid() and not v_coach_client_active and not public.is_superadmin() then
      raise exception 'CLIENT_NOT_ACTIVE: il cliente non e'' piu'' attivo per questo coach';
    end if;
  end if;

  if p_completed_exercise_ids is not null then
    select id into v_day_id from public.workout_days where workout_plan_id = p_plan_id and day_order = 1;
    if v_day_id is not null then
      update public.workout_day_exercises set completed = (id = any (p_completed_exercise_ids))
      where workout_day_id = v_day_id;
    end if;
  end if;

  update public.workout_plans set
    session_status = coalesce(p_session_status, session_status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = p_plan_id;
end;
$$;

revoke all on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
