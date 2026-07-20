-- fix: organizza i modelli scheda in cartelle.
--
-- Il tab globale "Schede" della bottom bar coach mostrava finora TUTTE le
-- sessioni reali assegnate a TUTTI i clienti (workout_plans, con nome
-- cliente, stato sessione, ecc.) — nessun concetto di "libreria di modelli"
-- collegato a Supabase esisteva davvero: public.workout_templates era gia'
-- presente (migrazione "Migrazione schede e allenamenti a Supabase",
-- 2026-07-14) ma senza cartelle, senza esercizi, senza alcuna UI collegata
-- (commento originale: "pronta per una futura UI 'i miei modelli', non
-- ancora costruita"). Questa migrazione completa quella tabella con le
-- cartelle/sottocartelle e gli esercizi del modello, e aggiunge le RPC per
-- salvare un modello e per assegnarne una COPIA indipendente a un cliente
-- active. Non tocca workout_plans/workout_days/workout_day_exercises (schede
-- reali assegnate) ne' i 7 modelli statici predefiniti
-- (mobile/src/data/workout-plan-templates.ts, un sistema separato, non
-- toccato da questo intervento).

-- Cartelle/sottocartelle di modelli, di proprieta' esclusiva del coach che le
-- crea. parent_folder_id nullo = cartella di primo livello. on delete cascade
-- sulle sottocartelle: la cancellazione ricorsiva e' comunque sempre guidata
-- esplicitamente dall'app tramite delete_template_folder sotto (mai una
-- cancellazione automatica silenziosa di schede, vedi li' per il dettaglio) —
-- il cascade qui e' solo una rete di sicurezza per non lasciare sottocartelle
-- orfane se una riga venisse comunque rimossa senza passare da quella RPC.
create table if not exists public.template_folders (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  parent_folder_id uuid references public.template_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists template_folders_coach_id_idx on public.template_folders(coach_id);
create index if not exists template_folders_parent_folder_id_idx on public.template_folders(parent_folder_id);

drop trigger if exists template_folders_set_updated_at on public.template_folders;
create trigger template_folders_set_updated_at before update on public.template_folders
for each row execute function public.set_updated_at();

-- Un modello senza folder_id vive nella cartella virtuale "Senza categoria"
-- lato app (mai una riga reale in template_folders per questo). on delete set
-- null: eliminare una cartella non elimina mai automaticamente i modelli al
-- suo interno per un accesso diretto alla tabella — l'app decide sempre
-- esplicitamente (sposta/elimina) tramite delete_template_folder.
alter table public.workout_templates add column if not exists folder_id uuid references public.template_folders(id) on delete set null;
alter table public.workout_templates add column if not exists sort_order integer not null default 0;
create index if not exists workout_templates_folder_id_idx on public.workout_templates(folder_id);

-- Esercizi del modello: stessa forma di workout_day_exercises (schede reali)
-- ma senza alcun collegamento a client_id/workout_plan_id — un modello non ha
-- MAI un cliente. Nessun livello "giorno" intermedio (a differenza di
-- workout_plans -> workout_days -> workout_day_exercises): la gerarchia
-- richiesta e' cartella/sottocartella -> scheda modello -> esercizi, senza
-- concetto di giorno.
create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id text not null,
  exercise_order integer not null default 0,
  sets integer not null default 3,
  reps integer not null default 10,
  reps_min integer,
  reps_max integer,
  target_weight numeric(6,2),
  rest_seconds integer not null default 60,
  notes text,
  technique_type text not null default 'normal' check (technique_type in ('normal', 'superset', 'stripping', 'circuit')),
  superset_group_id text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_template_exercises_template_id_idx on public.workout_template_exercises(template_id);

drop trigger if exists workout_template_exercises_set_updated_at on public.workout_template_exercises;
create trigger workout_template_exercises_set_updated_at before update on public.workout_template_exercises
for each row execute function public.set_updated_at();

alter table public.template_folders enable row level security;
alter table public.workout_template_exercises enable row level security;

drop policy if exists template_folders_superadmin_all on public.template_folders;
create policy template_folders_superadmin_all on public.template_folders
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists template_folders_coach_own_all on public.template_folders;
create policy template_folders_coach_own_all on public.template_folders
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists workout_template_exercises_superadmin_all on public.workout_template_exercises;
create policy workout_template_exercises_superadmin_all on public.workout_template_exercises
  for all using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists workout_template_exercises_coach_scope on public.workout_template_exercises;
create policy workout_template_exercises_coach_scope on public.workout_template_exercises
  for all using (
    exists (select 1 from public.workout_templates where workout_templates.id = workout_template_exercises.template_id and workout_templates.coach_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workout_templates where workout_templates.id = workout_template_exercises.template_id and workout_templates.coach_id = auth.uid())
  );

-- Salvataggio atomico modello + esercizi (stesso pattern di save_workout_plan
-- sopra: is_valid_uuid decide insert/update per riga, righe non ripresentate
-- vengono rimosse). coach_id NON viene MAI letto dal payload: si ricava
-- sempre e solo da auth.uid(), cosi' un payload manomesso lato app non puo'
-- mai far scrivere/aggiornare un modello per conto di un altro coach.
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
  v_exercise jsonb;
  v_seen_ids uuid[] := '{}';
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
      sort_order = coalesce((payload->>'sort_order')::integer, 0)
    where id = v_template_id and coach_id = v_coach_id
    returning id into v_template_id;

    if v_template_id is null then
      raise exception 'NOT_FOUND: scheda modello non trovata o non di proprieta'' di questo coach';
    end if;
  else
    insert into public.workout_templates (coach_id, folder_id, name, description, goal, level, sort_order)
    values (v_coach_id, v_folder_id, payload->>'name', nullif(payload->>'description', ''), nullif(payload->>'goal', ''), nullif(payload->>'level', ''), coalesce((payload->>'sort_order')::integer, 0))
    returning id into v_template_id;
  end if;

  for v_exercise in select * from jsonb_array_elements(coalesce(payload->'exercises', '[]'::jsonb))
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
        superset_group_id = nullif(v_exercise->>'superset_group_id', '')
      where id = v_ex_id and template_id = v_template_id
      returning id into v_ex_id;

      if v_ex_id is null then
        raise exception 'INVALID_PAYLOAD: esercizio del modello non trovato per aggiornamento';
      end if;
    else
      insert into public.workout_template_exercises (
        template_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        target_weight, rest_seconds, notes, technique_type, superset_group_id
      ) values (
        v_template_id, v_exercise->>'exercise_id', (v_exercise->>'exercise_order')::integer,
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

  delete from public.workout_template_exercises
  where template_id = v_template_id
    and (array_length(v_seen_ids, 1) is null or id <> all (v_seen_ids));

  update public.workout_templates set updated_at = now() where id = v_template_id;

  return v_template_id;
end;
$$;

revoke all on function public.save_workout_template(jsonb) from public, anon;
grant execute on function public.save_workout_template(jsonb) to authenticated;

-- Eliminazione cartella: p_mode 'move_to_root' sposta modelli/sottocartelle
-- direttamente contenuti in "Senza categoria" (folder_id/parent_folder_id
-- null) prima di eliminare SOLO la cartella indicata (le sottocartelle
-- restano, ora di primo livello); p_mode 'delete_all' elimina ricorsivamente
-- l'intero sottoalbero (sottocartelle + modelli, coi loro esercizi via
-- cascade). Mai una cancellazione implicita: l'app passa sempre uno dei due
-- valori in base alla scelta esplicita del coach.
create or replace function public.delete_template_folder(p_folder_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid;
  v_descendants uuid[];
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;
  if p_mode not in ('move_to_root', 'delete_all') then
    raise exception 'INVALID_PAYLOAD: modalita'' di eliminazione non valida';
  end if;

  select coach_id into v_coach_id from public.template_folders where id = p_folder_id;
  if v_coach_id is null then
    raise exception 'NOT_FOUND: cartella non trovata';
  end if;
  if v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il proprietario di questa cartella';
  end if;

  if p_mode = 'move_to_root' then
    update public.workout_templates set folder_id = null where folder_id = p_folder_id;
    update public.template_folders set parent_folder_id = null where parent_folder_id = p_folder_id;
    delete from public.template_folders where id = p_folder_id;
  else
    -- 'delete_all': raccoglie l'intero sottoalbero (la cartella indicata +
    -- tutte le sottocartelle a qualunque profondita') UNA volta in un array,
    -- poi elimina prima i modelli (workout_templates.folder_id ha "on delete
    -- set null", quindi eliminare le cartelle da sole li orfanerebbe in
    -- "Senza categoria" invece di rimuoverli: qui la scelta esplicita del
    -- coach e' "elimina anche il contenuto", quindi vanno rimossi PRIMA,
    -- esplicitamente, cosi' i loro esercizi seguono via cascade), poi le
    -- cartelle stesse.
    with recursive descendants(id) as (
      select id from public.template_folders where id = p_folder_id
      union all
      select template_folders.id from public.template_folders
      join descendants on template_folders.parent_folder_id = descendants.id
    )
    select array_agg(id) into v_descendants from descendants;

    delete from public.workout_templates where coach_id = v_coach_id and folder_id = any(v_descendants);
    delete from public.template_folders where id = any(v_descendants);
  end if;
end;
$$;

revoke all on function public.delete_template_folder(uuid, text) from public, anon;
grant execute on function public.delete_template_folder(uuid, text) to authenticated;

-- Assegna una COPIA INDIPENDENTE del modello a un cliente: crea una riga
-- workout_plans + workout_days(day_order=1) + workout_day_exercises reali,
-- scollegate dal modello per ogni campo di contenuto (solo template_id resta
-- come riferimento storico, "creato da questo modello" — modificare il
-- modello in futuro non tocca mai questa copia, ne' viceversa). Il cliente
-- deve avere status ESATTAMENTE 'active' nella relazione coach_clients (non
-- 'invited'/'suspended'/'removed': is_coach_for_client() accetta anche
-- 'invited', qui serve un controllo piu' stretto, richiesto esplicitamente).
create or replace function public.assign_workout_template_to_client(p_template_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid;
  v_template_name text;
  v_client_active boolean;
  v_plan_id uuid;
  v_day_id uuid;
  v_start_date date := current_date;
  v_expiry_date date := current_date + interval '90 days';
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: sessione mancante';
  end if;

  select coach_id, name into v_coach_id, v_template_name from public.workout_templates where id = p_template_id;
  if v_coach_id is null then
    raise exception 'NOT_FOUND: scheda modello non trovata';
  end if;
  if v_coach_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'FORBIDDEN: non sei il proprietario di questo modello';
  end if;

  select exists (
    select 1 from public.coach_clients
    where coach_clients.coach_id = v_coach_id
      and coach_clients.client_id = p_client_id
      and coach_clients.status = 'active'
  ) into v_client_active;
  if not v_client_active then
    raise exception 'CLIENT_NOT_ACTIVE: il cliente indicato non e'' un cliente active di questo coach';
  end if;

  v_status := case
    when v_expiry_date < current_date then 'expired'
    when v_expiry_date <= current_date + 7 then 'expiring'
    else 'active'
  end;

  insert into public.workout_plans (coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status)
  values (v_coach_id, p_client_id, p_template_id, v_template_name, v_status, v_start_date, v_expiry_date, 'todo')
  returning id into v_plan_id;

  insert into public.workout_days (workout_plan_id, day_order) values (v_plan_id, 1) returning id into v_day_id;

  insert into public.workout_day_exercises (
    workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
    target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds
  )
  select v_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
    target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds
  from public.workout_template_exercises
  where template_id = p_template_id
  order by exercise_order;

  return v_plan_id;
end;
$$;

revoke all on function public.assign_workout_template_to_client(uuid, uuid) from public, anon;
grant execute on function public.assign_workout_template_to_client(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
