-- feat: aggiunge giorni e metadati ai modelli workout.
--
-- La migration precedente (20260722090000) ha introdotto cartelle e una
-- libreria di modelli, ma workout_template_exercises collegava gli esercizi
-- direttamente al modello, senza alcun livello "giorno/workout" — un
-- programma professionale reale e' invece sempre organizzato in piu' sedute
-- (Workout A/B/C, Push/Pull/Legs, ecc.). Questa migration introduce quel
-- livello (workout_template_days), i metadati professionali del modello
-- (obiettivo, livello, durata, frequenza, attrezzatura, ecc.), e la
-- distinzione tra modelli di sistema (letti da tutti i coach, mai
-- modificabili) e modelli personali (di un solo coach). Non tocca
-- workout_plans/workout_days/workout_day_exercises come STRUTTURA (le
-- schede reali restano un piano flat con un giorno implicito, invariato),
-- solo aggiunge una colonna additiva (rpe_rir) per poter conservare il dato
-- quando una copia viene creata da un modello con piu' giorni.

-- === Livello giorno/workout dei modelli ===================================
-- Nomi neutri decisi dal coach in fase di creazione (es. "Workout A",
-- "Giorno 1", "Spinta"): questa tabella non ha alcuna colonna "giorno della
-- settimana" di proposito — l'agenda/disponibilita' e' un task separato,
-- esplicitamente fuori scope qui.
create table if not exists public.workout_template_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  name text not null,
  focus text,
  sort_order integer not null default 0,
  estimated_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_template_days_template_id_idx on public.workout_template_days(template_id);

drop trigger if exists workout_template_days_set_updated_at on public.workout_template_days;
create trigger workout_template_days_set_updated_at before update on public.workout_template_days
for each row execute function public.set_updated_at();

-- === Collegare gli esercizi del modello al giorno, non piu' al modello ====
-- template_id resta in tabella (colonna storica, ora nullable: mai un DROP
-- COLUMN su una migration gia' applicata ne' su dati esistenti — "non
-- distruttive" come richiesto) ma non viene piu' popolata ne' letta da
-- alcuna RPC/RLS da questa migration in poi: la fonte di verita' e' sempre
-- template_day_id.
alter table public.workout_template_exercises add column if not exists template_day_id uuid references public.workout_template_days(id) on delete cascade;
alter table public.workout_template_exercises add column if not exists rpe_rir text;
alter table public.workout_template_exercises alter column template_id drop not null;
create index if not exists workout_template_exercises_template_day_id_idx on public.workout_template_exercises(template_day_id);

-- Migrazione dati non distruttiva: ogni modello personale esistente (creato
-- prima di questa migration, quindi con esercizi collegati solo via
-- template_id) riceve un unico giorno "Workout A" con tutti i suoi esercizi,
-- ordine/serie/ripetizioni/recupero/note invariati — nessuna perdita di
-- dati, nessun modello resta senza giorni.
insert into public.workout_template_days (template_id, name, sort_order)
select wt.id, 'Workout A', 0
from public.workout_templates wt
where not exists (select 1 from public.workout_template_days wtd where wtd.template_id = wt.id)
  and exists (select 1 from public.workout_template_exercises wte where wte.template_id = wt.id);

update public.workout_template_exercises wte
set template_day_id = (
  select wtd.id from public.workout_template_days wtd
  where wtd.template_id = wte.template_id
  order by wtd.sort_order asc, wtd.created_at asc
  limit 1
)
where wte.template_day_id is null and wte.template_id is not null;

-- === Metadati professionali del modello ====================================
alter table public.workout_templates add column if not exists duration_weeks integer;
alter table public.workout_templates add column if not exists sessions_per_week integer;
alter table public.workout_templates add column if not exists estimated_session_minutes integer;
alter table public.workout_templates add column if not exists equipment text;
alter table public.workout_templates add column if not exists location text;
alter table public.workout_templates add column if not exists training_style text;
alter table public.workout_templates add column if not exists muscle_focus text;
alter table public.workout_templates add column if not exists intensity text;
alter table public.workout_templates add column if not exists progression_notes text;
alter table public.workout_templates add column if not exists deload_week boolean not null default false;
alter table public.workout_templates add column if not exists is_system boolean not null default false;
alter table public.workout_templates add column if not exists source_template_id uuid references public.workout_templates(id) on delete set null;

-- coach_id nullable SOLO per i modelli di sistema (nessun coach proprietario:
-- leggibili da tutti). Il vincolo sotto impedisce sia un modello personale
-- "orfano" (coach_id null, is_system false — invisibile a chiunque sotto
-- RLS) sia un modello di sistema con un proprietario (che romperebbe "non
-- modificabile/eliminabile da nessun coach", dato che le policy sotto usano
-- is_system per bloccare le scritture, non l'assenza di coach_id).
alter table public.workout_templates alter column coach_id drop not null;
alter table public.workout_templates drop constraint if exists workout_templates_system_ownership_check;
alter table public.workout_templates add constraint workout_templates_system_ownership_check
  check ((is_system and coach_id is null) or (not is_system and coach_id is not null));

create index if not exists workout_templates_is_system_idx on public.workout_templates(is_system);

-- === RLS: split lettura (anche modelli di sistema) da scrittura (mai sui
-- modelli di sistema, mai per un coach diverso dal proprietario) ===========
-- La policy precedente (workout_templates_coach_own_all, "for all") non
-- distingueva SELECT da INSERT/UPDATE/DELETE: estenderla per includere
-- is_system in lettura avrebbe permesso anche scritture su righe altrui.
-- Va sostituita con quattro policy separate (superadmin_all, gia' esistente
-- e invariata, resta valida per tutte le operazioni).
drop policy if exists workout_templates_coach_own_all on public.workout_templates;

drop policy if exists workout_templates_read on public.workout_templates;
create policy workout_templates_read on public.workout_templates
  for select using (is_system or coach_id = auth.uid());

drop policy if exists workout_templates_coach_insert on public.workout_templates;
create policy workout_templates_coach_insert on public.workout_templates
  for insert with check (not is_system and coach_id = auth.uid());

drop policy if exists workout_templates_coach_update on public.workout_templates;
create policy workout_templates_coach_update on public.workout_templates
  for update using (not is_system and coach_id = auth.uid())
  with check (not is_system and coach_id = auth.uid());

drop policy if exists workout_templates_coach_delete on public.workout_templates;
create policy workout_templates_coach_delete on public.workout_templates
  for delete using (not is_system and coach_id = auth.uid());

-- === RLS workout_template_days: stesso schema, scoping via il modello =====
alter table public.workout_template_days enable row level security;

drop policy if exists workout_template_days_superadmin_all on public.workout_template_days;
create policy workout_template_days_superadmin_all on public.workout_template_days
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists workout_template_days_read on public.workout_template_days;
create policy workout_template_days_read on public.workout_template_days
  for select using (
    exists (select 1 from public.workout_templates wt where wt.id = workout_template_days.template_id and (wt.is_system or wt.coach_id = auth.uid()))
  );

drop policy if exists workout_template_days_coach_insert on public.workout_template_days;
create policy workout_template_days_coach_insert on public.workout_template_days
  for insert with check (
    exists (select 1 from public.workout_templates wt where wt.id = workout_template_days.template_id and not wt.is_system and wt.coach_id = auth.uid())
  );

drop policy if exists workout_template_days_coach_update on public.workout_template_days;
create policy workout_template_days_coach_update on public.workout_template_days
  for update using (
    exists (select 1 from public.workout_templates wt where wt.id = workout_template_days.template_id and not wt.is_system and wt.coach_id = auth.uid())
  ) with check (
    exists (select 1 from public.workout_templates wt where wt.id = workout_template_days.template_id and not wt.is_system and wt.coach_id = auth.uid())
  );

drop policy if exists workout_template_days_coach_delete on public.workout_template_days;
create policy workout_template_days_coach_delete on public.workout_template_days
  for delete using (
    exists (select 1 from public.workout_templates wt where wt.id = workout_template_days.template_id and not wt.is_system and wt.coach_id = auth.uid())
  );

-- === RLS workout_template_exercises: sostituisce la policy "for all" con
-- lo stesso split, ora via template_day_id (template_id non e' piu'
-- affidabile: puo' essere null per le righe create da questa migration in
-- poi) ========================================================================
drop policy if exists workout_template_exercises_coach_scope on public.workout_template_exercises;

drop policy if exists workout_template_exercises_read on public.workout_template_exercises;
create policy workout_template_exercises_read on public.workout_template_exercises
  for select using (
    exists (
      select 1 from public.workout_template_days wtd
      join public.workout_templates wt on wt.id = wtd.template_id
      where wtd.id = workout_template_exercises.template_day_id and (wt.is_system or wt.coach_id = auth.uid())
    )
  );

drop policy if exists workout_template_exercises_coach_insert on public.workout_template_exercises;
create policy workout_template_exercises_coach_insert on public.workout_template_exercises
  for insert with check (
    exists (
      select 1 from public.workout_template_days wtd
      join public.workout_templates wt on wt.id = wtd.template_id
      where wtd.id = workout_template_exercises.template_day_id and not wt.is_system and wt.coach_id = auth.uid()
    )
  );

drop policy if exists workout_template_exercises_coach_update on public.workout_template_exercises;
create policy workout_template_exercises_coach_update on public.workout_template_exercises
  for update using (
    exists (
      select 1 from public.workout_template_days wtd
      join public.workout_templates wt on wt.id = wtd.template_id
      where wtd.id = workout_template_exercises.template_day_id and not wt.is_system and wt.coach_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workout_template_days wtd
      join public.workout_templates wt on wt.id = wtd.template_id
      where wtd.id = workout_template_exercises.template_day_id and not wt.is_system and wt.coach_id = auth.uid()
    )
  );

drop policy if exists workout_template_exercises_coach_delete on public.workout_template_exercises;
create policy workout_template_exercises_coach_delete on public.workout_template_exercises
  for delete using (
    exists (
      select 1 from public.workout_template_days wtd
      join public.workout_templates wt on wt.id = wtd.template_id
      where wtd.id = workout_template_exercises.template_day_id and not wt.is_system and wt.coach_id = auth.uid()
    )
  );

-- === RPE/RIR sulla scheda REALE assegnata (workout_day_exercises) =========
-- Colonna additiva, mai popolata dall'editor scheda esistente (non toccato:
-- vedi save_workout_plan sotto, che la preserva senza mai lasciarla scrivere
-- da un payload che non la conosce) — serve solo perche' una copia creata da
-- un modello con RPE/RIR possa conservarlo, come richiesto esplicitamente.
alter table public.workout_day_exercises add column if not exists rpe_rir text;

-- save_workout_plan: unica modifica, il ramo UPDATE non azzera piu' rpe_rir
-- quando il payload non lo include (l'editor scheda esistente non lo
-- conosce e non lo invia mai: senza questo fix, la prima modifica manuale di
-- una scheda copiata da un modello con RPE/RIR lo avrebbe cancellato in
-- silenzio). Il ramo INSERT resta invariato (nessun valore in arrivo = null,
-- come tutti gli altri campi opzionali).
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

-- === save_workout_template: ora gestisce giorni annidati ===================
-- Sostituisce integralmente la versione precedente (esercizi diretti sul
-- modello): il payload ora ha { ..., days: [{ id?, name, focus, sort_order,
-- estimated_duration_minutes, exercises: [...] }] }. Stessa garanzia di
-- sicurezza di prima: coach_id sempre da auth.uid(), mai dal payload. Non
-- puo' mai toccare un modello di sistema: la clausola "and coach_id =
-- v_coach_id" nell'update non trova mai una riga con coach_id null,
-- risultando sempre in NOT_FOUND per un tentativo di modifica di un modello
-- di sistema.
create or replace function public.save_workout_template(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_coach_id uuid;
  v_folder_id uuid;
  v_day jsonb;
  v_exercise jsonb;
  v_day_id uuid;
  v_seen_day_ids uuid[] := '{}';
  v_seen_exercise_ids uuid[] := '{}';
  v_ex_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  v_coach_id := auth.uid();

  if coalesce(trim(payload->>'name'), '') = '' then
    raise exception 'INVALID_PAYLOAD: nome scheda modello mancante';
  end if;

  v_folder_id := case when public.is_valid_uuid(payload->>'folder_id') then (payload->>'folder_id')::uuid else null end;
  if v_folder_id is not null and not exists (
    select 1 from public.template_folders where id = v_folder_id and coach_id = v_coach_id
  ) then
    raise exception 'INVALID_PAYLOAD: cartella non trovata o non di proprieta'' di questo coach';
  end if;

  if public.is_valid_uuid(payload->>'id') then
    v_template_id := (payload->>'id')::uuid;
    update public.workout_templates set
      folder_id = v_folder_id,
      name = payload->>'name',
      description = nullif(payload->>'description', ''),
      goal = nullif(payload->>'goal', ''),
      level = nullif(payload->>'level', ''),
      sort_order = coalesce((payload->>'sort_order')::integer, 0),
      duration_weeks = nullif(payload->>'duration_weeks', '')::integer,
      sessions_per_week = nullif(payload->>'sessions_per_week', '')::integer,
      estimated_session_minutes = nullif(payload->>'estimated_session_minutes', '')::integer,
      equipment = nullif(payload->>'equipment', ''),
      location = nullif(payload->>'location', ''),
      training_style = nullif(payload->>'training_style', ''),
      muscle_focus = nullif(payload->>'muscle_focus', ''),
      intensity = nullif(payload->>'intensity', ''),
      progression_notes = nullif(payload->>'progression_notes', ''),
      deload_week = coalesce((payload->>'deload_week')::boolean, false),
      source_template_id = case when public.is_valid_uuid(payload->>'source_template_id') then (payload->>'source_template_id')::uuid else source_template_id end
    where id = v_template_id and coach_id = v_coach_id
    returning id into v_template_id;

    if v_template_id is null then
      raise exception 'NOT_FOUND: scheda modello non trovata o non di proprieta'' di questo coach';
    end if;
  else
    -- is_system NON e' mai leggibile dal payload: un inserimento da questa
    -- RPC (l'unico percorso coach-facing) e' sempre un modello personale.
    -- I modelli di sistema sono creati solo da migration, fuori da questo
    -- percorso.
    insert into public.workout_templates (
      coach_id, folder_id, name, description, goal, level, sort_order,
      duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
      location, training_style, muscle_focus, intensity, progression_notes,
      deload_week, is_system, source_template_id
    ) values (
      v_coach_id, v_folder_id, payload->>'name', nullif(payload->>'description', ''),
      nullif(payload->>'goal', ''), nullif(payload->>'level', ''), coalesce((payload->>'sort_order')::integer, 0),
      nullif(payload->>'duration_weeks', '')::integer, nullif(payload->>'sessions_per_week', '')::integer,
      nullif(payload->>'estimated_session_minutes', '')::integer, nullif(payload->>'equipment', ''),
      nullif(payload->>'location', ''), nullif(payload->>'training_style', ''), nullif(payload->>'muscle_focus', ''),
      nullif(payload->>'intensity', ''), nullif(payload->>'progression_notes', ''),
      coalesce((payload->>'deload_week')::boolean, false), false,
      case when public.is_valid_uuid(payload->>'source_template_id') then (payload->>'source_template_id')::uuid else null end
    )
    returning id into v_template_id;
  end if;

  for v_day in select * from jsonb_array_elements(coalesce(payload->'days', '[]'::jsonb))
  loop
    if public.is_valid_uuid(v_day->>'id') then
      v_day_id := (v_day->>'id')::uuid;
      update public.workout_template_days set
        name = v_day->>'name',
        focus = nullif(v_day->>'focus', ''),
        sort_order = coalesce((v_day->>'sort_order')::integer, 0),
        estimated_duration_minutes = nullif(v_day->>'estimated_duration_minutes', '')::integer
      where id = v_day_id and template_id = v_template_id
      returning id into v_day_id;

      if v_day_id is null then
        raise exception 'INVALID_PAYLOAD: giorno del modello non trovato per aggiornamento';
      end if;
    else
      insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
      values (
        v_template_id, v_day->>'name', nullif(v_day->>'focus', ''),
        coalesce((v_day->>'sort_order')::integer, 0), nullif(v_day->>'estimated_duration_minutes', '')::integer
      )
      returning id into v_day_id;
    end if;
    v_seen_day_ids := array_append(v_seen_day_ids, v_day_id);

    for v_exercise in select * from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb))
    loop
      if public.is_valid_uuid(v_exercise->>'id') then
        v_ex_id := (v_exercise->>'id')::uuid;
        update public.workout_template_exercises set
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
          rpe_rir = nullif(v_exercise->>'rpe_rir', ''),
          template_day_id = v_day_id
        where id = v_ex_id and template_day_id = v_day_id
        returning id into v_ex_id;

        if v_ex_id is null then
          raise exception 'INVALID_PAYLOAD: esercizio del modello non trovato per aggiornamento';
        end if;
      else
        insert into public.workout_template_exercises (
          template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
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
      v_seen_exercise_ids := array_append(v_seen_exercise_ids, v_ex_id);
    end loop;
  end loop;

  -- Rimuove i giorni non ripresentati nel payload (e i loro esercizi, via
  -- cascade) e gli esercizi non ripresentati nei giorni rimasti — stesso
  -- pattern "elimina cio' che non compare piu'" gia' usato da
  -- save_workout_plan.
  delete from public.workout_template_days
  where template_id = v_template_id
    and (array_length(v_seen_day_ids, 1) is null or id <> all (v_seen_day_ids));

  delete from public.workout_template_exercises
  where template_day_id in (select id from public.workout_template_days where template_id = v_template_id)
    and (array_length(v_seen_exercise_ids, 1) is null or id <> all (v_seen_exercise_ids));

  update public.workout_templates set updated_at = now() where id = v_template_id;

  return v_template_id;
end;
$$;

revoke all on function public.save_workout_template(jsonb) from public, anon;
grant execute on function public.save_workout_template(jsonb) to authenticated;

-- === assign_workout_template_to_client: ora copia TUTTI i giorni ==========
-- Un modello con N giorni (Workout A/B/C...) crea N schede reali indipendenti
-- (workout_plans), una per giorno — stesso pattern gia' usato dal catalogo
-- statico legacy (schede/modelli/[id].tsx, "Usa per cliente": un piano
-- reale per sessione del modello). Ogni copia porta anche rpe_rir. La
-- condizione di autorizzazione "possiede il modello" ora gestisce
-- esplicitamente il caso is_system (coach_id null): prima affidata alla
-- semantica di NULL <> auth.uid() = NULL in PL/pgSQL (che per coincidenza
-- risultava falsa, mai un errore voluto) — riscritta esplicita per non
-- dipendere da quella coincidenza.
-- CREATE OR REPLACE non puo' cambiare il tipo di ritorno di una funzione
-- esistente (era "returns uuid", ora "returns uuid[]" per restituire una
-- copia per ciascun giorno del modello): va prima eliminata esplicitamente.
drop function if exists public.assign_workout_template_to_client(uuid, uuid);

create function public.assign_workout_template_to_client(p_template_id uuid, p_client_id uuid)
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
    select id, name from public.workout_template_days where template_id = p_template_id order by sort_order, created_at
  loop
    insert into public.workout_plans (coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label)
    values (auth.uid(), p_client_id, p_template_id, v_template_name || ' — ' || v_template_day.name, v_status, v_start_date, v_expiry_date, 'todo', v_template_day.name)
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

revoke all on function public.assign_workout_template_to_client(uuid, uuid) from public, anon;
grant execute on function public.assign_workout_template_to_client(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
