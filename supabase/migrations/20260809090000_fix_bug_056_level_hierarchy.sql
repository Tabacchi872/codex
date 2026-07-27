-- fix: BUG-056 — gambe-bulgarian-split-squat (min_level='advanced') era usato
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
  where id = '78797705-9352-4d8d-a2f9-dc7a88527f76'
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
  where id = 'f22bd840-9c42-4f22-b0de-c04d7a6ecdf1'
    and exercise_id = 'glutei-squat-sumo';
  if v_count <> 1 then
    raise exception 'BUG_056_UNEXPECTED_CHANGE: la riga Lower B posizione 1 (non oggetto di questa correzione) risulta modificata rispetto all''atteso.';
  end if;
end $$;

notify pgrst, 'reload schema';
