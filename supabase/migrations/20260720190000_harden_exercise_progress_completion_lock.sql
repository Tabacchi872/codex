-- feat: consente al coach di registrare i carichi del cliente.
--
-- mobile/src/components/exercise-set-logger.tsx (gia' condiviso col cliente)
-- e' ora montato anche per il coach in mobile/src/app/esercizi/[id].tsx, e
-- mobile/src/app/schede/[id].tsx abilita anche per il coach il toggle di
-- completamento del singolo esercizio (prima solo cliente). Entrambi passano
-- dagli stessi servizi condivisi gia' esistenti
-- (createExerciseProgressEntries su exercise_progress_history,
-- updateWorkoutSessionProgress -> RPC update_workout_session_progress): nessun
-- nuovo logger, nessuna nuova tabella/sessione.
--
-- Le RLS INSERT/UPDATE/DELETE su exercise_progress_history
-- (20260718120000_exercise_progress_history.sql) verificano gia' relazione
-- coach_clients attiva e appartenenza della scheda al coach/cliente corretto,
-- ma NON verificano affatto che la sessione o il singolo esercizio siano gia'
-- completati: quel controllo esisteva SOLO lato app
-- (mobile/src/lib/exercise-progress-service.ts), quindi una chiamata diretta
-- a Supabase (bypassando l'app) poteva scrivere/modificare/eliminare carichi
-- su una sessione o un esercizio gia' completati. Allo stesso modo, la RPC
-- update_workout_session_progress non aveva alcun controllo sullo stato
-- attuale della scheda: una chiamata diretta poteva riaprire/modificare una
-- sessione gia' completata, per il coach come per il cliente (nessuna
-- eccezione prevista per il coach, come richiesto).

-- Colonna nuova, nullable: nessuna riga esistente si rompe. Necessaria perche'
-- exercise_progress_history non aveva alcun modo di risalire al singolo
-- "slot" esercizio (workout_day_exercises.id) per verificarne il
-- completamento — aveva solo exercise_id testuale (id di libreria, non
-- univoco per sessione con esercizi ripetuti/duplicati).
alter table public.exercise_progress_history
  add column if not exists workout_exercise_id uuid references public.workout_day_exercises(id) on delete set null;

create index if not exists exercise_progress_workout_exercise_idx
  on public.exercise_progress_history(workout_exercise_id);

create or replace function public.exercise_progress_entry_writable(
  p_workout_plan_id uuid,
  p_workout_exercise_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      p_workout_plan_id is null
      or exists (
        select 1 from public.workout_plans
        where workout_plans.id = p_workout_plan_id
          and workout_plans.session_status <> 'completed'
      )
    )
    and (
      p_workout_exercise_id is null
      or exists (
        select 1
        from public.workout_day_exercises
        join public.workout_days on workout_days.id = workout_day_exercises.workout_day_id
        where workout_day_exercises.id = p_workout_exercise_id
          and workout_day_exercises.completed = false
          and (p_workout_plan_id is null or workout_days.workout_plan_id = p_workout_plan_id)
      )
    );
$$;

revoke all on function public.exercise_progress_entry_writable(uuid, uuid) from public, anon;
grant execute on function public.exercise_progress_entry_writable(uuid, uuid) to authenticated;

drop policy if exists exercise_progress_client_insert_own on public.exercise_progress_history;
create policy exercise_progress_client_insert_own on public.exercise_progress_history
for insert
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = exercise_progress_history.coach_id
      and coach_clients.client_id = auth.uid()
      and coach_clients.status = 'active'
  )
  and (
    workout_plan_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = exercise_progress_history.workout_plan_id
        and workout_plans.coach_id = exercise_progress_history.coach_id
        and workout_plans.client_id = auth.uid()
    )
  )
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

drop policy if exists exercise_progress_coach_insert_linked on public.exercise_progress_history;
create policy exercise_progress_coach_insert_linked on public.exercise_progress_history
for insert
with check (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
  and (
    workout_plan_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = exercise_progress_history.workout_plan_id
        and workout_plans.coach_id = auth.uid()
        and workout_plans.client_id = exercise_progress_history.client_id
    )
  )
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

drop policy if exists exercise_progress_client_update_own_created on public.exercise_progress_history;
create policy exercise_progress_client_update_own_created on public.exercise_progress_history
for update
using (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
)
with check (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

drop policy if exists exercise_progress_coach_update_own_created on public.exercise_progress_history;
create policy exercise_progress_coach_update_own_created on public.exercise_progress_history
for update
using (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
)
with check (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

drop policy if exists exercise_progress_client_delete_own_created on public.exercise_progress_history;
create policy exercise_progress_client_delete_own_created on public.exercise_progress_history
for delete
using (
  client_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'client'
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

drop policy if exists exercise_progress_coach_delete_own_created on public.exercise_progress_history;
create policy exercise_progress_coach_delete_own_created on public.exercise_progress_history
for delete
using (
  coach_id = auth.uid()
  and created_by = auth.uid()
  and created_by_role = 'coach'
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = exercise_progress_history.client_id
      and coach_clients.status = 'active'
  )
  and public.exercise_progress_entry_writable(workout_plan_id, workout_exercise_id)
);

-- update_workout_session_progress (20260719063205_complete_client_status_management.sql):
-- stessa firma, aggiunge solo il controllo "sessione gia' completata" prima
-- di qualunque update — nessuna eccezione per il coach.
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

  if v_plan.coach_id <> auth.uid()
     and not (v_plan.client_id = auth.uid() and v_client_has_active_link)
     and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non autorizzato su questa scheda';
  end if;

  update public.workout_plans set
    session_status = coalesce(p_session_status, session_status),
    started_at = case when p_clear_started_at then null else coalesce(p_started_at, started_at) end,
    completed_at = coalesce(p_completed_at, completed_at),
    duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  where id = p_plan_id;

  if p_completed_exercise_ids is not null then
    select id into v_day_id from public.workout_days where workout_plan_id = p_plan_id and day_order = 1;
    if v_day_id is not null then
      update public.workout_day_exercises set completed = (id = any (p_completed_exercise_ids))
      where workout_day_id = v_day_id;
    end if;
  end if;
end;
$$;

revoke all on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) from public, anon;
grant execute on function public.update_workout_session_progress(uuid, text, timestamptz, boolean, timestamptz, integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
