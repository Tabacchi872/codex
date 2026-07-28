-- fix: _compute_cycle_progress_metrics usava i giorni di CALENDARIO
-- trascorsi da started_at per calcolare le settimane trascorse (e quindi
-- sessions_expected) — un cliente con l'abbonamento scaduto/sospeso o un
-- coach assegnato per una parte del ciclo veniva penalizzato come se in
-- quei giorni avesse dovuto allenarsi. Ora usa
-- _compute_effective_active_days (nuovo ledger, migration precedente),
-- che esclude per costruzione qualunque giorno non effettivamente
-- utilizzabile. Richiama _sync_cycle_active_period all'inizio per
-- garantire che il ledger sia aggiornato al momento esatto della lettura
-- (difesa in profondita': i trigger della migration precedente dovrebbero
-- gia' tenerlo aggiornato in tempo reale, ma questa funzione e' l'unico
-- punto che legge il dato per una decisione, quindi non si fida
-- ciecamente di aver ricevuto ogni evento).
--
-- Nessun'altra modifica alla funzione: sessions_completed, primary_total,
-- primary_evaluable restano identici (contano sessioni/esercizi REALMENTE
-- registrati, mai giorni di calendario).
create or replace function public._compute_cycle_progress_metrics(p_cycle_id uuid)
 returns table(sessions_expected integer, sessions_completed integer, completion_ratio numeric, primary_total integer, primary_evaluable integer, evaluable_ratio numeric)
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
  v_effective_days integer;
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

  perform public._sync_cycle_active_period(p_cycle_id);

  v_config_version := public._active_review_config_version();
  v_nominal_days := public._review_config_value('nominal_cycle_days', v_config_version);

  select count(distinct wp.id) into v_days_per_week
  from public.client_program_cycle_plans cpp
  join public.workout_plans wp on wp.id = cpp.workout_plan_id
  where cpp.cycle_id = p_cycle_id;

  v_effective_days := public._compute_effective_active_days(p_cycle_id);
  v_weeks_elapsed := greatest(1, ceil(least(v_effective_days::numeric, v_nominal_days) / 7.0));
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
