-- fix: blocca la modifica delle schede completate lato server.
--
-- Audit richiesto esplicitamente ("l'audit ha confermato che
-- update_workout_session_progress blocca correttamente i workout completati,
-- ma public.save_workout_plan consente ancora di modificare una scheda con
-- session_status='completed'"): verificato che il ramo UPDATE di
-- save_workout_plan (editor strutturale nome/date/esercizi/serie/
-- ripetizioni/recupero/note) non ha MAI controllato lo stato della sessione
-- prima di scrivere — a differenza di update_workout_session_progress, che
-- lo fa gia' dal 2026-07-20/21 (harden_exercise_progress_completion_lock.sql,
-- require_active_link_for_coach_session_progress.sql). Nessuna eccezione per
-- il coach: una scheda completed deve restare interamente read-only, sia via
-- RPC sia via un eventuale UPDATE diretto su public.workout_plans.

-- === 1) save_workout_plan: controllo nel ramo UPDATE, prima di qualunque
-- scrittura ==================================================================
-- Stessa firma e stesso tipo di ritorno (returns uuid) della versione
-- precedente: CREATE OR REPLACE e' sufficiente, nessun DROP FUNCTION
-- necessario. Unica modifica: nel ramo UPDATE (payload->>'id' valido), prima
-- di lanciare la UPDATE su workout_plans, si legge lo stato attuale della
-- riga (stessa condizione id+coach_id gia' usata dalla UPDATE originale, che
-- funge anche da controllo "non trovata/non di proprieta'"). Se la sessione
-- risulta gia' 'completed', la funzione fallisce con WORKOUT_LOCKED PRIMA di
-- toccare nome/date/status/esercizi — nessuna riga viene scritta. Il ramo
-- INSERT (nuova scheda) resta invariato: una scheda appena creata non puo'
-- mai essere gia' completed.
create or replace function public.save_workout_plan(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_coach_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_day_id uuid;
  v_status text;
  v_start_date date;
  v_expiry_date date;
  v_exercise jsonb;
  v_seen_ids uuid[] := '{}';
  v_ex_id uuid;
  v_current_session_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  v_coach_id := case when public.is_valid_uuid(payload->>'coach_id') then (payload->>'coach_id')::uuid else null end;
  v_client_id := case when public.is_valid_uuid(payload->>'client_id') then (payload->>'client_id')::uuid else null end;

  if v_coach_id is null or v_client_id is null then
    raise exception 'INVALID_PAYLOAD: coach_id o client_id mancante o non valido';
  end if;
  if v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il coach proprietario di questa scheda';
  end if;
  if not public.is_superadmin() and not public.is_coach_for_client(v_client_id) then
    raise exception 'NOT_YOUR_CLIENT: il cliente indicato non risulta collegato a questo coach';
  end if;

  v_start_date := (payload->>'start_date')::date;
  v_expiry_date := (payload->>'expiry_date')::date;
  if v_start_date is null or v_expiry_date is null then
    raise exception 'INVALID_PAYLOAD: data allenamento o scadenza mancante';
  end if;

  v_template_id := case when public.is_valid_uuid(payload->>'template_id') then (payload->>'template_id')::uuid else null end;

  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  if public.is_valid_uuid(payload->>'id') then
    v_plan_id := (payload->>'id')::uuid;

    select session_status into v_current_session_status
    from public.workout_plans
    where id = v_plan_id and coach_id = v_coach_id;

    if v_current_session_status is null then
      raise exception 'NOT_FOUND: scheda non trovata o non di proprieta'' di questo coach';
    end if;
    if v_current_session_status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
    end if;

    update public.workout_plans set
      client_id = v_client_id,
      template_id = v_template_id,
      name = payload->>'name',
      status = v_status,
      start_date = v_start_date,
      expiry_date = v_expiry_date,
      scheduled_time = nullif(payload->>'scheduled_time', ''),
      session_status = coalesce(nullif(payload->>'session_status', ''), 'todo'),
      day_label = nullif(payload->>'day_label', ''),
      week_label = nullif(payload->>'week_label', ''),
      subscription_id = nullif(payload->>'subscription_id', '')
    where id = v_plan_id and coach_id = v_coach_id
    returning id into v_plan_id;
  else
    insert into public.workout_plans (
      coach_id, client_id, template_id, name, status, start_date, expiry_date,
      scheduled_time, session_status, day_label, week_label, subscription_id
    ) values (
      v_coach_id, v_client_id, v_template_id, payload->>'name', v_status,
      v_start_date, v_expiry_date, nullif(payload->>'scheduled_time', ''),
      coalesce(nullif(payload->>'session_status', ''), 'todo'), nullif(payload->>'day_label', ''),
      nullif(payload->>'week_label', ''), nullif(payload->>'subscription_id', '')
    )
    returning id into v_plan_id;
  end if;

  select id into v_day_id from public.workout_days where workout_plan_id = v_plan_id and day_order = 1;
  if v_day_id is null then
    insert into public.workout_days (workout_plan_id, day_order) values (v_plan_id, 1) returning id into v_day_id;
  end if;

  for v_exercise in select * from jsonb_array_elements(coalesce(payload->'exercises', '[]'::jsonb))
  loop
    if public.is_valid_uuid(v_exercise->>'id') then
      v_ex_id := (v_exercise->>'id')::uuid;
      update public.workout_day_exercises set
        exercise_id = v_exercise->>'exercise_id',
        exercise_order = (v_exercise->>'exercise_order')::integer,
        sets = (v_exercise->>'sets')::integer,
        reps = (v_exercise->>'reps')::integer,
        reps_min = nullif(v_exercise->>'reps_min', '')::integer,
        reps_max = nullif(v_exercise->>'reps_max', '')::integer,
        target_weight = nullif(v_exercise->>'target_weight', '')::numeric,
        rest_seconds = (v_exercise->>'rest_seconds')::integer,
        notes = coalesce(v_exercise->>'notes', ''),
        technique_type = coalesce(nullif(v_exercise->>'technique_type', ''), 'normal'),
        superset_group_id = nullif(v_exercise->>'superset_group_id', ''),
        rpe_rir = coalesce(nullif(v_exercise->>'rpe_rir', ''), rpe_rir)
      where id = v_ex_id and workout_day_id = v_day_id
      returning id into v_ex_id;

      if v_ex_id is null then
        raise exception 'INVALID_PAYLOAD: esercizio scheda non trovato per aggiornamento';
      end if;
    else
      insert into public.workout_day_exercises (
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        target_weight, rest_seconds, notes, technique_type, superset_group_id, rpe_rir
      ) values (
        v_day_id, v_exercise->>'exercise_id', (v_exercise->>'exercise_order')::integer,
        (v_exercise->>'sets')::integer, (v_exercise->>'reps')::integer,
        nullif(v_exercise->>'reps_min', '')::integer, nullif(v_exercise->>'reps_max', '')::integer,
        nullif(v_exercise->>'target_weight', '')::numeric, (v_exercise->>'rest_seconds')::integer,
        coalesce(v_exercise->>'notes', ''), coalesce(nullif(v_exercise->>'technique_type', ''), 'normal'),
        nullif(v_exercise->>'superset_group_id', ''), nullif(v_exercise->>'rpe_rir', '')
      )
      returning id into v_ex_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_ex_id);
  end loop;

  delete from public.workout_day_exercises
  where workout_day_id = v_day_id
    and (array_length(v_seen_ids, 1) is null or id <> all (v_seen_ids));

  update public.workout_plans set updated_at = now() where id = v_plan_id;

  return v_plan_id;
end;
$$;

-- === 2) Difesa in profondita': blocca anche un UPDATE diretto su
-- workout_plans (bypass di save_workout_plan via PostgREST/REST diretto) ===
-- Verificato che NESSUN percorso legittimo puo' essere spezzato da questo
-- trigger:
--   - save_workout_plan: con il fix sopra, il proprio ramo UPDATE non arriva
--     mai a scrivere una riga il cui OLD.session_status e' gia' 'completed'
--     (la funzione fallisce prima); il tocco finale
--     "update workout_plans set updated_at = now()" e' quindi anch'esso mai
--     raggiunto per una scheda gia' completata.
--   - update_workout_session_progress: esegue UNA SOLA update su
--     workout_plans per chiamata, e la esegue solo dopo aver gia' verificato
--     esplicitamente "if v_plan.session_status = 'completed' then raise
--     WORKOUT_LOCKED" — quindi OLD.session_status a quella riga non e' mai
--     'completed' quando la propria update parte, incluso il caso in cui
--     quella stessa chiamata sta transitando lo stato A 'completed' (la
--     transizione pending/in_progress -> completed resta permessa, come
--     richiesto: il trigger valuta OLD, non NEW).
-- Il trigger NON e' security definer: non deve bypassare la RLS, deve solo
-- osservare OLD/NEW della riga che l'update in corso sta gia' toccando.
create or replace function public.prevent_completed_workout_plan_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.session_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_plan_edit() from public, anon, authenticated;

drop trigger if exists workout_plans_prevent_completed_edit on public.workout_plans;
create trigger workout_plans_prevent_completed_edit
before update on public.workout_plans
for each row
execute function public.prevent_completed_workout_plan_edit();

-- === Nota: perche' workout_days/workout_day_exercises NON sono stati
-- toccati in questa migration =============================================
-- Estendere la RLS (o un trigger analogo) su queste due tabelle per
-- rifiutare scritture quando il piano genitore e' 'completed' e' stato
-- valutato e SCARTATO: update_workout_session_progress, quando completa
-- davvero una sessione (p_session_status='completed'), esegue PRIMA
-- l'update su workout_plans (che porta session_status a 'completed') e SOLO
-- DOPO, nella stessa chiamata/transazione, l'update di
-- workout_day_exercises.completed per gli esercizi svolti. Una policy o un
-- trigger che rifiuti scritture su workout_day_exercises quando il piano
-- genitore risulta gia' 'completed' (letto in quel momento, quindi gia'
-- aggiornato dalla riga precedente della stessa funzione) romperebbe
-- esattamente questo flusso legittimo. Il rischio residuo — un UPDATE/DELETE
-- diretto via PostgREST su workout_day_exercises/workout_days che bypassa
-- save_workout_plan — resta noto e non chiuso da questa migration; vedi
-- ESITO del task per la raccomandazione esplicita di un intervento distinto
-- e piu' ampio (richiede distinguere "scrittura da update_workout_session_
-- progress" da "scrittura da un editor strutturale diretto", oggi non
-- rappresentabile con una singola condizione RLS).

notify pgrst, 'reload schema';
