-- fix: BUG-056 — gambe-bulgarian-split-squat (min_level='advanced') era usato

create or replace function pg_temp._legacy_wte_selector(p_template_name text, p_day_name text, p_position integer)
returns uuid language plpgsql as $$
declare v_count integer; v_id uuid;
begin
  select count(*) into v_count from public.workout_template_exercises wte join public.workout_template_days wtd on wtd.id = wte.template_day_id join public.workout_templates wt on wt.id = wtd.template_id where wt.name=p_template_name and wtd.name=p_day_name and wte.exercise_order=p_position;
  select wte.id into v_id from public.workout_template_exercises wte join public.workout_template_days wtd on wtd.id=wte.template_day_id join public.workout_templates wt on wt.id=wtd.template_id where wt.name=p_template_name and wtd.name=p_day_name and wte.exercise_order=p_position order by wte.id limit 1;
  if v_count <> 1 then raise exception 'BUG_056_SELECTOR_MISMATCH: template %, giorno %, posizione % ha cardinalita %',p_template_name,p_day_name,p_position,v_count; end if;
  return v_id;
end $$;
-- nel template "Manubri ed Elastici" (Intermedio). Regola definitiva dei
-- livelli (beginner=1, intermediate=2, advanced=3): un esercizio è
-- compatibile quando exercise.min_level <= template.level. Un template
-- Intermedio non può contenere esercizi advanced.
--
-- Sostituzione: gambe-bulgarian-split-squat (advanced, home_basic, lunge,
-- quadricipiti, unilaterale, substitution_group='lunge_bodyweight_quad') ->
-- gambe-affondi (intermediate, bodyweight_only, lunge, quadricipiti,
-- unilaterale, stesso substitution_group). Preserva schema di movimento,
-- gruppo muscolare, categoria e unilateralità; il livello NON è stato
-- abbassato artificialmente nei metadati (gambe-bulgarian-split-squat resta
-- 'advanced' per chiunque altro lo usi) e il livello del template NON è
-- stato alzato: è stato scelto un esercizio realmente 'intermediate' già
-- presente nello stesso substitution_group.
do $$
declare
  v_count integer;
begin
  update public.workout_template_exercises
  set exercise_id = 'gambe-affondi',
      notes = 'Con manubri: ginocchio anteriore sopra la caviglia, busto eretto.'
  where id = pg_temp._legacy_wte_selector('Manubri ed Elastici','Lower B',2)
    and exercise_id = 'gambe-bulgarian-split-squat'
    and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_056_MISMATCH: riga Manubri ed Elastici/Lower B pos.2 non nello stato atteso (gambe-bulgarian-split-squat, 3x11 10-12, rest 75) — verificare prima di procedere.';
  end if;
end $$;

-- Verifica esplicita di non-regressione su una riga adiacente non toccata
-- (stesso giorno, posizione 1: glutei-squat-sumo).
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.workout_template_exercises
  where id = pg_temp._legacy_wte_selector('Manubri ed Elastici','Lower B',1)
    and exercise_id = 'glutei-squat-sumo';
  if v_count <> 1 then
    raise exception 'BUG_056_UNEXPECTED_CHANGE: la riga Lower B posizione 1 (non oggetto di questa correzione) risulta modificata rispetto all''atteso.';
  end if;
end $$;

notify pgrst, 'reload schema';
