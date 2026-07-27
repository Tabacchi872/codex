-- feat: sotto-blocco 2.0 — abilita il logging progressi per clienti self-guided.
--
-- CAUSA ESATTA DEL PROBLEMA (analisi su codice reale, non assunta):
-- mobile/src/lib/exercise-progress-service.ts, funzione resolveProgressActor()
-- (righe 171-209), risolve SEMPRE l'attore tramite una riga coach_clients
-- attiva (`from('coach_clients').eq('status','active').eq('client_id', clientId)`,
-- poi `.eq('coach_id', authUserId)` se l'attore non e' il cliente stesso). Un
-- cliente self-guided non ha MAI una riga coach_clients per definizione
-- (client_has_no_active_coach() e' vero) -> la funzione ritorna sempre
-- `client_not_linked`, sia per createExerciseProgressEntries (insert) sia per
-- deleteExerciseProgressEntry (delete). Le uniche due tabelle scritte da
-- questo servizio sono `exercise_progress_history` (insert/update/delete
-- diretti via supabase-js, MAI tramite una RPC) — nessun'altra tabella.
-- Anche rimuovendo il controllo lato app, le RLS INSERT/UPDATE/DELETE su
-- exercise_progress_history (20260718120000, indurite in 20260720190000)
-- richiedono TUTTE la stessa relazione coach_clients attiva: un self-guided
-- resterebbe bloccato comunque a livello di database, non solo di app.
--
-- Il controllo WORKOUT_LOCKED esiste oggi su due livelli distinti: (a)
-- lato app, puramente informativo/UX (isWorkoutSessionCompleted/
-- isWorkoutExerciseCompleted/isWorkoutExerciseLockedByLibraryId in
-- workout-progress.ts); (b) lato server, SOLO dentro le RLS insert/update/
-- delete tramite la funzione gia' esistente
-- public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
-- (introdotta in 20260720190000) — riusata identica qui sotto, non
-- riscritta.
--
-- SOLUZIONE: due nuove funzioni SECURITY DEFINER, mai un'estensione delle
-- RLS esistenti per il caso self-guided. Motivo: le policy attuali per
-- coach/client richiedono TUTTE coach_clients — nessuna policy odierna
-- permetterebbe comunque un insert/update/delete diretto via PostgREST per
-- un self-guided, quindi NESSUNA nuova policy permissiva viene aggiunta:
-- l'unico percorso di scrittura per un self-guided resta questa RPC. Un
-- tentativo di scrittura diretta via PostgREST (bypassando la RPC) per un
-- self-guided continua a essere respinto dalla RLS esistente per assenza di
-- qualunque policy che lo permetta — "la sicurezza non dipende solo dalla
-- RPC": e' l'assenza di una policy permissiva a bloccare il bypass, non un
-- controllo applicativo. Lettura (SELECT) non richiede alcuna modifica:
-- exercise_progress_client_select_own (`client_id = auth.uid()`) non ha mai
-- richiesto coach_clients, funziona gia' per il self-guided.
--
-- Ogni parametro di identita' (auth.uid()) e' risolto server-side; nessun
-- client_id/coach_id/origine-scheda viene MAI accettato come parametro dal
-- chiamante: le due RPC sotto non hanno alcun parametro "client_id" — solo
-- auth.uid(). L'origine della scheda (coach/auto_system/superadmin_override)
-- e il coach_id vengono sempre letti da public.workout_plans, mai dichiarati
-- dal client.

create or replace function public.log_self_guided_exercise_progress(
  p_workout_plan_id uuid,
  p_workout_exercise_id uuid,
  p_exercise_id text,
  p_entries jsonb
)
returns setof public.exercise_progress_history
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_cycle_status text;
  v_valid_exercise boolean;
  v_entry jsonb;
  v_set_number integer;
  v_reps integer;
  v_weight numeric;
  v_inserted public.exercise_progress_history%rowtype;
begin
  if v_client_id is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' registrare i propri progressi';
  end if;
  if not public.client_has_no_active_coach(v_client_id) then
    raise exception 'FORBIDDEN: percorso riservato ai clienti senza coach';
  end if;
  if not public._has_active_client_pro_entitlement(v_client_id) then
    raise exception 'SUBSCRIPTION_REQUIRED: nessun piano Client Pro attivo';
  end if;

  select * into v_plan from public.workout_plans where id = p_workout_plan_id;
  if not found or v_plan.client_id <> v_client_id then
    raise exception 'INVALID_SESSION: scheda non trovata o non tua';
  end if;
  if v_plan.coach_id is not null or v_plan.origin not in ('auto_system', 'superadmin_override') then
    raise exception 'INVALID_SESSION: questa scheda non appartiene al percorso automatico';
  end if;

  -- Ciclo collegato: distingue "nessun ciclo automatico" da "ciclo sospeso"
  -- usando gli stati gia' esistenti del Blocco 1 (nessuna estensione di CHECK
  -- in questa migration, riservata al Blocco 2.1): 'draft'/'completed'/
  -- 'superseded' -> nessun programma realmente attivo oggi; 'suspended'
  -- (mai prodotto da codice oggi, ma valido per CHECK, es. un futuro
  -- intervento Superadmin) e 'pending_review' (il caso Blocco 1 "in attesa
  -- di supervisione/nessun template", gia' prodotto da assign_initial_auto_
  -- program) -> programma sospeso, log non permesso finche' non risolto.
  select cpc.status into v_cycle_status
  from public.client_program_cycle_plans cpp
  join public.client_program_cycles cpc on cpc.id = cpp.cycle_id
  where cpp.workout_plan_id = p_workout_plan_id;

  if v_cycle_status is null or v_cycle_status in ('draft', 'completed', 'superseded') then
    raise exception 'NO_ACTIVE_PROGRAM: nessun ciclo automatico attivo collegato a questa scheda';
  end if;
  if v_cycle_status in ('suspended', 'pending_review') then
    raise exception 'PROGRAM_PAUSED: il programma e'' in attesa di revisione o sospeso';
  end if;

  select exists (
    select 1 from public.workout_day_exercises wde
    join public.workout_days wd on wd.id = wde.workout_day_id
    where wde.id = p_workout_exercise_id
      and wd.workout_plan_id = p_workout_plan_id
      and wde.exercise_id = p_exercise_id
  ) into v_valid_exercise;
  if not v_valid_exercise then
    raise exception 'INVALID_EXERCISE: esercizio non appartenente a questa scheda';
  end if;

  -- Stessa funzione gia' usata dalle RLS del percorso coach (20260720190000):
  -- verifica sia session_status <> 'completed' sia workout_day_exercises.
  -- completed = false per questo specifico esercizio. Riutilizzo esplicito,
  -- nessuna logica duplicata.
  if not public.exercise_progress_entry_writable(p_workout_plan_id, p_workout_exercise_id) then
    raise exception 'WORKOUT_LOCKED: questo workout o questo esercizio e'' gia'' completato e non puo'' essere modificato';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'INVALID_PAYLOAD: nessuna serie da salvare';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_set_number := nullif(v_entry->>'set_number', '')::integer;
    v_reps := nullif(v_entry->>'reps_completed', '')::integer;
    v_weight := nullif(v_entry->>'weight_kg', '')::numeric;
    if v_set_number is null or v_set_number <= 0 or v_reps is null or v_reps <= 0 or v_weight is null or v_weight <= 0 then
      raise exception 'INVALID_PAYLOAD: serie non valida (peso/ripetizioni mancanti o non positivi)';
    end if;

    insert into public.exercise_progress_history (
      client_id, coach_id, exercise_id, workout_plan_id, workout_exercise_id,
      performed_at, session_date, set_number, reps_completed, weight_kg,
      rest_seconds, notes, perceived_effort, created_by, created_by_role
    ) values (
      v_client_id, null, p_exercise_id, p_workout_plan_id, p_workout_exercise_id,
      coalesce(nullif(v_entry->>'performed_at', '')::timestamptz, now()),
      coalesce(nullif(v_entry->>'session_date', '')::date, current_date),
      v_set_number, v_reps, v_weight,
      nullif(v_entry->>'rest_seconds', '')::integer,
      nullif(v_entry->>'notes', ''),
      nullif(v_entry->>'perceived_effort', '')::numeric,
      v_client_id, 'client'
    )
    returning * into v_inserted;

    return next v_inserted;
  end loop;

  return;
end;
$$;

revoke all on function public.log_self_guided_exercise_progress(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.log_self_guided_exercise_progress(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.delete_self_guided_exercise_progress(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_entry public.exercise_progress_history%rowtype;
begin
  if v_client_id is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  select * into v_entry from public.exercise_progress_history where id = p_entry_id;
  if not found then
    -- Idempotente: gia' eliminato (stesso principio gia' usato da
    -- deleteExerciseProgressEntry per il percorso coach: un id inesistente
    -- non e' un errore).
    return;
  end if;

  if v_entry.client_id <> v_client_id
     or v_entry.created_by <> v_client_id
     or v_entry.created_by_role <> 'client'
     or v_entry.coach_id is not null then
    raise exception 'FORBIDDEN: non autorizzato a eliminare questo carico';
  end if;

  if not public.exercise_progress_entry_writable(v_entry.workout_plan_id, v_entry.workout_exercise_id) then
    raise exception 'WORKOUT_LOCKED: questo workout o questo esercizio e'' gia'' completato e non puo'' essere modificato';
  end if;

  delete from public.exercise_progress_history where id = p_entry_id;
end;
$$;

revoke all on function public.delete_self_guided_exercise_progress(uuid) from public, anon;
grant execute on function public.delete_self_guided_exercise_progress(uuid) to authenticated;

notify pgrst, 'reload schema';
