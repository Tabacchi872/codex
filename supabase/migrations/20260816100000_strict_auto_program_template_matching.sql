-- fix: matching stretto per programmi automatici self-guided.
--
-- Obiettivo:
-- - non assegnare mai un template con goal diverso;
-- - non assegnare mai un template con numero di giorni diverso;
-- - mantenere compatibilita' di livello, luogo e attrezzatura disponibile;
-- - rispettare limitazioni ed esclusioni: se il questionario richiede
--   supervisione resta pending_safety_review; se le esclusioni rendono il
--   template non piu' compatibile con i giorni richiesti, resta
--   pending_template / NO_COMPATIBLE_TEMPLATE;
-- - aggiungere i template mancanti Massa muscolare + Intermedio + Palestra
--   per 2, 3 e 5 giorni, mantenendo quello esistente da 4 giorni.

-- ============================================================================
-- PARTE A - Matching stretto: goal e giorni esatti, nessun fallback scorretto
-- ============================================================================
drop function if exists public._match_auto_template(text, text, text, integer, integer, uuid);

create or replace function public._match_auto_template(
  p_goal text, p_level text, p_location text, p_days integer, p_duration integer,
  p_exclude_template_id uuid default null,
  p_client_equipment_level text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_template_id uuid;
  v_client_exercise_level text;
begin
  if p_goal is null or p_location is null or p_days is null then
    return null;
  end if;

  v_client_exercise_level := case p_level
    when 'Principiante' then 'beginner'
    when 'Intermedio' then 'intermediate'
    when 'Avanzato' then 'advanced'
    when 'beginner' then 'beginner'
    when 'intermediate' then 'intermediate'
    when 'advanced' then 'advanced'
    else 'intermediate'
  end;

  select wt.id into v_template_id
  from public.workout_templates wt
  where wt.is_system
    and wt.is_active
    and wt.auto_eligible
    and wt.goal = p_goal
    and wt.location = p_location
    and wt.sessions_per_week = p_days
    and (p_exclude_template_id is null or wt.id <> p_exclude_template_id)
    and (
      p_level is null
      or public._level_ordinal(wt.level) <= public._level_ordinal(p_level)
    )
    and not exists (
      select 1
      from public.workout_template_days wtd
      join public.workout_template_exercises wte on wte.template_day_id = wtd.id
      left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
          where wtd.template_id = wt.id
        and (
          emm.exercise_id is null
          or public._exercise_level_ordinal(emm.min_level) > public._exercise_level_ordinal(v_client_exercise_level)
          or not (
            case emm.equipment_tag
              when 'bodyweight_only' then 1
              when 'home_basic' then 2
              when 'full_gym' then 3
              else 3
            end
            <=
            case coalesce(p_client_equipment_level, case when p_location = 'Palestra' then 'full_gym' else 'bodyweight_only' end)
              when 'bodyweight_only' then 1
              when 'home_basic' then 2
              when 'full_gym' then 3
              else 0
            end
          )
          or not (
            case p_location when 'Palestra' then 'gym' when 'Casa' then 'home' else lower(p_location) end
            = any(coalesce(emm.compatible_locations, '{}'::text[]))
          )
        )
    )
    and (
      select count(*)
      from public.workout_template_days wtd
      where wtd.template_id = wt.id
    ) = p_days
  order by
    abs(public._level_ordinal(wt.level) - public._level_ordinal(coalesce(p_level, wt.level))),
    abs(coalesce(wt.estimated_session_minutes, p_duration) - p_duration),
    wt.sort_order,
    wt.name
  limit 1;

  return v_template_id;
end;
$function$;

revoke all on function public._match_auto_template(text, text, text, integer, integer, uuid, text) from public, anon;
grant execute on function public._match_auto_template(text, text, text, integer, integer, uuid, text) to authenticated;

-- ============================================================================
-- PARTE B - Assegnazione iniziale: pending_template invece di template errati
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
  v_exercise_level text;
  v_template_id uuid;
  v_plan_ids uuid[];
  v_final_plan_ids uuid[] := '{}';
  v_removed_days text[] := '{}';
  v_pid uuid;
  v_day_label text;
  v_remaining_count integer;
  v_compatible_days_count integer;
  v_template_name text;
  v_template_day record;
  v_plan_status text;
  v_plan_id uuid;
  v_day_id uuid;
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
  v_exercise_level := case v_level
    when 'Principiante' then 'beginner'
    when 'Intermedio' then 'intermediate'
    when 'Avanzato' then 'advanced'
    else 'intermediate'
  end;

  v_goal := case v_goals[1]
    when 'Perdere peso' then 'Dimagrimento'
    when 'Costruire muscoli' then 'Massa muscolare'
    when 'Diventare più forte' then 'Forza'
    when 'Diventare piu'' forte' then 'Forza'
    when 'Migliorare i fondamentali' then 'Principianti'
    when 'Migliorare il condizionamento' then 'Performance'
    when 'Preparazione sportiva' then 'Performance'
    else 'Principianti'
  end;

  v_location := case v_profile.location when 'gym' then 'Palestra' when 'home' then 'Casa' else 'Palestra' end;
  v_days := coalesce(v_training_days, 3);
  v_duration := coalesce(v_profile.session_duration_minutes, 45);

  v_template_id := public._match_auto_template(v_goal, v_level, v_location, v_days, v_duration, null, v_profile.equipment_level);

  if v_template_id is null then
    v_decision_reason := 'NO_COMPATIBLE_TEMPLATE: nessun modello automatico compatibile con goal, livello, luogo, attrezzatura e giorni richiesti.';

    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, fitness_profile_snapshot, started_at, created_by
    ) values (
      v_client_id, 'pending_template', 1, 'auto_initial', v_decision_reason, v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
    select profiles.id, 'superadmin', 'review_blocked_no_template',
      'Cliente senza template automatico compatibile',
      'Non esiste un template automatico con goal, livello, luogo, attrezzatura e giorni compatibili con il questionario.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id, 'result_code', 'NO_COMPATIBLE_TEMPLATE'),
      'review_blocked_no_template:' || v_cycle_id::text
    from public.profiles where profiles.role = 'superadmin';

    return v_cycle_id;
  end if;

  select count(*) into v_compatible_days_count
  from public.workout_template_days wtd
  where wtd.template_id = v_template_id
    and exists (
      select 1
      from public.workout_template_exercises wte
      join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
      where wte.template_day_id = wtd.id
        and wte.exercise_id not in (
          select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active
        )
        and public._exercise_level_ordinal(emm.min_level) <= public._exercise_level_ordinal(v_exercise_level)
        and (
          case emm.equipment_tag
            when 'bodyweight_only' then 1
            when 'home_basic' then 2
            when 'full_gym' then 3
            else 3
          end
          <=
          case coalesce(v_profile.equipment_level, case when v_location = 'Palestra' then 'full_gym' else 'bodyweight_only' end)
            when 'bodyweight_only' then 1
            when 'home_basic' then 2
            when 'full_gym' then 3
            else 0
          end
        )
        and (case v_location when 'Palestra' then 'gym' when 'Casa' then 'home' else lower(v_location) end) = any(emm.compatible_locations)
    );

  if v_compatible_days_count <> v_days then
    v_decision_reason := 'NO_COMPATIBLE_TEMPLATE: il template compatibile per goal e giorni richiesti contiene limitazioni o esercizi esclusi dal cliente e non puo'' produrre tutte le schede richieste.';

    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, template_id, fitness_profile_snapshot, started_at, created_by
    ) values (
      v_client_id, 'pending_template', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, v_client_id
    ) returning id into v_cycle_id;

    insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
    select profiles.id, 'superadmin', 'review_blocked_no_template',
      'Cliente senza programma assegnabile automaticamente',
      'Il template compatibile e'' stato bloccato da limitazioni o esercizi esclusi del cliente: nessun programma parziale e'' stato assegnato.',
      jsonb_build_object('cycle_id', v_cycle_id, 'client_id', v_client_id, 'template_id', v_template_id, 'result_code', 'NO_COMPATIBLE_TEMPLATE'),
      'review_blocked_no_template:' || v_cycle_id::text
    from public.profiles where profiles.role = 'superadmin';

    return v_cycle_id;
  end if;

  select name into v_template_name from public.workout_templates where id = v_template_id;
  v_plan_status := 'active';

  for v_template_day in
    select id, name from public.workout_template_days where template_id = v_template_id order by sort_order, created_at
  loop
    insert into public.workout_plans (coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
    values (null, v_client_id, v_template_id, v_template_name || ' - ' || v_template_day.name, v_plan_status, current_date, current_date + interval '90 days', 'todo', v_template_day.name, 'auto_system')
    returning id into v_plan_id;

    insert into public.workout_days (workout_plan_id, day_order)
    values (v_plan_id, 1)
    returning id into v_day_id;

    insert into public.workout_day_exercises (
      workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
    )
    select v_day_id, wte.exercise_id, wte.exercise_order, wte.sets, wte.reps, wte.reps_min, wte.reps_max,
      wte.target_weight, wte.rest_seconds, wte.notes, wte.technique_type, wte.superset_group_id, wte.duration_seconds, wte.rpe_rir
    from public.workout_template_exercises wte
    join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
    where wte.template_day_id = v_template_day.id
      and wte.exercise_id not in (
        select exercise_id from public.client_excluded_exercises where client_id = v_client_id and active
      )
      and public._exercise_level_ordinal(emm.min_level) <= public._exercise_level_ordinal(v_exercise_level)
      and (
        case emm.equipment_tag
          when 'bodyweight_only' then 1
          when 'home_basic' then 2
          when 'full_gym' then 3
          else 3
        end
        <=
        case coalesce(v_profile.equipment_level, case when v_location = 'Palestra' then 'full_gym' else 'bodyweight_only' end)
          when 'bodyweight_only' then 1
          when 'home_basic' then 2
          when 'full_gym' then 3
          else 0
        end
      )
      and (case v_location when 'Palestra' then 'gym' when 'Casa' then 'home' else lower(v_location) end) = any(emm.compatible_locations)
    order by wte.exercise_order;

    v_final_plan_ids := array_append(v_final_plan_ids, v_plan_id);
  end loop;

  v_decision_reason := 'Programma assegnato automaticamente in base a obiettivo, livello, luogo e giorni disponibili indicati nel questionario.';

  insert into public.client_program_cycles (
    client_id, status, cycle_number, source, decision_reason, template_id, fitness_profile_snapshot, started_at, review_due_at, created_by
  ) values (
    v_client_id, 'active', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, current_date + 28, v_client_id
  ) returning id into v_cycle_id;

  insert into public.client_program_cycle_plans (cycle_id, workout_plan_id)
  select v_cycle_id, unnest(v_final_plan_ids);

  perform public._generate_cycle_sessions(v_cycle_id, v_final_plan_ids);

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (v_client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma e'' pronto', v_decision_reason,
    jsonb_build_object('cycle_id', v_cycle_id, 'template_id', v_template_id),
    'auto_program_assigned:' || v_cycle_id::text);

  return v_cycle_id;
end;
$function$;

revoke all on function public.assign_initial_auto_program() from public, anon;
grant execute on function public.assign_initial_auto_program() to authenticated;

-- ============================================================================
-- PARTE C - Template sicuri Massa muscolare / Intermedio / Palestra
-- ============================================================================

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
begin
  if not exists (
    select 1 from public.workout_templates
    where is_system and goal = 'Massa muscolare' and level = 'Intermedio'
      and location = 'Palestra' and sessions_per_week = 2
      and name = 'Full Body Ipertrofia 2 giorni'
  ) then
    insert into public.workout_templates (
      coach_id, folder_id, name, description, goal, level, sort_order,
      duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
      location, training_style, muscle_focus, intensity, progression_notes,
      deload_week, is_system, auto_eligible, source_template_id
    ) values (
      null, null, 'Full Body Ipertrofia 2 giorni',
      'Due sedute full body per ipertrofia intermedia in palestra, pensate per frequenza ridotta senza cambiare obiettivo.',
      'Massa muscolare', 'Intermedio', 2,
      8, 2, 60, 'Bilanciere, manubri, cavi, macchine',
      'Palestra', 'Full body', 'Total body', 'Moderata-alta',
      'Progressione a doppio range: aumentare il carico quando tutte le serie raggiungono il limite alto a RIR 2.',
      true, true, true, null
    ) returning id into v_tpl;

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body A', 'Spinta, quadricipiti, dorso', 0, 60) returning id into v_day_a;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_a, 'gambe-squat', 1, 4, 8, 8, 10, 120, null, 'Tecnica stabile prima del carico.', 'RIR 2'),
      (v_day_a, 'petto-panca-piana', 2, 4, 8, 8, 10, 90, null, 'Scapole addotte e traiettoria controllata.', 'RIR 2'),
      (v_day_a, 'dorso-lat-machine-avanti', 3, 4, 10, 10, 12, 75, null, 'Tirare con le scapole, non con le braccia.', 'RIR 2'),
      (v_day_a, 'spalle-shoulder-press', 4, 3, 10, 10, 12, 75, null, 'Core attivo, non inarcare.', 'RIR 2'),
      (v_day_a, 'core-plank', 5, 3, 1, null, null, 30, 45, 'Tenuta controllata.', 'RIR 3');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body B', 'Catena posteriore, petto, braccia', 1, 60) returning id into v_day_b;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_b, 'gambe-hip-thrust', 1, 4, 10, 10, 12, 90, null, 'Focus glutei con carico controllato.', 'RIR 2'),
      (v_day_b, 'petto-panca-inclinata-manubri', 2, 4, 10, 8, 10, 90, null, 'Inclinazione moderata.', 'RIR 2'),
      (v_day_b, 'dorso-pulley-basso', 3, 4, 10, 10, 12, 75, null, 'Busto stabile.', 'RIR 2'),
      (v_day_b, 'gambe-leg-press', 4, 3, 12, 12, 15, 75, null, 'Non bloccare le ginocchia.', 'RIR 2'),
      (v_day_b, 'tricipiti-pushdown-cavo', 5, 3, 12, 12, 15, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 1-2'),
      (v_day_b, 'bicipiti-curl-bilanciere', 6, 3, 12, 10, 12, 60, null, 'Movimento controllato.', 'RIR 1-2');
  end if;
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  if not exists (
    select 1 from public.workout_templates
    where is_system and goal = 'Massa muscolare' and level = 'Intermedio'
      and location = 'Palestra' and sessions_per_week = 3
      and name = 'Full Body Ipertrofia 3 giorni'
  ) then
    insert into public.workout_templates (
      coach_id, folder_id, name, description, goal, level, sort_order,
      duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
      location, training_style, muscle_focus, intensity, progression_notes,
      deload_week, is_system, auto_eligible, source_template_id
    ) values (
      null, null, 'Full Body Ipertrofia 3 giorni',
      'Tre sedute full body per massa muscolare intermedia in palestra, con enfasi alternata tra spinta, trazione e gambe.',
      'Massa muscolare', 'Intermedio', 2,
      8, 3, 60, 'Bilanciere, manubri, cavi, macchine',
      'Palestra', 'Full body', 'Total body', 'Moderata-alta',
      'Aumentare una variabile alla volta: prima ripetizioni, poi carico, mantenendo RIR 1-2 sugli accessori.',
      true, true, true, null
    ) returning id into v_tpl;

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body A', 'Petto, quadricipiti, dorsali', 0, 60) returning id into v_day_a;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_a, 'petto-panca-piana', 1, 4, 8, 8, 10, 90, null, 'Serie principale di spinta.', 'RIR 2'),
      (v_day_a, 'gambe-squat', 2, 4, 8, 8, 10, 120, null, 'Serie principale lower.', 'RIR 2'),
      (v_day_a, 'dorso-lat-machine-avanti', 3, 4, 10, 10, 12, 75, null, 'Controllo scapolare.', 'RIR 2'),
      (v_day_a, 'spalle-alzate-laterali', 4, 3, 15, 12, 15, 45, null, 'Salita controllata.', 'RIR 1-2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body B', 'Dorso, posteriori, spalle', 1, 60) returning id into v_day_b;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_b, 'gambe-hip-thrust', 1, 4, 10, 10, 12, 90, null, 'Estensione d''anca controllata.', 'RIR 2'),
      (v_day_b, 'dorso-rematore-manubrio', 2, 4, 10, 10, 12, 75, null, 'Gomito vicino al busto.', 'RIR 2'),
      (v_day_b, 'petto-chest-press', 3, 3, 12, 10, 12, 75, null, 'Sedile regolato allineato al petto.', 'RIR 2'),
      (v_day_b, 'spalle-shoulder-press', 4, 3, 10, 10, 12, 75, null, 'Core stabile.', 'RIR 2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body C', 'Gambe, petto inclinato, braccia', 2, 60) returning id into v_day_c;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_c, 'gambe-leg-press', 1, 4, 12, 10, 12, 90, null, 'Range completo controllato.', 'RIR 2'),
      (v_day_c, 'petto-panca-inclinata-manubri', 2, 4, 10, 8, 10, 90, null, 'Gomiti sotto i polsi.', 'RIR 2'),
      (v_day_c, 'dorso-pulley-basso', 3, 4, 12, 10, 12, 75, null, 'Busto fermo.', 'RIR 2'),
      (v_day_c, 'bicipiti-curl-bilanciere', 4, 3, 12, 10, 12, 60, null, 'Gomiti fermi.', 'RIR 1-2'),
      (v_day_c, 'tricipiti-pushdown-cavo', 5, 3, 12, 12, 15, 60, null, 'Estensione completa.', 'RIR 1-2');
  end if;
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
  v_day_e uuid;
begin
  if not exists (
    select 1 from public.workout_templates
    where is_system and goal = 'Massa muscolare' and level = 'Intermedio'
      and location = 'Palestra' and sessions_per_week = 5
      and name = 'Upper Lower Ipertrofia 5 giorni'
  ) then
    insert into public.workout_templates (
      coach_id, folder_id, name, description, goal, level, sort_order,
      duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
      location, training_style, muscle_focus, intensity, progression_notes,
      deload_week, is_system, auto_eligible, source_template_id
    ) values (
      null, null, 'Upper Lower Ipertrofia 5 giorni',
      'Cinque sedute per ipertrofia intermedia in palestra: due upper, due lower e una seduta pump tecnica.',
      'Massa muscolare', 'Intermedio', 4,
      8, 5, 60, 'Bilanciere, manubri, cavi, macchine',
      'Palestra', 'Upper/Lower + pump', 'Total body', 'Alta',
      'Volume distribuito su cinque giorni con RIR controllato; ridurre il volume nella settimana di deload.',
      true, true, true, null
    ) returning id into v_tpl;

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Upper A', 'Petto e dorso', 0, 60) returning id into v_day_a;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_a, 'petto-panca-piana', 1, 4, 8, 8, 10, 90, null, 'Spinta principale.', 'RIR 2'),
      (v_day_a, 'dorso-lat-machine-avanti', 2, 4, 10, 10, 12, 75, null, 'Trazione verticale.', 'RIR 2'),
      (v_day_a, 'petto-croci-manubri', 3, 3, 12, 12, 15, 60, null, 'Allungamento controllato.', 'RIR 1-2'),
      (v_day_a, 'dorso-rematore-manubrio', 4, 3, 12, 10, 12, 60, null, 'Trazione orizzontale.', 'RIR 2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Lower A', 'Quadricipiti', 1, 60) returning id into v_day_b;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_b, 'gambe-squat', 1, 4, 8, 8, 10, 120, null, 'Squat tecnico.', 'RIR 2'),
      (v_day_b, 'gambe-leg-press', 2, 4, 12, 10, 12, 90, null, 'Volume quadricipiti.', 'RIR 2'),
      (v_day_b, 'gambe-leg-curl', 3, 3, 12, 12, 15, 60, null, 'Controllo femorali.', 'RIR 1-2'),
      (v_day_b, 'gambe-calf-raise', 4, 4, 15, 15, 20, 45, null, 'Pausa in alto.', 'RIR 1-2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Upper B', 'Spalle e dorso', 2, 60) returning id into v_day_c;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_c, 'petto-panca-inclinata-manubri', 1, 4, 10, 8, 10, 90, null, 'Spinta inclinata.', 'RIR 2'),
      (v_day_c, 'dorso-pulley-basso', 2, 4, 10, 10, 12, 75, null, 'Trazione controllata.', 'RIR 2'),
      (v_day_c, 'spalle-shoulder-press', 3, 3, 10, 10, 12, 75, null, 'Spinta verticale.', 'RIR 2'),
      (v_day_c, 'spalle-alzate-laterali', 4, 3, 15, 12, 15, 45, null, 'Deltoide laterale.', 'RIR 1-2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Lower B', 'Posteriori e glutei', 3, 60) returning id into v_day_d;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_d, 'gambe-hip-thrust', 1, 4, 10, 10, 12, 90, null, 'Catena posteriore con focus glutei.', 'RIR 2'),
      (v_day_d, 'femorali-leg-curl-seduto', 2, 4, 10, 10, 12, 75, null, 'Femorali in accorciamento con controllo.', 'RIR 2'),
      (v_day_d, 'gambe-affondi', 3, 3, 12, 10, 12, 75, null, 'Unilaterale controllato.', 'RIR 2'),
      (v_day_d, 'femorali-leg-curl-sdraiato', 4, 3, 12, 12, 15, 60, null, 'Femorali isolati.', 'RIR 1-2');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Pump', 'Braccia, spalle, core', 4, 55) returning id into v_day_e;
    insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
      (v_day_e, 'spalle-alzate-laterali', 1, 4, 15, 12, 15, 45, null, 'Volume controllato.', 'RIR 1-2'),
      (v_day_e, 'bicipiti-curl-bilanciere', 2, 4, 12, 10, 12, 60, null, 'Curl tecnico.', 'RIR 1-2'),
      (v_day_e, 'tricipiti-pushdown-cavo', 3, 4, 12, 12, 15, 60, null, 'Estensione completa.', 'RIR 1-2'),
      (v_day_e, 'core-cable-crunch', 4, 3, 15, 12, 15, 45, null, 'Controllo addominale.', 'RIR 2'),
      (v_day_e, 'core-plank', 5, 3, 1, null, null, 30, 45, 'Tenuta stabile.', 'RIR 3');
  end if;
end
$$;

-- ============================================================================
-- PARTE D - Validazioni bloccanti dei template aggiunti
-- ============================================================================
do $$
declare
  v_expected record;
  v_tpl_id uuid;
  v_template_count integer;
  v_day_count integer;
  v_empty_day_count integer;
  v_missing_metadata_count integer;
  v_incompatible_count integer;
  v_duplicate_exercise_count integer;
  v_matched_template_id uuid;
  v_stage text := 'inizio';
begin
  for v_expected in
    select * from (values
      ('Full Body Ipertrofia 2 giorni'::text, 2::integer),
      ('Full Body Ipertrofia 3 giorni'::text, 3::integer),
      ('Upper Lower Ipertrofia 5 giorni'::text, 5::integer)
    ) as t(name, days)
  loop
    begin
    v_stage := 'conteggio template';
    select count(*)
    into v_template_count
    from public.workout_templates
    where is_system
      and auto_eligible
      and is_active
      and goal = 'Massa muscolare'
      and level = 'Intermedio'
      and location = 'Palestra'
      and sessions_per_week = v_expected.days
      and name = v_expected.name;

    raise notice 'AUTO_TEMPLATE_AUDIT template=% template_count=%', v_expected.name, v_template_count;

    if v_template_count <> 1 then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % atteso 1, trovato %', v_expected.name, v_template_count;
    end if;

    v_stage := 'recupero template id';
    select id
    into v_tpl_id
    from public.workout_templates
    where is_system
      and auto_eligible
      and is_active
      and goal = 'Massa muscolare'
      and level = 'Intermedio'
      and location = 'Palestra'
      and sessions_per_week = v_expected.days
      and name = v_expected.name
    order by id
    limit 1;

    raise notice 'AUTO_TEMPLATE_AUDIT template=% expected_template_id=%', v_expected.name, v_tpl_id;

    v_stage := 'conteggio giorni';
    select count(*)
    into v_day_count
    from public.workout_template_days
    where template_id = v_tpl_id;

    raise notice 'AUTO_TEMPLATE_AUDIT template=% day_count=% expected_days=%', v_expected.name, v_day_count, v_expected.days;

    if v_day_count <> v_expected.days then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % giorni attesi %, trovati %', v_expected.name, v_expected.days, v_day_count;
    end if;

    v_stage := 'controllo giorni vuoti';
    select count(*)
    into v_empty_day_count
    from public.workout_template_days wtd
    where wtd.template_id = v_tpl_id
      and not exists (
        select 1 from public.workout_template_exercises wte where wte.template_day_id = wtd.id
      );

    raise notice 'AUTO_TEMPLATE_AUDIT template=% empty_day_count=%', v_expected.name, v_empty_day_count;

    if v_empty_day_count <> 0 then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % contiene giorni vuoti', v_expected.name;
    end if;

    v_stage := 'controllo metadata';
    select count(*)
    into v_missing_metadata_count
    from public.workout_template_days wtd
    join public.workout_template_exercises wte on wte.template_day_id = wtd.id
    left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
    where wtd.template_id = v_tpl_id
      and emm.exercise_id is null;

    raise notice 'AUTO_TEMPLATE_AUDIT template=% missing_metadata_count=%', v_expected.name, v_missing_metadata_count;

    if v_missing_metadata_count <> 0 then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % contiene esercizi senza metadata attivo', v_expected.name;
    end if;

    v_stage := 'controllo compatibilità';
    select count(*)
    into v_incompatible_count
    from public.workout_template_days wtd
    join public.workout_template_exercises wte on wte.template_day_id = wtd.id
    join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
    where wtd.template_id = v_tpl_id
      and (
        public._exercise_level_ordinal(emm.min_level) > public._exercise_level_ordinal('intermediate')
        or not ('gym' = any(coalesce(emm.compatible_locations, '{}'::text[])))
        or (
          case emm.equipment_tag
            when 'bodyweight_only' then 1
            when 'home_basic' then 2
            when 'full_gym' then 3
            else 99
          end
        ) > 3
      );

    raise notice 'AUTO_TEMPLATE_AUDIT template=% incompatible_count=%', v_expected.name, v_incompatible_count;

    if v_incompatible_count <> 0 then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % contiene esercizi non compatibili con Intermedio/Palestra/full_gym', v_expected.name;
    end if;

    v_stage := 'controllo duplicati';
    select count(*)
    into v_duplicate_exercise_count
    from (
      select wtd.id, wte.exercise_id
      from public.workout_template_days wtd
      join public.workout_template_exercises wte on wte.template_day_id = wtd.id
      where wtd.template_id = v_tpl_id
      group by wtd.id, wte.exercise_id
      having count(*) > 1
    ) duplicated;

    raise notice 'AUTO_TEMPLATE_AUDIT template=% duplicate_exercise_count=%', v_expected.name, v_duplicate_exercise_count;

    if v_duplicate_exercise_count <> 0 then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: template % contiene esercizi duplicati nello stesso giorno', v_expected.name;
    end if;

    v_stage := 'chiamata matching';
    v_matched_template_id := public._match_auto_template('Massa muscolare', 'Intermedio', 'Palestra', v_expected.days, 60, null::uuid, 'full_gym');

    raise notice 'AUTO_TEMPLATE_AUDIT template=% expected_template_id=% matched_template_id=%', v_expected.name, v_tpl_id, v_matched_template_id;

    if v_matched_template_id is distinct from v_tpl_id then
      raise exception 'AUTO_TEMPLATE_AUDIT_FAILED: matching stretto non restituisce il template %', v_expected.name;
    end if;
    exception
      when others then
        raise exception
          'AUTO_TEMPLATE_AUDIT_SQL_ERROR template=% fase=% sqlstate=% errore=%',
          v_expected.name,
          v_stage,
          SQLSTATE,
          SQLERRM;
    end;
  end loop;
end
$$;

notify pgrst, 'reload schema';
