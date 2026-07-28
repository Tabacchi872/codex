-- Fix isolato trovato eseguendo per la prima volta
-- superadmin_replace_single_exercise() con un account sintetico: la tabella
-- client_cycle_exercise_transitions ha un trigger
-- (validate_cycle_exercise_transition_client, gia' esistente dal
-- sotto-blocco 2.1) che richiede SEMPRE un review_id valido, appartenente
-- allo stesso client_id dichiarato -- la funzione non lo passava (una
-- sostituzione singola non e' l'esito di una review), quindi ogni chiamata
-- falliva con CROSS_CLIENT_REFERENCE. Non e' corretto inventare una review
-- fittizia solo per soddisfare il trigger: la sostituzione di un singolo
-- esercizio non e' un evento di revisione. Corretto rimuovendo l'insert in
-- client_cycle_exercise_transitions (quella tabella resta scoped agli
-- eventi guidati da una review reale, come da trigger); l'audit completo
-- (autore/timestamp/motivo/valore precedente-nuovo/entita'/stato) resta
-- comunque interamente garantito da superadmin_program_overrides, che non
-- ha questo vincolo e gia' contiene tutti i campi richiesti. entity_id
-- ora punta direttamente alla riga workout_day_exercises modificata.
create or replace function public.superadmin_replace_single_exercise(
  p_workout_plan_id uuid, p_old_exercise_id text, p_new_exercise_id text, p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.workout_plans%rowtype;
  v_day_id uuid;
  v_wde public.workout_day_exercises%rowtype;
  v_cycle_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' sostituire un esercizio';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'NOTES_REQUIRED: motivo obbligatorio';
  end if;
  if p_old_exercise_id = p_new_exercise_id then
    raise exception 'INVALID_PAYLOAD: esercizio sostitutivo identico a quello attuale';
  end if;

  select * into v_plan from public.workout_plans where id = p_workout_plan_id;
  if not found then
    raise exception 'NOT_FOUND: scheda non trovata';
  end if;
  if v_plan.origin <> 'auto_system' then
    raise exception 'INVALID_STATE: questa RPC gestisce solo schede del sistema automatico (origin=auto_system)';
  end if;
  if not exists (select 1 from public.exercise_movement_metadata where exercise_id = p_new_exercise_id and is_active) then
    raise exception 'INVALID_EXERCISE: esercizio sostitutivo non valido';
  end if;

  select id into v_day_id from public.workout_days where workout_plan_id = p_workout_plan_id limit 1;
  select * into v_wde from public.workout_day_exercises where workout_day_id = v_day_id and exercise_id = p_old_exercise_id;
  if not found then
    raise exception 'NOT_FOUND: esercizio da sostituire non presente in questa scheda';
  end if;
  if exists (select 1 from public.workout_day_exercises where workout_day_id = v_day_id and exercise_id = p_new_exercise_id) then
    raise exception 'ALREADY_PRESENT: l''esercizio sostitutivo e'' gia'' presente in questo giorno';
  end if;

  update public.workout_day_exercises set exercise_id = p_new_exercise_id where id = v_wde.id;

  select cycle_id into v_cycle_id from public.client_program_cycle_plans where workout_plan_id = p_workout_plan_id limit 1;

  insert into public.superadmin_program_overrides(
    superadmin_id, client_id, cycle_id, action, notes, payload, entity_type, entity_id, previous_value, new_value, status
  ) values (
    auth.uid(), v_plan.client_id, v_cycle_id, 'replace_single_exercise', p_reason,
    jsonb_build_object('workout_plan_id', p_workout_plan_id, 'old_exercise_id', p_old_exercise_id, 'new_exercise_id', p_new_exercise_id),
    'exercise_transition', v_wde.id,
    jsonb_build_object('exercise_id', p_old_exercise_id), jsonb_build_object('exercise_id', p_new_exercise_id),
    'applied'
  );

  insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (
    v_plan.client_id, 'cliente', 'auto_program_override_applied', 'Un esercizio e'' stato sostituito',
    p_reason, jsonb_build_object('workout_plan_id', p_workout_plan_id, 'old_exercise_id', p_old_exercise_id, 'new_exercise_id', p_new_exercise_id),
    'auto_program_override_applied:exercise:' || v_wde.id::text
  )
  on conflict do nothing;
end;
$function$;
