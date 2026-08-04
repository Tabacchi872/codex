-- BUG-068: il motore dinamico (20260819090000_dynamic_auto_program_engine.sql)
-- sceglieva sempre lo stesso "primo" esercizio (ordine alfabetico di exercise_id)
-- per ogni combinazione goal/livello/luogo/attrezzatura/famiglia, in ogni
-- ambiente, per ogni cliente, per ogni giorno di uno stesso piano. Misurato:
-- solo 27 esercizi distinti su 2100 combinazioni reali testate (dopo BUG-067).
--
-- Fix: tie-break finale del picker sostituito da un hash deterministico di
-- (cycle_id + indice giorno) + exercise_id, invece del solo ordine alfabetico.
-- Stesso ciclo e stesso giorno -> stesso seed sempre (deterministico per
-- costruzione, non solo per la guardia strutturale sullo stato del ciclo);
-- cicli diversi (nuovi cicli/rinnovi per lo stesso cliente, o clienti diversi)
-- e giorni diversi dello stesso piano -> seed diverso -> varieta' reale.
--
-- Non tocca in alcun modo _select_dynamic_auto_exercise_candidates ne' il suo
-- where: il filtro equipment/livello/luogo/esclusioni e il conteggio di
-- cardinalita' di BUG-066 restano del tutto separati da questo cambiamento.
--
-- Verificato (2026-08-04): _assemble_dynamic_auto_program e' definita e
-- chiamata in un solo file, con esattamente 2 punti di chiamata, entrambi
-- legati a un cycle_id appena creato (transizione pending_template->active in
-- assign_initial_auto_program, o inserimento di un nuovo ciclo in
-- run_cycle_review); il corpo della funzione contiene solo insert, mai update,
-- su workout_plans/workout_days/workout_day_exercises. Verificato anche in modo
-- concreto (non solo per lettura del codice): creato un ciclo con un piano
-- reale, fotografate le righe esatte di workout_day_exercises (id, exercise_id,
-- updated_at inclusi), generato un secondo ciclo per lo stesso cliente, e
-- ri-fotografate le righe del primo ciclo -> checksum identico, zero
-- differenze riga per riga, updated_at invariato. Ripetuto il test reale sulle
-- 2100 combinazioni (stesso harness di BUG-066/067, non modificato): 0
-- eccezioni, 0 violazioni equipment/livello/luogo, esercizi distinti usati
-- saliti da 27 a 149.

begin;

-- create or replace function non sostituisce una funzione esistente quando si
-- aggiunge un nuovo parametro (anche con default): crea un secondo overload,
-- lasciando la vecchia versione a 7 argomenti orfana ma ancora presente e
-- chiamabile (verificato concretamente su reset locale, non per deduzione).
-- Rimossa esplicitamente per evitare ambiguita' futura, dato che nessun
-- chiamante la usa piu' (unico chiamante, _assemble_dynamic_auto_program,
-- aggiornato per passare sempre 8 argomenti).
drop function if exists public._dynamic_auto_program_pick(text,text,text,text,uuid,text,text[]);

create or replace function public._dynamic_auto_program_pick(
  p_goal text,
  p_level text,
  p_location text,
  p_equipment_level text,
  p_client_id uuid,
  p_family text,
  p_used text[] default '{}'::text[],
  p_seed text default ''
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Il tie-break finale non e' piu' il solo ordine alfabetico di exercise_id
  -- (che sceglieva sempre lo stesso esercizio per ogni combinazione goal/
  -- livello/luogo/attrezzatura), ma un hash deterministico di p_seed +
  -- exercise_id. p_seed e' calcolato dal chiamante come cycle_id + indice
  -- giorno.
  select c.exercise_id
  from public._select_dynamic_auto_exercise_candidates(p_goal, p_level, p_location, p_equipment_level, p_client_id) c
  where (
      c.family = p_family
      or (p_family = 'pull' and c.family = 'pull_regression' and coalesce(p_level, 'Principiante') in ('Principiante','beginner') and coalesce(p_equipment_level, 'bodyweight_only') = 'bodyweight_only')
    )
    and c.exercise_id <> all(coalesce(p_used, '{}'::text[]))
  order by
    case when c.family = p_family then 0 else 1 end,
    case c.role when 'primary' then 0 when 'secondary' then 1 else 2 end,
    md5(coalesce(p_seed, '') || c.exercise_id)
  limit 1;
$function$;

revoke all on function public._dynamic_auto_program_pick(text,text,text,text,uuid,text,text[],text) from public, anon, authenticated;

create or replace function public._assemble_dynamic_auto_program(
  p_cycle_id uuid,
  p_client_id uuid,
  p_goal text,
  p_level text,
  p_location text,
  p_days integer,
  p_duration integer,
  p_equipment_level text,
  p_name_prefix text default 'Programma automatico dinamico'
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan_ids uuid[] := '{}';
  v_day integer;
  v_plan_id uuid;
  v_day_id uuid;
  v_used text[];
  v_slots text[];
  v_slot text;
  v_exercise_id text;
  v_order integer;
  v_sets integer;
  v_reps integer;
  v_rest integer;
  v_day_label text;
  v_seed text;
begin
  if not public._dynamic_auto_program_available(p_goal, p_level, p_location, p_days, p_duration, p_equipment_level, p_client_id) then
    raise exception 'DYNAMIC_AUTO_PROGRAM_UNAVAILABLE';
  end if;

  v_sets := case p_level when 'Principiante' then 2 when 'Intermedio' then 3 else 3 end;
  v_reps := case p_goal when 'Forza' then 6 when 'Dimagrimento' then 12 when 'Performance' then 10 else 10 end;
  v_rest := case p_goal when 'Forza' then 120 when 'Dimagrimento' then 60 else 75 end;

  for v_day in 1..p_days loop
    v_used := '{}';
    -- Seed deterministico su cycle_id + indice giorno. Stesso ciclo e stesso
    -- giorno -> stesso seed sempre (idempotente); giorni diversi dello stesso
    -- piano e cicli diversi (rinnovi, altri clienti) -> seed diverso.
    v_seed := p_cycle_id::text || v_day::text;
    v_day_label := case
      when p_days <= 3 then 'Full Body ' || chr(64 + v_day)
      when p_days = 4 and v_day in (1,3) then 'Lower ' || case when v_day = 1 then 'A' else 'B' end
      when p_days = 4 then 'Upper ' || case when v_day = 2 then 'A' else 'B' end
      when p_days = 5 and v_day = 5 then 'Conditioning'
      when p_days >= 6 and v_day > 5 then 'Recovery ' || (v_day - 5)::text
      else 'Workout ' || v_day::text
    end;

    v_slots := case
      when p_days = 4 and v_day in (1,3) then array['lower','core','lower']
      when p_days = 4 then array['push','pull','core','push']
      when p_days = 5 and v_day = 5 then array['conditioning','core','recovery']
      when p_days >= 6 and v_day > 5 then array['recovery','core','conditioning']
      else array['lower','push','pull','core']
    end;

    insert into public.workout_plans(coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
    values (null, p_client_id, null, p_name_prefix || ' - ' || v_day_label, 'active', current_date, current_date + interval '90 days', 'todo', v_day_label, 'auto_system')
    returning id into v_plan_id;

    insert into public.client_program_cycle_plans(cycle_id, workout_plan_id)
    values (p_cycle_id, v_plan_id)
    on conflict do nothing;

    insert into public.workout_days(workout_plan_id, day_order)
    values (v_plan_id, 1)
    returning id into v_day_id;

    v_order := 1;
    foreach v_slot in array v_slots loop
      v_exercise_id := public._dynamic_auto_program_pick(p_goal, p_level, p_location, p_equipment_level, p_client_id, v_slot, v_used, v_seed);
      if v_exercise_id is null and v_slot = 'recovery' then
        v_exercise_id := public._dynamic_auto_program_pick(p_goal, p_level, p_location, p_equipment_level, p_client_id, 'conditioning', v_used, v_seed);
      end if;
      if v_exercise_id is null then
        raise exception 'DYNAMIC_AUTO_PROGRAM_SLOT_UNAVAILABLE: %', v_slot;
      end if;
      insert into public.workout_day_exercises(
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        rest_seconds, notes, technique_type, duration_seconds, rpe_rir
      ) values (
        v_day_id, v_exercise_id, v_order,
        case when v_slot in ('recovery','conditioning') and p_days >= 6 then greatest(1, v_sets - 1) else v_sets end,
        case when v_slot = 'conditioning' then 1 else v_reps end,
        case when v_slot = 'conditioning' then null else greatest(1, v_reps - 2) end,
        case when v_slot = 'conditioning' then null else v_reps + 2 end,
        case when v_slot = 'conditioning' then 0 else v_rest end,
        case when v_slot = 'pull' and exists (select 1 from public.exercise_movement_metadata where exercise_id = v_exercise_id and substitution_group = 'upper_pull_beginner_ground_regression')
          then 'Regressione scapolare/posteriore approvata per Principiante + bodyweight_only: non classificata come trazione reale.'
          else 'Selezione dinamica automatica: goal, livello, luogo, attrezzatura ed esclusioni rispettati.' end,
        'normal',
        case when v_slot = 'conditioning' then least(greatest(coalesce(p_duration,45) * 60 / 5, 300), 900) else null end,
        case when p_level = 'Principiante' then 'RIR 3' else 'RIR 2' end
      );
      v_used := array_append(v_used, v_exercise_id);
      v_order := v_order + 1;
    end loop;

    v_plan_ids := array_append(v_plan_ids, v_plan_id);
  end loop;

  return v_plan_ids;
end;
$function$;

revoke all on function public._assemble_dynamic_auto_program(uuid,uuid,text,text,text,integer,integer,text,text) from public, anon, authenticated;

commit;
