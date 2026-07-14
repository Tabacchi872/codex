create or replace function public.is_valid_uuid(value text)
returns boolean
language sql
immutable
as $$
  select value is not null and value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Salvataggio atomico multi-tabella (workout_plans + workout_days +
-- workout_day_exercises): SECURITY DEFINER, un solo statement PL/pgSQL per
-- chiamata, quindi o va tutto a buon fine o (in caso di eccezione) NIENTE
-- viene scritto â€” nessuna scheda parzialmente salvata. Autorizzazione
-- verificata esplicitamente (bypassa la RLS, deve rifarla a mano): il
-- chiamante deve essere il coach proprietario (o superadmin) E il cliente
-- indicato deve essere davvero collegato a quel coach.
--
-- payload atteso (jsonb): { id?, coach_id, client_id, template_id?, name,
-- start_date, expiry_date, scheduled_time?, session_status?, day_label?,
-- week_label?, subscription_id?, exercises: [{ id?, exercise_id,
-- exercise_order, sets, reps, reps_min?, reps_max?, target_weight?,
-- rest_seconds, notes?, technique_type?, superset_group_id? }] }.
-- Un id di scheda/esercizio assente, vuoto O NON UN UUID VALIDO (2026-07-14:
-- prima si controllava solo "assente o vuoto", non il formato â€” vedi
-- is_valid_uuid sopra) = nuova riga; un UUID valido = aggiornamento
-- in-place. Qualunque riga workout_day_exercises esistente NON ricomparsa
-- nel payload viene eliminata (l'editor invia sempre la lista COMPLETA e
-- aggiornata degli esercizi, mai un delta). exercise_id (l'ESERCIZIO, non la
-- riga) resta SEMPRE testo libero, mai validato/castato come uuid: puo'
-- essere un id locale dei 44 storici, un UUID Supabase custom/ymove â€” vedi
-- commento sulla tabella workout_day_exercises piu' sopra.
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
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  -- coach_id/client_id sono sempre popolati dall'app con id di sessione
  -- reali, ma non ci si fida MAI del solo "e' presente": deve anche essere
  -- un uuid valido, altrimenti il cast sotto solleverebbe la stessa
  -- eccezione non gestita del bug originale.
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

  -- Stesso calcolo di WORKOUT_PLAN_EXPIRING_WITHIN_DAYS (7 giorni) usato lato
  -- client in computeWorkoutPlanStatus (mobile/src/types/training.ts): mero
  -- valore di comodo, l'app ricalcola sempre autonomamente per la UI.
  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  if public.is_valid_uuid(payload->>'id') then
    v_plan_id := (payload->>'id')::uuid;
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

    if v_plan_id is null then
      raise exception 'NOT_FOUND: scheda non trovata o non di proprieta'' di questo coach';
    end if;
  else
    -- payload->>'id' assente, vuoto o non un uuid valido (es. "1", un
    -- placeholder locale mai salvato prima): SEMPRE trattato come scheda
    -- NUOVA, mai un tentativo di cast che romperebbe la chiamata.
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
        superset_group_id = nullif(v_exercise->>'superset_group_id', '')
      where id = v_ex_id and workout_day_id = v_day_id
      returning id into v_ex_id;

      if v_ex_id is null then
        raise exception 'INVALID_PAYLOAD: esercizio scheda non trovato per aggiornamento';
      end if;
    else
      -- v_exercise->>'id' assente, vuoto o non un uuid valido (es. "1", "2",
      -- "3", un id locale mai salvato prima): SEMPRE trattato come riga
      -- NUOVA, mai un tentativo di cast. exercise_id (l'ESERCIZIO) resta
      -- testo libero, mai castato: puo' essere "lat-machine-avanti" (locale)
      -- o un uuid Supabase/YMove, entrambi validi senza distinzione qui.
      insert into public.workout_day_exercises (
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        target_weight, rest_seconds, notes, technique_type, superset_group_id
      ) values (
        v_day_id, v_exercise->>'exercise_id', (v_exercise->>'exercise_order')::integer,
        (v_exercise->>'sets')::integer, (v_exercise->>'reps')::integer,
        nullif(v_exercise->>'reps_min', '')::integer, nullif(v_exercise->>'reps_max', '')::integer,
        nullif(v_exercise->>'target_weight', '')::numeric, (v_exercise->>'rest_seconds')::integer,
        coalesce(v_exercise->>'notes', ''), coalesce(nullif(v_exercise->>'technique_type', ''), 'normal'),
        nullif(v_exercise->>'superset_group_id', '')
      )
      returning id into v_ex_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_ex_id);
  end loop;

  delete from public.workout_day_exercises
  where workout_day_id = v_day_id
    and (array_length(v_seen_ids, 1) is null or id <> all (v_seen_ids));

  -- Realtime (2026-07-14): tocca SEMPRE updated_at su workout_plans, anche
  -- quando l'unica cosa cambiata e' la lista esercizi (workout_day_exercises
  -- e' una tabella diversa, il trigger set_updated_at di workout_plans non
  -- scatterebbe da solo per quelle righe) â€” senza questo, la subscription
  -- Realtime su workout_plans non riceverebbe alcun evento per un salvataggio
  -- che ha modificato solo gli esercizi.
  update public.workout_plans set updated_at = now() where id = v_plan_id;

  return v_plan_id;
end;
$$;

-- is_valid_uuid resta eseguibile di default (nessun revoke): e' un helper
-- puro senza alcun effetto/dato sensibile, stesso trattamento gia' riservato
-- a is_superadmin()/is_coach_for_client() piu' sopra in questo file.
revoke all on function public.save_workout_plan(jsonb) from public, anon;
grant execute on function public.save_workout_plan(jsonb) to authenticated;

notify pgrst, 'reload schema';
