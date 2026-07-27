-- fix: gating server-side dell'entitlement Client Pro per il sistema "programmi automatici".
--
-- Trovato durante la verifica end-to-end del Blocco 1 (richiesta esplicita
-- dell'utente: "un cliente senza entitlement attivo non deve ricevere o
-- aprire una scheda automatica e non deve poter creare sessioni o progressi
-- tramite chiamate dirette al backend"). Verificato leggendo il codice reale:
-- il gate esistente (getMySelfGuidedPlanAccess/client-plan-access-service.ts)
-- e' calcolato SOLO lato client (legge user_subscriptions via RLS e filtra in
-- TypeScript) e blocca solo la NAVIGAZIONE in auth-gate.tsx — nessuna RPC del
-- Blocco 1 (assign_initial_auto_program, update_workout_session_progress,
-- superadmin_assign_program_template) verificava l'entitlement lato server.
-- Una chiamata diretta a queste RPC (bypassando la UI) avrebbe quindi potuto
-- ottenere/gestire un programma automatico senza alcun piano Client Pro
-- attivo. Replica esatta della logica client (isActiveAndValid +
-- pickCurrentSelfGuidedSubscription in client-plan-access-service.ts/
-- user-subscriptions-service.ts): status='active', expires_at nullo o
-- futuro, payment_provider='revenuecat', subscription_packages.target_role=
-- 'client', revenuecat_entitlement_id='client_pro' (stessa costante
-- CLIENT_REVENUECAT_ENTITLEMENT). Se quella costante cambia lato app, questa
-- funzione va aggiornata in coppia.
create or replace function public.client_has_active_self_guided_plan(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_subscriptions us
    join public.subscription_packages sp on sp.id = us.package_id
    where us.user_id = p_client_id
      and us.status = 'active'
      and (us.expires_at is null or us.expires_at > now())
      and us.payment_provider = 'revenuecat'
      and sp.target_role = 'client'
      and sp.revenuecat_entitlement_id = 'client_pro'
  );
$$;

revoke all on function public.client_has_active_self_guided_plan(uuid) from public, anon;
grant execute on function public.client_has_active_self_guided_plan(uuid) to authenticated;

-- assign_initial_auto_program: nuovo controllo SUBSCRIPTION_REQUIRED subito
-- dopo il ricontrollo di idempotenza (un ciclo gia' esistente resta
-- restituibile anche se l'entitlement e' nel frattempo scaduto — stesso
-- principio "le schede assegnate non spariscono mai" gia' usato altrove nel
-- progetto — ma NESSUN nuovo ciclo/scheda viene mai creato senza entitlement
-- attivo, incluso il ramo pending_review). Nessun'altra logica cambiata.
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

  -- Nessun NUOVO ciclo (nemmeno pending_review) senza un piano Client Pro
  -- attivo: la generazione di un programma automatico e' una funzionalita'
  -- del piano a pagamento, non deve essere ottenibile chiamando la RPC
  -- direttamente a prescindere dall'entitlement mostrato in UI.
  if not public.client_has_active_self_guided_plan(v_client_id) then
    raise exception 'SUBSCRIPTION_REQUIRED: nessun piano Client Pro attivo';
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
      'Il modello scelto dal motore automatico è risultato vuoto dopo aver rimosso gli esercizi esclusi dal cliente.',
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

-- superadmin_assign_program_template: stesso principio, un cliente senza
-- entitlement attivo non deve ricevere schede nemmeno tramite lo sblocco
-- manuale del Superadmin per un ciclo pending_review.
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
  if not public.client_has_active_self_guided_plan(v_cycle.client_id) then
    raise exception 'SUBSCRIPTION_REQUIRED: il cliente non ha piu'' un piano Client Pro attivo';
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

-- update_workout_session_progress: un cliente self_guided con una scheda
-- automatica (coach_id is null) non deve poter avanzare/completare una
-- sessione (ne' quindi generare progressi) senza un piano Client Pro attivo,
-- neppure chiamando la RPC direttamente. Nessuna eccezione per il superadmin
-- (gia' esente da questo branch tramite "not public.is_superadmin()", come
-- il controllo FORBIDDEN adiacente). Stessa firma, nessun'altra logica
-- cambiata rispetto a 20260730100000.
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
    if not public.is_superadmin() and not public.client_has_active_self_guided_plan(v_plan.client_id) then
      raise exception 'SUBSCRIPTION_REQUIRED: nessun piano Client Pro attivo';
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
