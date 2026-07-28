-- Fix isolato trovato eseguendo per la prima volta il ciclo completo
-- force_cycle_decision -> cancel_pending_review -> nuovo tentativo con un
-- account sintetico: dopo l'annullamento, la vecchia review (mai
-- cancellata: e' storico) resta con decision <> 'insufficient_data', quindi
-- il controllo ALREADY_REVIEWED la trovava sempre e bloccava per sempre
-- qualunque nuovo tentativo sullo stesso ciclo -- l'intera "finestra di
-- annullamento" di superadmin_cancel_pending_review risultava inutilizzabile
-- nella pratica. Corretto: una review conta come "gia' definitiva" solo se
-- il suo next_cycle_id (quando presente) NON punta a un ciclo 'cancelled'
-- -- l'unico modo in cui un ciclo referenziato come next_cycle_id di una
-- review puo' diventare 'cancelled' e' proprio
-- superadmin_cancel_pending_review, quindi la condizione individua
-- esattamente e solo le review annullate. Nessun'altra modifica.
create or replace function public.superadmin_force_cycle_decision(
  p_cycle_id uuid, p_decision text, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cycle public.client_program_cycles%rowtype;
  v_checkin public.client_monthly_checkins%rowtype;
  v_client_id uuid;
  v_config_version integer;
  v_max_load_increase_ratio numeric;
  v_max_added_sets_per_exercise numeric;
  v_max_exercise_change_ratio numeric;
  v_all_exercises jsonb := '[]'::jsonb;
  v_ex record;
  v_trend text;
  v_total_exercises integer := 0;
  v_review_id uuid;
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
  v_max_replacements integer;
  v_replaced_so_far integer := 0;
  v_delta numeric;
  v_override_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' forzare una decisione di ciclo';
  end if;
  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'NOTES_REQUIRED: motivo obbligatorio';
  end if;
  if p_decision not in ('progress', 'maintain', 'regress', 'partial_change') then
    raise exception 'INVALID_DECISION: decisione non valida (progress, maintain, regress, partial_change)';
  end if;

  select * into v_cycle from public.client_program_cycles where id = p_cycle_id for update;
  if not found then
    raise exception 'NOT_FOUND: ciclo non trovato';
  end if;
  if v_cycle.status <> all(array['active', 'checkin_due', 'review_pending']::text[]) then
    raise exception 'INVALID_STATE: il ciclo non e'' in uno stato idoneo alla forzatura (stato attuale: %, usare resolve_safety_review/resolve_pending_template per gli stati bloccati)', v_cycle.status;
  end if;
  v_client_id := v_cycle.client_id;

  -- FIX (questa migration): esclude le review il cui next_cycle_id e' stato
  -- annullato da superadmin_cancel_pending_review.
  if exists (
    select 1 from public.client_cycle_reviews r
    where r.cycle_id = v_cycle.id and r.decision <> 'insufficient_data'
      and not exists (
        select 1 from public.client_program_cycles nc
        where nc.id = r.next_cycle_id and nc.status = 'cancelled'
      )
  ) then
    raise exception 'ALREADY_REVIEWED: questo ciclo ha gia'' una decisione definitiva, usare cancel_pending_review per correggere';
  end if;

  select * into v_checkin from public.client_monthly_checkins
  where cycle_id = v_cycle.id and status in ('submitted', 'locked')
  order by updated_at desc limit 1;
  if not found then
    raise exception 'CHECKIN_REQUIRED: nessun check-in mensile sottomesso per questo ciclo';
  end if;
  if v_checkin.has_pain_or_limitation or v_checkin.requires_professional_supervision then
    raise exception 'SAFETY_FLAGGED: il check-in segnala dolore/limitazione, usare superadmin_resolve_safety_review';
  end if;

  v_config_version := public._active_review_config_version();
  v_max_load_increase_ratio := public._review_config_value('max_load_increase_ratio', v_config_version);
  v_max_added_sets_per_exercise := public._review_config_value('max_added_sets_per_exercise', v_config_version);
  v_max_exercise_change_ratio := public._review_config_value('max_exercise_change_ratio', v_config_version);

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
        avg(eph.perceived_effort) as avg_rpe, count(*) as n_points, bool_or(coalesce(eph.has_pain,false)) as any_pain
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
    elsif v_ex.avg_rpe is not null and v_ex.avg_rpe >= public._review_config_value('trend_rpe_high', v_config_version) then
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

  insert into public.client_cycle_reviews(
    cycle_id, checkin_id, decision, decision_reason, eligibility_result,
    previous_template_id, next_template_id, config_version, algorithm_version, origin, reviewed_at
  ) values (
    v_cycle.id, v_checkin.id, p_decision, coalesce(p_notes, 'Decisione forzata dal Superadmin.'), 'eligible',
    v_cycle.template_id, v_cycle.template_id, v_config_version, 1, 'superadmin', now()
  ) returning id into v_review_id;

  update public.client_program_cycles
  set status = 'completed', completed_at = now()
  where id = v_cycle.id;

  insert into public.client_program_cycles(
    client_id, status, cycle_number, previous_cycle_id, source, decision_reason, template_id,
    fitness_profile_snapshot, started_at, review_due_at, created_by, config_version, algorithm_version
  ) values (
    v_client_id, 'active', v_cycle.cycle_number + 1, v_cycle.id, 'superadmin_override', p_notes,
    v_cycle.template_id, v_cycle.fitness_profile_snapshot, current_date,
    current_date + coalesce(public._review_config_value('nominal_cycle_days', v_config_version), 28)::integer,
    auth.uid(), v_config_version, 1
  ) returning id into v_new_cycle_id;

  v_max_replacements := floor(v_total_exercises * v_max_exercise_change_ratio);

  for v_old_plan in
    select wp.* from public.client_program_cycle_plans cpp
    join public.workout_plans wp on wp.id = cpp.workout_plan_id
    where cpp.cycle_id = v_cycle.id
    order by wp.day_label
  loop
    insert into public.workout_plans(coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
    values (null, v_client_id, v_cycle.template_id, v_old_plan.name, 'active', current_date, current_date + 90, 'todo', v_old_plan.day_label, 'auto_system')
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
      case when p_decision = 'partial_change' then
        case
          when t.trend = 'blocked_safety' then 4
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

    if p_decision = 'partial_change' and v_replaced_so_far < v_max_replacements and (
         v_item.trend = 'blocked_safety' or v_item.trend = 'stable' or v_item.role = 'accessory'
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
        v_reason := 'Esercizio sostituito per decisione forzata del Superadmin.';
      end if;
    elsif p_decision = 'progress' and v_item.trend in ('positive','stable') then
      if v_item.reps_max is not null and v_item.reps < v_item.reps_max then
        v_new_reps := v_item.reps + 1;
        v_action := 'progressed';
        v_reason := 'Aumento ripetizioni (decisione forzata).';
      elsif v_item.target_weight is not null then
        v_new_weight := public._round_load_increment(v_item.target_weight, v_max_load_increase_ratio, v_item.equipment_tag);
        if v_new_weight is distinct from v_item.target_weight then
          v_action := 'progressed';
          v_reason := 'Aumento carico (decisione forzata, max 10%).';
        end if;
      elsif v_max_added_sets_per_exercise >= 1 then
        v_new_sets := v_item.sets + 1;
        v_action := 'progressed';
        v_reason := 'Aggiunta di una serie (decisione forzata).';
      elsif v_item.rest_seconds is not null and v_item.rest_seconds > 45 then
        v_new_rest := v_item.rest_seconds - 15;
        v_action := 'progressed';
        v_reason := 'Riduzione controllata del recupero (decisione forzata).';
      end if;
    elsif p_decision = 'regress' then
      if v_item.target_weight is not null then
        v_delta := public._round_load_increment(v_item.target_weight, v_max_load_increase_ratio, v_item.equipment_tag) - v_item.target_weight;
        if v_delta > 0 then
          v_new_weight := greatest(0, v_item.target_weight - v_delta);
          v_action := 'regressed';
          v_reason := 'Riduzione carico (decisione forzata).';
        end if;
      elsif v_item.sets > 1 then
        v_new_sets := v_item.sets - 1;
        v_action := 'regressed';
        v_reason := 'Riduzione di una serie (decisione forzata).';
      elsif v_item.rest_seconds is not null then
        v_new_rest := v_item.rest_seconds + 15;
        v_action := 'regressed';
        v_reason := 'Aumento del recupero (decisione forzata).';
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
      previous_parameters, new_parameters, origin, override_author
    ) values (
      v_client_id, v_review_id, v_cycle.id, v_new_cycle_id, v_item.exercise_id, v_new_exercise_id, v_action,
      coalesce(v_reason, 'Nessuna variazione (decisione forzata dal Superadmin).'),
      jsonb_build_object('sets',v_item.sets,'reps',v_item.reps,'reps_min',v_item.reps_min,'reps_max',v_item.reps_max,'target_weight',v_item.target_weight,'rest_seconds',v_item.rest_seconds),
      jsonb_build_object('sets',v_new_sets,'reps',v_new_reps,'reps_min',v_item.reps_min,'reps_max',v_item.reps_max,'target_weight',v_new_weight,'rest_seconds',v_new_rest),
      'superadmin_override', auth.uid()
    );

    if v_action = 'kept' then v_kept_count := v_kept_count + 1;
    elsif v_action = 'replaced' then v_replaced_count := v_replaced_count + 1;
    end if;
  end loop;

  insert into public.client_program_cycle_plans(cycle_id, workout_plan_id)
  select v_new_cycle_id, unnest(v_new_plan_ids);

  update public.client_monthly_checkins set status = 'locked', locked_at = now() where id = v_checkin.id;

  insert into public.superadmin_program_overrides(
    superadmin_id, client_id, cycle_id, action, notes, payload, entity_type, entity_id, previous_value, new_value, review_id, status
  ) values (
    auth.uid(), v_client_id, v_cycle.id, 'force_cycle_decision', p_notes,
    jsonb_build_object('decision', p_decision, 'new_cycle_id', v_new_cycle_id),
    'cycle', v_cycle.id, jsonb_build_object('status', v_cycle.status), jsonb_build_object('decision', p_decision, 'new_cycle_id', v_new_cycle_id),
    v_review_id, 'applied'
  ) returning id into v_override_id;

  update public.client_cycle_reviews
  set next_cycle_id = v_new_cycle_id, superadmin_override_id = v_override_id,
      exercises_kept_count = v_kept_count, exercises_replaced_count = v_replaced_count
  where id = v_review_id;

  insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (
    v_client_id, 'cliente', 'auto_program_override_applied', 'Il tuo programma e'' stato aggiornato',
    coalesce(p_notes, 'Decisione applicata dal Superadmin dopo revisione.'),
    jsonb_build_object('cycle_id', v_cycle.id, 'next_cycle_id', v_new_cycle_id, 'decision', p_decision),
    'auto_program_override_applied:' || v_override_id::text
  )
  on conflict do nothing;

  return v_new_cycle_id;
end;
$function$;
