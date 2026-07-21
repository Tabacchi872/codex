-- fix: rende immutabile tutta la struttura delle schede completate.
--
-- Il commit 618ac963 ha protetto save_workout_plan e gli UPDATE diretti su
-- workout_plans. Restava pero' possibile modificare direttamente
-- workout_days/workout_day_exercises (INSERT/UPDATE/DELETE) anche quando il
-- workout_plan collegato e' gia' 'completed', perche' nessuna delle due
-- tabelle ha una colonna coach_id/client_id o uno stato proprio: lo scoping
-- passa sempre da un JOIN alla riga workout_plans genitore (vedi
-- docs/SUPABASE_SCHEMA.sql, policy workout_days_coach_scope/
-- workout_day_exercises_coach_scope), ma nessuna policy ne' trigger
-- controllava lo stato di quella riga genitore.
--
-- AUDIT scritture su workout_days/workout_day_exercises (grep su tutte le
-- migration + su mobile/src): solo tre funzioni scrivono su queste due
-- tabelle, nessun'altra RPC ne' alcuna chiamata .update()/.insert()/.delete()
-- diretta da mobile (mobile/src/lib/workout-plan-service.ts e
-- appointment-service.ts le leggono soltanto, via .select()):
--   1. save_workout_plan (20260727090000): gia' verifica session_status
--      prima di scrivere nel ramo UPDATE — non raggiunge mai un INSERT/
--      UPDATE/DELETE su workout_days/workout_day_exercises per un piano gia'
--      completed. Il ramo INSERT crea sempre un v_plan_id nuovo che non puo'
--      essere 'completed' nel flusso reale dell'app (mobile invia sempre
--      session_status: plan.sessionStatus ?? 'todo', mai 'completed' in
--      creazione) — un payload malevolo che tentasse comunque un INSERT con
--      session_status='completed' verrebbe ora bloccato dai nuovi trigger
--      sotto quando prova a inserire i giorni/esercizi, comportamento
--      corretto (una scheda "nata gia' completata" non deve popolarsi).
--   2. update_workout_session_progress (20260721090000): riordinata sotto.
--   3. assign_workout_template_to_client (20260726090000): crea SEMPRE un
--      nuovo workout_plans con session_status='todo' hardcoded (riga 150),
--      poi inserisce workout_days/workout_day_exercises per quello stesso
--      piano nuovo — non tocca mai un piano esistente, quindi non puo' mai
--      toccare un piano gia' completed.
-- Nessuna colonna di "conteggio" esiste su workout_days (vedi
-- docs/SUPABASE_SCHEMA.sql riga 1647-1656: id, workout_plan_id, name,
-- day_order, notes, created_at, updated_at) — l'unico stato di avanzamento
-- vive su workout_day_exercises.completed. Il passo "aggiorna giorni e
-- conteggi" non ha quindi alcuna scrittura equivalente da riordinare in
-- questo schema: documentato qui invece di inventare una colonna che non
-- esiste.

-- === 1) update_workout_session_progress: riordino atomico ==================
-- Causa reale del gap: la funzione aggiornava PRIMA workout_plans (che puo'
-- portare session_status a 'completed') e SOLO DOPO workout_day_exercises
-- per gli esercizi svolti. Con i trigger aggiunti sotto, quel secondo update
-- vedrebbe il genitore gia' 'completed' (stessa transazione, la propria
-- scrittura precedente e' visibile) e verrebbe respinto con WORKOUT_LOCKED,
-- rompendo il completamento normale di una sessione.
-- Fix: nessuna logica cambiata, solo l'ordine delle due scritture invertito.
-- Il controllo di blocco esistente (righe 44-46 sotto, invariato) legge
-- v_plan PRIMA di qualsiasi scrittura di questa chiamata, quindi non e'
-- influenzato dal riordino: se la sessione era gia' completed prima di
-- questa chiamata, la funzione fallisce comunque subito, prima di toccare
-- workout_day_exercises o workout_plans. Stessa firma e stesso tipo di
-- ritorno (returns void) della versione precedente: CREATE OR REPLACE e'
-- sufficiente, nessun DROP FUNCTION necessario.
create or replace function public.update_workout_session_progress(
  p_plan_id uuid,
  p_session_status text default null,
  p_started_at timestamptz default null,
  p_clear_started_at boolean default false,
  p_completed_at timestamptz default null,
  p_duration_seconds integer default null,
  p_completed_exercise_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.workout_plans%rowtype;
  v_day_id uuid;
  v_client_has_active_link boolean;
  v_coach_client_active boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if p_session_status is not null and p_session_status not in ('todo', 'completed', 'skipped', 'cancelled') then
    raise exception 'INVALID_PAYLOAD: stato sessione non valido';
  end if;

  select * into v_plan from public.workout_plans where id = p_plan_id;
  if not found then
    raise exception 'NOT_FOUND: scheda non trovata';
  end if;

  if v_plan.session_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: sessione gia'' completata, non modificabile';
  end if;

  select exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = v_plan.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  ) into v_client_has_active_link;

  select exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = v_plan.coach_id
      and coach_clients.client_id = v_plan.client_id
      and coach_clients.status = 'active'
  ) into v_coach_client_active;

  if v_plan.coach_id <> auth.uid()
     and not (v_plan.client_id = auth.uid() and v_client_has_active_link)
     and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non autorizzato su questa scheda';
  end if;

  if v_plan.coach_id = auth.uid() and not v_coach_client_active and not public.is_superadmin() then
    raise exception 'CLIENT_NOT_ACTIVE: il cliente non e'' piu'' attivo per questo coach';
  end if;

  -- 1. Progressi/esercizi scritti PER PRIMI, mentre il piano non e' ancora
  -- 'completed' (v_plan.session_status, letto sopra, non e' 'completed' a
  -- questo punto: altrimenti la funzione sarebbe gia' uscita in errore).
  if p_completed_exercise_ids is not null then
    select id into v_day_id from public.workout_days where workout_plan_id = p_plan_id and day_order = 1;
    if v_day_id is not null then
      update public.workout_day_exercises set completed = (id = any (p_completed_exercise_ids))
      where workout_day_id = v_day_id;
    end if;
  end if;

  -- 2. Nessuna scrittura di "giorni/conteggi" da riordinare in questo schema
  -- (vedi nota in testa al file): workout_days non ha colonne di stato o di
  -- conteggio proprie.

  -- 3. workout_plans (incluso l'eventuale session_status='completed') SEMPRE
  -- come ULTIMA scrittura di questa funzione.
  update public.workout_plans set
    session_status = coalesce(p_session_status, session_status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = p_plan_id;
end;
$$;

revoke all on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

-- === 2) workout_plans: estende il trigger esistente anche a DELETE =========
-- L'OBIETTIVO di questo task include esplicitamente workout_plans
-- nell'immutabilita' completa. Nessuna RPC elimina oggi workout_plans (grep
-- su tutte le migration: nessun "delete from public.workout_plans"), ma
-- workout_plans_coach_scope (docs/SUPABASE_SCHEMA.sql) e' "for all using
-- (coach_id = auth.uid())" senza alcun controllo su session_status: un
-- DELETE diretto via PostgREST su una scheda completed resterebbe
-- possibile e, per via di "on delete cascade" su workout_days/
-- workout_day_exercises, cancellerebbe a cascata anche tutta la struttura
-- protetta sotto — vanificando l'intera migration. Si estende percio' il
-- trigger workout_plans_prevent_completed_edit (introdotto in 618ac963) da
-- "before update" a "before update or delete".
-- ATTENZIONE (bug evitato): la funzione esistente terminava con un
-- incondizionato "return new". In un trigger BEFORE DELETE, NEW e' sempre
-- null: senza il ramo esplicito per tg_op = 'DELETE' sotto, la funzione
-- restituirebbe NULL anche per una DELETE legittima (piano non completed),
-- e un trigger BEFORE DELETE che restituisce NULL annulla silenziosamente
-- la DELETE — avrebbe bloccato la cancellazione di QUALSIASI scheda, non
-- solo di quelle completed. Aggiunto il ramo "if tg_op = 'DELETE' then
-- return old" per evitarlo.
create or replace function public.prevent_completed_workout_plan_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.session_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_plan_edit() from public, anon, authenticated;

drop trigger if exists workout_plans_prevent_completed_edit on public.workout_plans;
create trigger workout_plans_prevent_completed_edit
before update or delete on public.workout_plans
for each row
execute function public.prevent_completed_workout_plan_edit();

-- === 3) workout_days: blocca INSERT/UPDATE/DELETE quando il piano genitore
-- e' completed ================================================================
-- Risale sempre al workout_plan tramite NEW/OLD.workout_plan_id (mai un
-- parametro passato dal client, mai una session variable): per INSERT/UPDATE
-- si controlla il piano di destinazione (NEW), per DELETE il piano di
-- provenienza (OLD). In UPDATE si controlla ANCHE il piano di provenienza se
-- diverso da quello di destinazione: RLS su workout_days consente a un coach
-- di riassegnare un giorno da un piano a un altro (entrambi di sua
-- proprieta'), quindi un controllo che guardasse solo NEW lascerebbe passare
-- un tentativo di "sganciare" un giorno da un piano completed riassegnandolo
-- a un piano ancora aperto — un vettore concreto sotto il modello di minaccia
-- di questo task (UPDATE diretto via PostgREST), non solo teorico.
-- Trigger NON security definer: ogni ruolo con permesso di scrittura su
-- workout_days (coach via workout_days_coach_scope, superadmin) ha anche
-- permesso di lettura sulla riga workout_plans corrispondente (stessa
-- condizione coach_id = auth.uid() / is_superadmin() su entrambe le policy),
-- quindi non esiste un ruolo per cui la SELECT qui sotto risulterebbe vuota
-- pur avendo il ruolo diritto di scrittura: nessun rischio di bypass
-- silenzioso per riga genitore invisibile. Coerente con la scelta gia' fatta
-- per prevent_completed_workout_plan_edit in 618ac963.
create or replace function public.prevent_completed_workout_day_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select session_status into v_status
  from public.workout_plans
  where id = coalesce(new.workout_plan_id, old.workout_plan_id);

  if v_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;

  if tg_op = 'UPDATE' and old.workout_plan_id is distinct from new.workout_plan_id then
    select session_status into v_status
    from public.workout_plans
    where id = old.workout_plan_id;
    if v_status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_day_write() from public, anon, authenticated;

drop trigger if exists workout_days_prevent_completed_edit on public.workout_days;
create trigger workout_days_prevent_completed_edit
before insert or update or delete on public.workout_days
for each row
execute function public.prevent_completed_workout_day_write();

-- === 4) workout_day_exercises: stessa protezione, un salto in piu' tramite
-- workout_days =================================================================
-- Stessa logica del trigger su workout_days sopra, ma risale al piano
-- tramite un JOIN workout_days -> workout_plans (workout_day_exercises non
-- ha una colonna workout_plan_id propria). Stesso controllo di reparenting
-- (UPDATE che cambia workout_day_id verso un giorno di un altro piano) e
-- stessa motivazione non-security-definer.
create or replace function public.prevent_completed_workout_day_exercise_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select workout_plans.session_status into v_status
  from public.workout_days
  join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
  where workout_days.id = coalesce(new.workout_day_id, old.workout_day_id);

  if v_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;

  if tg_op = 'UPDATE' and old.workout_day_id is distinct from new.workout_day_id then
    select workout_plans.session_status into v_status
    from public.workout_days
    join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
    where workout_days.id = old.workout_day_id;
    if v_status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_day_exercise_write() from public, anon, authenticated;

drop trigger if exists workout_day_exercises_prevent_completed_edit on public.workout_day_exercises;
create trigger workout_day_exercises_prevent_completed_edit
before insert or update or delete on public.workout_day_exercises
for each row
execute function public.prevent_completed_workout_day_exercise_write();

notify pgrst, 'reload schema';
