BEGIN;

-- fix: template Massa muscolare/Principiante/Palestra/3 giorni e retry
-- idempotente dei cicli pending_template.

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  if not exists (
    select 1
    from public.workout_templates
    where is_system
      and goal = 'Massa muscolare'
      and level = 'Principiante'
      and location = 'Palestra'
      and sessions_per_week = 3
      and name = 'Full Body Massa Principiante 3 giorni'
  ) then
    insert into public.workout_templates (
      coach_id, folder_id, name, description, goal, level, sort_order,
      duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
      location, training_style, muscle_focus, intensity, progression_notes,
      deload_week, is_system, auto_eligible, source_template_id
    ) values (
      null, null, 'Full Body Massa Principiante 3 giorni',
      'Tre sedute full body per massa muscolare principiante in palestra, basate su macchine, cavi e movimenti semplici.',
      'Massa muscolare', 'Principiante', 1,
      8, 3, 60, 'full_gym',
      'Palestra', 'Full body', 'Total body', 'Moderata',
      'Progressione semplice: completare prima il range alto con tecnica stabile, poi aumentare leggermente il carico.',
      true, true, true, null
    ) returning id into v_tpl;

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body A', 'Spinta guidata, quadricipiti, dorso', 0, 60)
    returning id into v_day_a;

    insert into public.workout_template_exercises (
      template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      rest_seconds, duration_seconds, notes, rpe_rir
    ) values
      (v_day_a, 'petto-chest-press', 1, 3, 12, 10, 12, 75, null, 'Regolare il sedile e controllare la discesa.', 'RIR 2-3'),
      (v_day_a, 'gambe-leg-press', 2, 3, 12, 10, 12, 90, null, 'Escursione controllata, senza bloccare le ginocchia.', 'RIR 2-3'),
      (v_day_a, 'dorso-lat-machine-avanti', 3, 3, 12, 10, 12, 75, null, 'Tirare con le scapole mantenendo il busto stabile.', 'RIR 2-3'),
      (v_day_a, 'spalle-alzate-laterali', 4, 2, 15, 12, 15, 45, null, 'Manubri leggeri, salita controllata.', 'RIR 2-3'),
      (v_day_a, 'core-plank', 5, 3, 1, null, null, 30, 30, 'Tenuta breve e precisa.', 'RIR 3');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body B', 'Trazione, femorali, braccia', 1, 60)
    returning id into v_day_b;

    insert into public.workout_template_exercises (
      template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      rest_seconds, duration_seconds, notes, rpe_rir
    ) values
      (v_day_b, 'dorso-pulley-basso', 1, 3, 12, 10, 12, 75, null, 'Busto fermo, gomiti vicino al corpo.', 'RIR 2-3'),
      (v_day_b, 'gambe-leg-curl', 2, 3, 12, 12, 15, 60, null, 'Controllo dei femorali senza slanci.', 'RIR 2-3'),
      (v_day_b, 'petto-chest-press', 3, 3, 12, 10, 12, 75, null, 'Carico moderato, traiettoria guidata.', 'RIR 2-3'),
      (v_day_b, 'bicipiti-curl-manubri', 4, 2, 12, 10, 12, 60, null, 'Manubri leggeri, gomiti fermi.', 'RIR 2-3'),
      (v_day_b, 'tricipiti-pushdown-cavo', 5, 2, 12, 10, 12, 60, null, 'Gomiti vicini al busto.', 'RIR 2-3');

    insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
    values (v_tpl, 'Full Body C', 'Gambe guidate, dorso, braccia', 2, 60)
    returning id into v_day_c;

    insert into public.workout_template_exercises (
      template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      rest_seconds, duration_seconds, notes, rpe_rir
    ) values
      (v_day_c, 'gambe-leg-press-45', 1, 3, 12, 10, 12, 90, null, 'Piedi stabili e controllo del range.', 'RIR 2-3'),
      (v_day_c, 'dorso-lat-machine-avanti', 2, 3, 12, 10, 12, 75, null, 'Trazione verticale controllata.', 'RIR 2-3'),
      (v_day_c, 'gambe-calf-raise', 3, 3, 15, 12, 15, 45, null, 'Pausa breve in alto.', 'RIR 2-3'),
      (v_day_c, 'bicipiti-curl-bilanciere', 4, 2, 12, 10, 12, 60, null, 'Movimento controllato, senza slancio.', 'RIR 2-3'),
      (v_day_c, 'core-plank', 5, 3, 1, null, null, 30, 30, 'Tenuta stabile.', 'RIR 3');
  end if;
end
$$;

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
  v_existing_status text;
  v_goal text;
  v_level text;
  v_location text;
  v_days integer;
  v_duration integer;
  v_exercise_level text;
  v_template_id uuid;
  v_final_plan_ids uuid[] := '{}';
  v_compatible_days_count integer;
  v_template_name text;
  v_template_day record;
  v_plan_status text := 'active';
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

  perform pg_advisory_xact_lock(hashtext(v_client_id::text));

  if not public._has_active_client_pro_entitlement(v_client_id) then
    raise exception 'CLIENT_PRO_REQUIRED: nessun piano Client Pro attivo';
  end if;

  select id, status
  into v_existing_cycle, v_existing_status
  from public.client_program_cycles
  where client_id = v_client_id
    and status = any(public._cycle_open_statuses())
  order by created_at desc
  limit 1;

  if v_existing_cycle is not null and v_existing_status <> 'pending_template' then
    return v_existing_cycle;
  end if;

  select client_mode, goals, experience_level, training_days_per_week
  into v_onboarding_mode, v_goals, v_experience, v_training_days
  from public.client_onboarding
  where client_id = v_client_id;

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
    if v_existing_cycle is not null then
      return v_existing_cycle;
    end if;

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
    from public.profiles
    where profiles.role = 'superadmin'
    on conflict do nothing;

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
    when 'Diventare piu'' forte' then 'Forza'
    when 'Diventare piÃ¹ forte' then 'Forza'
    when 'Migliorare i fondamentali' then 'Principianti'
    when 'Migliorare il condizionamento' then 'Performance'
    when 'Preparazione sportiva' then 'Performance'
    else 'Principianti'
  end;

  v_location := case v_profile.location when 'gym' then 'Palestra' when 'home' then 'Casa' else 'Palestra' end;
  v_days := coalesce(v_training_days, 3);
  v_duration := coalesce(v_profile.session_duration_minutes, 45);

  v_template_id := public._match_auto_template(v_goal, v_level, v_location, v_days, v_duration, null::uuid, v_profile.equipment_level);

  if v_template_id is null then
    v_decision_reason := 'NO_COMPATIBLE_TEMPLATE: nessun modello automatico compatibile con goal, livello, luogo, attrezzatura e giorni richiesti.';

    if v_existing_cycle is not null then
      update public.client_program_cycles
      set decision_reason = v_decision_reason,
          template_id = null,
          fitness_profile_snapshot = v_snapshot
      where id = v_existing_cycle
        and status = 'pending_template';
      return v_existing_cycle;
    end if;

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
    from public.profiles
    where profiles.role = 'superadmin'
    on conflict do nothing;

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

    if v_existing_cycle is not null then
      update public.client_program_cycles
      set decision_reason = v_decision_reason,
          template_id = v_template_id,
          fitness_profile_snapshot = v_snapshot
      where id = v_existing_cycle
        and status = 'pending_template';
      return v_existing_cycle;
    end if;

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
    from public.profiles
    where profiles.role = 'superadmin'
    on conflict do nothing;

    return v_cycle_id;
  end if;

  select name into v_template_name from public.workout_templates where id = v_template_id;
  v_decision_reason := 'Programma assegnato automaticamente in base a obiettivo, livello, luogo e giorni disponibili indicati nel questionario.';

  if v_existing_cycle is not null then
    v_cycle_id := v_existing_cycle;
  else
    insert into public.client_program_cycles (
      client_id, status, cycle_number, source, decision_reason, template_id, fitness_profile_snapshot, started_at, review_due_at, created_by
    ) values (
      v_client_id, 'active', 1, 'auto_initial', v_decision_reason, v_template_id, v_snapshot, current_date, current_date + 28, v_client_id
    ) returning id into v_cycle_id;
  end if;

  for v_template_day in
    select id, name
    from public.workout_template_days
    where template_id = v_template_id
    order by sort_order, created_at
  loop
    select wp.id
    into v_plan_id
    from public.client_program_cycle_plans cpp
    join public.workout_plans wp on wp.id = cpp.workout_plan_id
    where cpp.cycle_id = v_cycle_id
      and wp.template_id = v_template_id
      and wp.day_label = v_template_day.name
    order by wp.created_at
    limit 1;

    if v_plan_id is null then
      insert into public.workout_plans (
        coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin
      ) values (
        null, v_client_id, v_template_id, v_template_name || ' - ' || v_template_day.name,
        v_plan_status, current_date, current_date + interval '90 days', 'todo', v_template_day.name, 'auto_system'
      ) returning id into v_plan_id;

      insert into public.client_program_cycle_plans (cycle_id, workout_plan_id)
      values (v_cycle_id, v_plan_id)
      on conflict do nothing;
    end if;

    select id
    into v_day_id
    from public.workout_days
    where workout_plan_id = v_plan_id
    order by day_order, created_at
    limit 1;

    if v_day_id is null then
      insert into public.workout_days (workout_plan_id, day_order)
      values (v_plan_id, 1)
      returning id into v_day_id;
    end if;

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
      and not exists (
        select 1
        from public.workout_day_exercises existing
        where existing.workout_day_id = v_day_id
          and existing.exercise_id = wte.exercise_id
      )
    order by wte.exercise_order;

    v_final_plan_ids := array_append(v_final_plan_ids, v_plan_id);
  end loop;

  update public.client_program_cycles
  set status = 'active',
      decision_reason = v_decision_reason,
      template_id = v_template_id,
      fitness_profile_snapshot = v_snapshot,
      review_due_at = coalesce(review_due_at, current_date + 28),
      created_by = coalesce(created_by, v_client_id)
  where id = v_cycle_id
    and status in ('pending_template', 'active');

  perform public._generate_cycle_sessions(v_cycle_id, v_final_plan_ids);

  insert into public.app_notifications (recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (
    v_client_id, 'cliente', 'auto_program_assigned', 'Il tuo programma e'' pronto', v_decision_reason,
    jsonb_build_object('cycle_id', v_cycle_id, 'template_id', v_template_id),
    'auto_program_assigned:' || v_cycle_id::text
  )
  on conflict do nothing;

  return v_cycle_id;
end;
$function$;

revoke all on function public.assign_initial_auto_program() from public, anon;
grant execute on function public.assign_initial_auto_program() to authenticated;

do $$
declare
  v_tpl_id uuid;
  v_template_count integer;
  v_day_count integer;
  v_empty_day_count integer;
  v_missing_metadata_count integer;
  v_incompatible_count integer;
  v_duplicate_exercise_count integer;
  v_matched_template_id uuid;
begin
  select count(*)
  into v_template_count
  from public.workout_templates
  where is_system
    and auto_eligible
    and is_active
    and goal = 'Massa muscolare'
    and level = 'Principiante'
    and location = 'Palestra'
    and sessions_per_week = 3
    and name = 'Full Body Massa Principiante 3 giorni';

  if v_template_count <> 1 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: template_count atteso 1, trovato %', v_template_count;
  end if;

  select id
  into v_tpl_id
  from public.workout_templates
  where is_system
    and auto_eligible
    and is_active
    and goal = 'Massa muscolare'
    and level = 'Principiante'
    and location = 'Palestra'
    and sessions_per_week = 3
    and name = 'Full Body Massa Principiante 3 giorni'
  order by id
  limit 1;

  select count(*)
  into v_day_count
  from public.workout_template_days
  where template_id = v_tpl_id;

  if v_day_count <> 3 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: day_count atteso 3, trovato %', v_day_count;
  end if;

  select count(*)
  into v_empty_day_count
  from public.workout_template_days wtd
  where wtd.template_id = v_tpl_id
    and not exists (
      select 1 from public.workout_template_exercises wte where wte.template_day_id = wtd.id
    );

  if v_empty_day_count <> 0 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: contiene giorni vuoti';
  end if;

  select count(*)
  into v_missing_metadata_count
  from public.workout_template_days wtd
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
  where wtd.template_id = v_tpl_id
    and emm.exercise_id is null;

  if v_missing_metadata_count <> 0 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: contiene esercizi senza metadata attivo';
  end if;

  select count(*)
  into v_incompatible_count
  from public.workout_template_days wtd
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
  where wtd.template_id = v_tpl_id
    and (
      public._exercise_level_ordinal(emm.min_level) > public._exercise_level_ordinal('beginner')
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

  if v_incompatible_count <> 0 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: contiene esercizi non compatibili con Principiante/Palestra/full_gym';
  end if;

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

  if v_duplicate_exercise_count <> 0 then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: contiene esercizi duplicati nello stesso giorno';
  end if;

  v_matched_template_id := public._match_auto_template('Massa muscolare', 'Principiante', 'Palestra', 3, 60, null::uuid, 'full_gym');

  if v_matched_template_id is distinct from v_tpl_id then
    raise exception 'BEGINNER_MASS_TEMPLATE_AUDIT_FAILED: matcher atteso %, trovato %', v_tpl_id, v_matched_template_id;
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Diagnostica post-migration in transazione rollbackata.
select set_config('request.jwt.claim.sub','8545e649-87d8-4e9d-98f7-abbe0cc99fe3', true);
select set_config('role','authenticated', true);

insert into public.client_onboarding (
  client_id, client_mode, onboarding_completed, gender, goals, focus_areas, training_reasons,
  experience_level, training_days_per_week, weight_kg, height_cm, bmi, bmi_category, completed_at
) values (
  '981f182c-4c02-476e-bc2b-1215d43677e8', 'self_guided', true, 'unspecified',
  array['Costruire muscoli']::text[], array['full_body']::text[], array['health']::text[],
  'beginner', 3, 75, 175, 24.5, 'Normopeso', now()
);

insert into public.client_fitness_profile (
  client_id, age, location, equipment_level, session_duration_minutes, preferred_training_style,
  has_pain_or_limitation, pain_areas, requires_professional_supervision, completed, completed_at
) values (
  '981f182c-4c02-476e-bc2b-1215d43677e8', 35, 'gym', 'full_gym', 60, 'full_body',
  false, '{}'::text[], false, true, now()
);

insert into public.user_subscriptions (user_id, package_id, status, starts_at, expires_at, payment_provider, external_subscription_id)
select '981f182c-4c02-476e-bc2b-1215d43677e8', sp.id, 'active', now(), now() + interval '30 days', 'revenuecat', 'synthetic-rollback-20260816110000'
from public.subscription_packages sp
where sp.target_role='client' and sp.revenuecat_entitlement_id='client_pro' and sp.is_active
order by sp.duration_value
limit 1;

insert into public.client_program_cycles (
  client_id, status, cycle_number, source, decision_reason, fitness_profile_snapshot, started_at, created_by
) values (
  '981f182c-4c02-476e-bc2b-1215d43677e8', 'pending_template', 1, 'auto_initial',
  'NO_COMPATIBLE_TEMPLATE: test rollback', '{}'::jsonb, current_date, '981f182c-4c02-476e-bc2b-1215d43677e8'
);

create temp table verify_pending_before as
select id
from public.client_program_cycles
where client_id='981f182c-4c02-476e-bc2b-1215d43677e8'
  and status='pending_template'
order by created_at desc
limit 1;

select set_config('request.jwt.claim.sub','981f182c-4c02-476e-bc2b-1215d43677e8', true);
select set_config('role','authenticated', true);

create temp table verify_calls(first_cycle_id uuid, second_cycle_id uuid);
insert into verify_calls(first_cycle_id) select public.assign_initial_auto_program();
update verify_calls set second_cycle_id = public.assign_initial_auto_program();

select set_config('request.jwt.claim.sub','8545e649-87d8-4e9d-98f7-abbe0cc99fe3', true);
select set_config('role','authenticated', true);

create temp table verify_summary as
with duplicate_plans as (
  select cpp.cycle_id, wd.workout_plan_id, wde.exercise_id, count(*) as duplicate_count
  from public.client_program_cycle_plans cpp
  join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
  join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  group by cpp.cycle_id, wd.workout_plan_id, wde.exercise_id
)
  select
    pb.id as pending_cycle_id,
    vc.first_cycle_id,
    vc.second_cycle_id,
    pb.id = vc.first_cycle_id as reused_pending_cycle,
    vc.first_cycle_id = vc.second_cycle_id as retry_idempotent,
    wt.name as template_name,
    cpc.status as cycle_status,
    count(distinct cpp.workout_plan_id)::integer as plan_count,
    count(distinct wde.id)::integer as exercise_count,
    count(distinct cpcs.id)::integer as occurrence_count,
    count(distinct dp.workout_plan_id || ':' || dp.exercise_id) filter (where dp.duplicate_count > 1)::integer as duplicate_exercise_count,
    exists (
      select 1 from public.workout_plans wp2
      join public.client_program_cycle_plans cpp2 on cpp2.workout_plan_id = wp2.id
      where cpp2.cycle_id = vc.first_cycle_id and wp2.status='active'
    ) as workout_visible_immediately
  from verify_pending_before pb
  cross join verify_calls vc
  join public.client_program_cycles cpc on cpc.id = vc.first_cycle_id
  join public.workout_templates wt on wt.id = cpc.template_id
  left join public.client_program_cycle_plans cpp on cpp.cycle_id = cpc.id
  left join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
  left join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  left join public.client_program_cycle_sessions cpcs on cpcs.cycle_id = cpc.id
  left join duplicate_plans dp on dp.cycle_id = cpc.id and dp.workout_plan_id = cpp.workout_plan_id and dp.exercise_id = wde.exercise_id
  group by pb.id, vc.first_cycle_id, vc.second_cycle_id, wt.name, cpc.status;

update public.user_subscriptions
set status = 'expired',
    expires_at = now() - interval '1 minute'
where user_id = '981f182c-4c02-476e-bc2b-1215d43677e8'
  and external_subscription_id = 'synthetic-rollback-20260816110000';

select set_config('request.jwt.claim.sub','981f182c-4c02-476e-bc2b-1215d43677e8', true);
select set_config('role','authenticated', true);

create temp table verify_expired_client_pro(error_message text);
do $$
begin
  perform public.assign_initial_auto_program();
  insert into verify_expired_client_pro(error_message) values ('UNEXPECTED_SUCCESS');
exception
  when others then
    insert into verify_expired_client_pro(error_message) values (SQLERRM);
end
$$;

select set_config('request.jwt.claim.sub','8545e649-87d8-4e9d-98f7-abbe0cc99fe3', true);
select set_config('role','authenticated', true);

select jsonb_build_object(
  'debug_counts', jsonb_build_object(
    'pending_before_count', (select count(*) from verify_pending_before),
    'summary_count', (select count(*) from verify_summary),
    'cycles_after_retry', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status, 'template_id', template_id, 'decision_reason', decision_reason)), '[]'::jsonb)
      from public.client_program_cycles
      where client_id='981f182c-4c02-476e-bc2b-1215d43677e8'
    ),
    'plan_links', (
      select count(*)
      from public.client_program_cycle_plans cpp
      join public.client_program_cycles cpc on cpc.id = cpp.cycle_id
      where cpc.client_id='981f182c-4c02-476e-bc2b-1215d43677e8'
    ),
    'sessions', (
      select count(*)
      from public.client_program_cycle_sessions cpcs
      join public.client_program_cycles cpc on cpc.id = cpcs.cycle_id
      where cpc.client_id='981f182c-4c02-476e-bc2b-1215d43677e8'
    )
  ),
  'retry_summary', (select to_jsonb(vs) from verify_summary vs),
  'expired_client_pro_retry', (select to_jsonb(v) from verify_expired_client_pro v),
  'template', (
    select to_jsonb(t)
    from (
      select
        wt.name,
        wt.goal,
        wt.level,
        wt.location,
        wt.sessions_per_week,
        wt.equipment,
        wt.is_system,
        wt.is_active,
        wt.auto_eligible,
        count(distinct wtd.id)::integer as day_count,
        count(wte.id)::integer as template_exercise_count,
        public._match_auto_template('Massa muscolare','Principiante','Palestra',3,60,null::uuid,'full_gym') as matched_template_id,
        wt.id as expected_template_id
      from public.workout_templates wt
      left join public.workout_template_days wtd on wtd.template_id = wt.id
      left join public.workout_template_exercises wte on wte.template_day_id = wtd.id
      where wt.name = 'Full Body Massa Principiante 3 giorni'
      group by wt.id
    ) t
  ),
  'exercises', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.day_sort_order, x.exercise_order), '[]'::jsonb)
    from (
      select
        wtd.sort_order as day_sort_order,
        wtd.name as day_name,
        wte.exercise_order,
        wte.exercise_id,
        coalesce(e.name, wte.exercise_id) as exercise_name,
        emm.min_level,
        emm.compatible_locations,
        emm.equipment_tag,
        emm.is_active as metadata_active
      from public.workout_templates wt
      join public.workout_template_days wtd on wtd.template_id = wt.id
      join public.workout_template_exercises wte on wte.template_day_id = wtd.id
      left join public.exercises e on e.id::text = wte.exercise_id
      left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id
      where wt.name = 'Full Body Massa Principiante 3 giorni'
    ) x
  )
) as audit_result;

ROLLBACK;
