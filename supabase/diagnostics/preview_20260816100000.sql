BEGIN;

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
    when 'Diventare piÃ¹ forte' then 'Forza'
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
-- DIAGNOSTICA NON DISTRUTTIVA - sostituisce il blocco audit della migration
-- ============================================================================
-- Eseguire l'intero file o, in caso di errore, eseguire manualmente i blocchi
-- fra BEGIN e ROLLBACK uno alla volta.

with expected(name, expected_sessions_per_week) as (
  values
    ('Full Body Ipertrofia 2 giorni'::text, 2::integer),
    ('Full Body Ipertrofia 3 giorni'::text, 3::integer),
    ('Upper Lower Ipertrofia 5 giorni'::text, 5::integer)
), candidates as (
  select
    e.name as template_name,
    e.expected_sessions_per_week,
    wt.id,
    wt.name,
    wt.goal,
    wt.level,
    wt.location,
    wt.sessions_per_week,
    wt.is_system,
    wt.is_active,
    wt.auto_eligible
  from expected e
  left join public.workout_templates wt
    on wt.name = e.name
   and wt.sessions_per_week = e.expected_sessions_per_week
), exact_candidates as (
  select
    e.name as template_name,
    e.expected_sessions_per_week,
    wt.id
  from expected e
  left join public.workout_templates wt
    on wt.is_system
   and wt.auto_eligible
   and wt.is_active
   and wt.goal = 'Massa muscolare'
   and wt.level = 'Intermedio'
   and wt.location = 'Palestra'
   and wt.sessions_per_week = e.expected_sessions_per_week
   and wt.name = e.name
), chosen as (
  select distinct on (template_name)
    template_name,
    expected_sessions_per_week,
    id as expected_template_id
  from exact_candidates
  where id is not null
  order by template_name, id
), all_exact_goal_level_location_days as (
  select
    e.name as template_name,
    e.expected_sessions_per_week,
    wt.id,
    wt.name,
    wt.goal,
    wt.level,
    wt.location,
    wt.sessions_per_week
  from expected e
  join public.workout_templates wt
    on wt.is_system
   and wt.auto_eligible
   and wt.is_active
   and wt.goal = 'Massa muscolare'
   and wt.level = 'Intermedio'
   and wt.location = 'Palestra'
   and wt.sessions_per_week = e.expected_sessions_per_week
), day_stats as (
  select
    c.template_name,
    count(wtd.id)::integer as day_count,
    count(wtd.id) filter (
      where not exists (
        select 1 from public.workout_template_exercises wte where wte.template_day_id = wtd.id
      )
    )::integer as empty_day_count
  from chosen c
  left join public.workout_template_days wtd on wtd.template_id = c.expected_template_id
  group by c.template_name
), missing_metadata as (
  select
    c.template_name,
    wte.exercise_id
  from chosen c
  join public.workout_template_days wtd on wtd.template_id = c.expected_template_id
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
  where emm.exercise_id is null
), incompatible as (
  select
    c.template_name,
    wte.exercise_id,
    coalesce(el.name, wte.exercise_id) as exercise_name,
    emm.min_level,
    emm.compatible_locations,
    emm.equipment_tag
  from chosen c
  join public.workout_template_days wtd on wtd.template_id = c.expected_template_id
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
  left join public.exercises el on el.id::text = wte.exercise_id
  where public._exercise_level_ordinal(emm.min_level) > public._exercise_level_ordinal('intermediate')
     or not ('gym' = any(coalesce(emm.compatible_locations, '{}'::text[])))
     or (
       case emm.equipment_tag
         when 'bodyweight_only' then 1
         when 'home_basic' then 2
         when 'full_gym' then 3
         else 99
       end
     ) > 3
), duplicates as (
  select
    c.template_name,
    wtd.name as day_name,
    wte.exercise_id,
    count(*)::integer as occurrences
  from chosen c
  join public.workout_template_days wtd on wtd.template_id = c.expected_template_id
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  group by c.template_name, wtd.id, wtd.name, wte.exercise_id
  having count(*) > 1
), matched as (
  select
    e.name as template_name,
    public._match_auto_template('Massa muscolare', 'Intermedio', 'Palestra', e.expected_sessions_per_week, 60, null::uuid, 'full_gym') as matched_template_id
  from expected e
)
select
  e.name as template_name,
  e.expected_sessions_per_week,
  (select count(*) from exact_candidates ec where ec.template_name = e.name and ec.id is not null) as template_count,
  coalesce((select jsonb_agg(ec.id order by ec.id) from exact_candidates ec where ec.template_name = e.name and ec.id is not null), '[]'::jsonb) as candidate_template_ids,
  coalesce(ds.day_count, 0) as day_count,
  coalesce(ds.empty_day_count, 0) as empty_day_count,
  (select count(*) from missing_metadata mm where mm.template_name = e.name) as missing_metadata_count,
  coalesce((select jsonb_agg(mm.exercise_id order by mm.exercise_id) from missing_metadata mm where mm.template_name = e.name), '[]'::jsonb) as exercises_without_metadata,
  (select count(*) from incompatible i where i.template_name = e.name) as incompatible_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'exercise_id', i.exercise_id,
      'exercise_name', i.exercise_name,
      'min_level', i.min_level,
      'compatible_locations', i.compatible_locations,
      'equipment_tag', i.equipment_tag
    ) order by i.exercise_id)
    from incompatible i
    where i.template_name = e.name
  ), '[]'::jsonb) as incompatible_exercises,
  (select count(*) from duplicates d where d.template_name = e.name) as duplicate_exercise_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'day_name', d.day_name,
      'exercise_id', d.exercise_id,
      'occurrences', d.occurrences
    ) order by d.day_name, d.exercise_id)
    from duplicates d
    where d.template_name = e.name
  ), '[]'::jsonb) as duplicate_exercises,
  c.expected_template_id,
  m.matched_template_id,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'goal', a.goal,
      'level', a.level,
      'location', a.location,
      'sessions_per_week', a.sessions_per_week
    ) order by a.name, a.id)
    from all_exact_goal_level_location_days a
    where a.template_name = e.name
  ), '[]'::jsonb) as all_exact_goal_level_location_days_templates,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', cand.id,
      'name', cand.name,
      'goal', cand.goal,
      'level', cand.level,
      'location', cand.location,
      'sessions_per_week', cand.sessions_per_week,
      'is_system', cand.is_system,
      'is_active', cand.is_active,
      'auto_eligible', cand.auto_eligible
    ) order by cand.name, cand.id)
    from candidates cand
    where cand.template_name = e.name and cand.id is not null
  ), '[]'::jsonb) as same_name_candidates_all_values
from expected e
left join chosen c on c.template_name = e.name
left join day_stats ds on ds.template_name = e.name
left join matched m on m.template_name = e.name
order by e.expected_sessions_per_week;

ROLLBACK;
