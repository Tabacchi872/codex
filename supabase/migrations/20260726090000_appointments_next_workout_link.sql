-- feat: collega gli appuntamenti ai workout del cliente.
--
-- L'agenda coach (public.appointments) poteva gia' collegare un appuntamento
-- a una scheda reale (workout_session_id, in realta' un workout_plan_id: il
-- nome storico resta invariato per non rompere appointment-service.ts e la
-- RLS gia' applicata, ma punta esattamente a workout_plans.id). Mancava pero'
-- un modo AFFIDABILE per determinare "il prossimo workout" di un programma
-- multi-giorno (Workout A/B/C, introdotto dalla migration 20260723090000):
-- workout_plans non aveva alcun ordine persistito tra i giorni di uno stesso
-- programma, solo day_label testuale (es. "Upper A") — inutilizzabile per un
-- ordine stabile (alfabetico su "Lower Strength"/"Upper Hypertrophy" darebbe
-- un ordine sbagliato rispetto a quello del modello). Questa migration
-- aggiunge quell'ordine e un riferimento preciso al giorno collegato, senza
-- toccare alcuna migration gia' applicata e senza modificare il contenuto
-- dei modelli professionali/schema esercizi/giorni (solo un ordine numerico
-- aggiuntivo su workout_plans e una colonna su appointments).

-- === Ordine stabile tra i giorni di uno stesso programma ==================
-- Popolato SOLO per le schede create da assign_workout_template_to_client
-- (sotto), dal sort_order del workout_template_days originario — mai da
-- giorno della settimana, data corrente, nome esercizio o indice locale.
-- Resta NULL per le schede create dall'editor manuale (save_workout_plan):
-- non fanno parte di alcuna sequenza multi-giorno, quindi un ordine non ha
-- senso per loro (il chiamante lato app tratta NULL come "nessuna sequenza",
-- vedi mobile/src/lib/workout-progress.ts).
alter table public.workout_plans add column if not exists sequence_order integer;

-- === Collegamento preciso al giorno (non solo al piano) ====================
-- Ogni workout_plan ha oggi sempre esattamente un workout_days (day_order=1),
-- ma l'appuntamento deve puntare esplicitamente al giorno, non assumerlo
-- implicitamente dal piano — un riferimento diretto e verificabile via RLS,
-- mai un id ricavato lato client. on delete set null: eliminare un giorno
-- (mai fatto oggi da alcun percorso applicativo) non elimina mai
-- l'appuntamento, lo scollega soltanto.
alter table public.appointments add column if not exists workout_day_id uuid references public.workout_days(id) on delete set null;
create index if not exists appointments_workout_day_id_idx on public.appointments(workout_day_id);

-- === RLS: estende la policy esistente (mai sostituita, solo ampliata) con
-- la stessa verifica gia' fatta per workout_session_id, applicata a
-- workout_day_id: deve appartenere a un workout_days il cui piano e' del
-- coach autenticato E del client_id dichiarato sull'appuntamento, e se
-- workout_session_id e' presente anche lui, il giorno deve appartenere
-- ESATTAMENTE a quel piano (mai un piano e un giorno di piani diversi
-- abbinati insieme). Nessun ID inviato dalla UI viene mai fidato: questa
-- clausola e' l'unica cosa che impedisce a un coach di collegare un
-- appuntamento al workout di un cliente che non e' il suo, o di un altro
-- coach, anche se qualcuno inviasse un UUID valido ma non proprio.
drop policy if exists appointments_coach_scope on public.appointments;
create policy appointments_coach_scope on public.appointments
for all
using (
  coach_id = auth.uid()
)
with check (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = appointments.client_id
      and coach_clients.status = 'active'
  )
  and (
    appointments.workout_session_id is null
    or exists (
      select 1
      from public.workout_plans
      where workout_plans.id = appointments.workout_session_id
        and workout_plans.coach_id = auth.uid()
        and workout_plans.client_id = appointments.client_id
    )
  )
  and (
    appointments.workout_day_id is null
    or exists (
      select 1
      from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      where workout_days.id = appointments.workout_day_id
        and workout_plans.coach_id = auth.uid()
        and workout_plans.client_id = appointments.client_id
        and (appointments.workout_session_id is null or workout_days.workout_plan_id = appointments.workout_session_id)
    )
  )
);

-- === assign_workout_template_to_client: unica modifica, popola
-- sequence_order dal sort_order del giorno originario =====================
-- Stessa firma e stesso tipo di ritorno (returns uuid[]) della versione
-- precedente: CREATE OR REPLACE e' sufficiente, nessun DROP FUNCTION
-- necessario stavolta. Nessun'altra riga della funzione cambia: stesso
-- contenuto dei modelli/esercizi/giorni copiato identico, solo un valore
-- numerico aggiuntivo scritto sul piano appena creato.
create or replace function public.assign_workout_template_to_client(p_template_id uuid, p_client_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid;
  v_is_system boolean;
  v_template_name text;
  v_client_active boolean;
  v_plan_id uuid;
  v_day_id uuid;
  v_plan_ids uuid[] := '{}';
  v_template_day record;
  v_start_date date := current_date;
  v_expiry_date date := current_date + interval '90 days';
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  select coach_id, is_system, name into v_coach_id, v_is_system, v_template_name
  from public.workout_templates where id = p_template_id;
  if v_template_name is null then
    raise exception 'NOT_FOUND: scheda modello non trovata';
  end if;
  if not v_is_system and v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il proprietario di questo modello';
  end if;

  select exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = p_client_id
      and coach_clients.status = 'active'
  ) into v_client_active;
  if not v_client_active then
    raise exception 'CLIENT_NOT_ACTIVE: il cliente indicato non e'' un cliente active di questo coach';
  end if;

  if not exists (select 1 from public.workout_template_days where template_id = p_template_id) then
    raise exception 'INVALID_PAYLOAD: il modello non ha alcun giorno da assegnare';
  end if;

  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  for v_template_day in
    select id, name, sort_order from public.workout_template_days where template_id = p_template_id order by sort_order, created_at
  loop
    insert into public.workout_plans (coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, sequence_order)
    values (auth.uid(), p_client_id, p_template_id, v_template_name || ' — ' || v_template_day.name, v_status, v_start_date, v_expiry_date, 'todo', v_template_day.name, v_template_day.sort_order)
    returning id into v_plan_id;

    insert into public.workout_days (workout_plan_id, day_order) values (v_plan_id, 1) returning id into v_day_id;

    insert into public.workout_day_exercises (
      workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
    )
    select v_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
      target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir
    from public.workout_template_exercises
    where template_day_id = v_template_day.id
    order by exercise_order;

    v_plan_ids := array_append(v_plan_ids, v_plan_id);
  end loop;

  return v_plan_ids;
end;
$$;

notify pgrst, 'reload schema';
