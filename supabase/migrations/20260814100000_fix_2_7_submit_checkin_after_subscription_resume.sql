-- Fix (scoperto nella campagna di test 2.7, completando dal vivo il fix
-- del ripristino abbonamento): submit_monthly_checkin considerava
-- "gia' recensito" (ALREADY_REVIEWED) qualunque riga client_cycle_reviews
-- con decision <> 'insufficient_data' esistente per il ciclo — inclusa una
-- vecchia review 'blocked_subscription' lasciata da una pausa gia'
-- risolta dal rientro in STEP 6 di run_cycle_review. Un cliente appena
-- rientrato da 'paused_subscription' (stato di nuovo valido: 'active') non
-- poteva quindi inviare il nuovo check-in richiesto per completare la
-- ripresa: ALREADY_REVIEWED bloccava la richiesta nonostante il ciclo non
-- avesse alcuna decisione definitiva sul PROGRAMMA (solo il record di
-- pausa, gia' risolto). Fix: 'blocked_subscription' esce dal controllo
-- esattamente come 'insufficient_data' — e' un blocco temporaneo dovuto
-- all'abbonamento, mai una decisione definitiva sul programma. Il gate
-- sullo stato del ciclo poche righe sopra (solo active/checkin_due/
-- review_pending ammessi) resta la protezione principale: un ciclo con una
-- decisione VERAMENTE definitiva (progress/maintain/regress/ecc.) non
-- puo' comunque trovarsi in uno di questi tre stati.
create or replace function public.submit_monthly_checkin(p_cycle_id uuid, p_perceived_difficulty text default null::text, p_sessions_completed_estimate integer default null::integer, p_has_pain_or_limitation boolean default false, p_pain_areas text[] default '{}'::text[], p_pain_notes text default null::text, p_requires_professional_supervision boolean default false, p_wants_to_continue boolean default true, p_available_minutes integer default null::integer, p_goal_changed_to text default null::text, p_variety_preference text default null::text, p_liked_exercise_ids text[] default '{}'::text[], p_disliked_exercise_ids text[] default '{}'::text[], p_notes text default null::text, p_perceived_fatigue text default null::text, p_recovery_quality text default null::text, p_satisfaction text default null::text, p_available_days_per_week integer default null::integer, p_location text default null::text, p_equipment_level text default null::text, p_equipment_no_longer_available text[] default '{}'::text[], p_equipment_newly_available text[] default '{}'::text[], p_main_skip_reason text default null::text, p_submit boolean default false)
 returns client_monthly_checkins
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

  -- FIX (questa migration): 'blocked_subscription' esclusa, stesso principio
  -- gia' applicato a 'insufficient_data' — non e' una decisione definitiva
  -- sul programma, e' un blocco temporaneo per abbonamento gia' risolto (il
  -- gate sullo stato sopra garantisce comunque che un ciclo con una vera
  -- decisione definitiva non possa trovarsi qui).
  if exists (
    select 1 from public.client_cycle_reviews
    where cycle_id = p_cycle_id and decision <> all(array['insufficient_data','blocked_subscription']::text[])
  ) then
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
