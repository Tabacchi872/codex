-- Fase 1 — integrazione YMove nel motore automatico: seed metadata per i 50
-- esercizi UUID distinti usati dagli 8 template "Allenamenti YMove"
-- (classificazione manuale, MAI copiata da YMove.difficulty — vedi
-- decisione esplicita) + abilitazione guardata di un SOLO template pilota,
-- "Forza Base YMove", come candidato del motore automatico.
--
-- Nessuna chiamata YMove: equipment/muscle_group vengono letti da
-- public.exercises (gia' importato), la classificazione di movement_pattern/
-- equipment_tag/compatible_locations/min_level e' un giudizio di
-- programmazione indipendente, riportato nel report della sessione con le
-- motivazioni per esercizio.
--
-- is_ymove resta provenienza/catalogo, auto_eligible resta "puo' essere
-- usato dal motore automatico": restano due colonne indipendenti, mai
-- combinate in _match_auto_template (nessuna modifica al matcher, nessun
-- ORDER BY is_ymove, nessuna priorita' artificiale).

-- ============================================================================
-- PARTE A — seed exercise_movement_metadata per i 50 UUID YMove
-- ============================================================================
insert into public.exercise_movement_metadata
  (exercise_id, movement_pattern, primary_muscle_group, equipment_tag, compatible_locations, min_level, role, movement_class)
values
  -- Dorso
  ('65c1b360-af01-43b5-88fa-41da784d0a75', 'hinge',           'dorsali',      'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Deadlift
  ('dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 'horizontal_pull', 'dorsali',      'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Rows
  ('d9a1f929-03d3-4d32-b501-69e0ec4367e0', 'horizontal_pull', 'dorsali',      'full_gym',      array['gym'],       'beginner',     'primary',   'compound'),  -- Cable Seated Row straight bar
  ('dc4339c1-8340-4dc2-8843-695e35356545', 'vertical_pull',   'dorsali',      'full_gym',      array['gym'],       'beginner',     'primary',   'compound'),  -- Close Grip Lat Pulldown
  ('7858f90c-347c-463d-b000-9acda35c1c8d', 'horizontal_pull', 'dorsali',      'home_basic',    array['gym','home'],'intermediate', 'accessory', 'compound'),  -- Dumbbell Gorilla Row
  -- Bicipiti
  ('e059a5e9-44a8-4286-98c2-871d1d371f1e', 'isolation_arms',  'bicipiti',     'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Barbell Curls
  ('b43b9122-2bd5-479c-85f5-64a23da144f0', 'isolation_arms',  'bicipiti',     'home_basic',    array['gym','home'],'beginner',     'accessory', 'isolation'), -- Concentration Curl
  ('ae8d46db-158c-4265-8f25-65b570a617d0', 'isolation_arms',  'bicipiti',     'home_basic',    array['gym','home'],'beginner',     'accessory', 'isolation'), -- Cross Body Hammer Curl
  ('40495e2c-6204-49ce-8499-7a0c7bb5654e', 'isolation_arms',  'bicipiti',     'home_basic',    array['gym','home'],'beginner',     'accessory', 'isolation'), -- Dumbbell Curl
  -- Polpacci
  ('357a1917-13d4-477a-8799-33de2e0d1471', 'isolation_legs',  'polpacci',     'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Barbell calf raises
  ('7850c2d1-bf6c-426e-b0d4-35344b062cae', 'isolation_legs',  'polpacci',     'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Calf Raises (box)
  -- Petto
  ('5ea85917-336a-4495-9cf5-8b915089c77e', 'horizontal_push', 'petto',        'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Incline Bench Press
  ('d50e421a-23ed-4a43-8983-1e33c1b167f4', 'horizontal_push', 'petto',        'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Bench Press
  ('d25aad24-4e4f-4f02-b6c9-6edd7c398210', 'horizontal_push', 'petto',        'home_basic',    array['gym','home'],'beginner',     'primary',   'compound'),  -- Close Grip Incline Dumbbell Press
  ('c75ac0e9-6832-465c-8055-361bc74dd850', 'isolation_arms',  'petto',        'home_basic',    array['gym','home'],'intermediate', 'accessory', 'isolation'), -- Dumbbell fly
  -- Core
  ('ba8e4824-b2b4-4dab-adea-6325f7b9e6da', 'core_anti_rotation','obliqui',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Bicycle punches
  ('66053a02-07f4-4e86-9672-6af16e332ebc', 'core_anti_extension','addome',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Butterfly crunches
  ('317446c0-20a0-4af9-b49b-ddb99ef3bed2', 'core_anti_extension','addome',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Crunches
  ('1c3a7bc0-6994-4dd5-855d-7bac3fe2e010', 'core_anti_rotation','addome',     'bodyweight_only',array['gym','home'],'intermediate','accessory', 'isolation'), -- Elbow to knee plank
  ('2cb18845-ea52-4106-bab2-70aaf6347a56', 'core_anti_extension','addome',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Flutter kicks
  -- Full body / condizionamento
  ('f125e930-66ae-45fe-ba8d-05ced77c7e58', 'carry',           'full_body',    'bodyweight_only',array['gym','home'],'intermediate','accessory', 'compound'),  -- Bear crawls
  ('92a23d34-138a-4e77-9776-f93ecccf9d61', 'cardio',          'full_body',    'bodyweight_only',array['gym','home'],'intermediate','accessory', 'compound'),  -- Broad jumps
  ('d2adc6a8-0bb7-4b88-9595-9c9316485477', 'cardio',          'full_body',    'bodyweight_only',array['gym','home'],'intermediate','accessory', 'compound'),  -- Burpee
  ('216f3804-a718-4051-b058-698027918147', 'cardio',          'full_body',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'compound'),  -- Butt kickers
  ('83dd2152-cccf-4ec4-8419-0363c3bcb909', 'cardio',          'full_body',    'home_basic',    array['gym','home'],'intermediate', 'accessory', 'compound'),  -- Devil press
  -- Glutei
  ('745a1200-9d2d-4b8e-ac02-c155e4674ea2', 'hinge',           'glutei',       'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Hip Thrust
  ('7f9c16ef-c520-43cf-9eac-c88ea2d06b02', 'isolation_legs',  'glutei',       'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Cable Hip Abduction
  ('384585ba-9dfd-4add-87d1-eed27b73ab56', 'isolation_legs',  'glutei',       'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Fire Hydrant
  -- Femorali
  ('97e76a72-07b9-450c-8109-99d06d6ce9fc', 'hinge',           'femorali',     'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Good Morning
  ('157b3ccc-4f2b-46b8-88ab-898069fe6dc7', 'hinge',           'femorali',     'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Romanian Deadlift
  ('ce51cee0-ae88-4a4f-9a70-1695aa7a8222', 'hinge',           'femorali',     'home_basic',    array['gym','home'],'beginner',     'primary',   'compound'),  -- Dumbbell Romanian Deadlift
  -- Spalle (incl. lateral_deltoids YMove)
  ('4a1fa324-d6ce-44a2-9af7-e74e87375805', 'isolation_arms',  'spalle',       'home_basic',    array['gym','home'],'beginner',     'accessory', 'isolation'), -- Dumbbell Lateral Raise
  -- Quadricipiti
  ('a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 'squat',           'quadricipiti', 'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Back Squat
  ('97182619-8a87-4b66-8bd2-891666df2e5c', 'squat',           'quadricipiti', 'bodyweight_only',array['gym','home'],'beginner',    'primary',   'compound'),  -- Bodyweight Squat
  ('577d4216-30bd-404b-a2d0-7ab89fdec02b', 'cardio',          'quadricipiti', 'full_gym',      array['gym'],       'intermediate', 'accessory', 'compound'),  -- Box Jump
  ('f14fccfe-0f5e-43c9-a30d-afbdd1e2fa1b', 'squat',           'quadricipiti', 'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Box Squat
  ('1985f5c0-f5c1-44ba-8055-98cd809e930c', 'isolation_legs',  'quadricipiti', 'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Chair Leg Extension
  ('9991ba43-5607-4a23-9698-427f03237912', 'lunge',           'quadricipiti', 'home_basic',    array['gym','home'],'beginner',     'primary',   'compound'),  -- Dumbbell Lunges
  ('228c0e6c-0145-4090-a01c-7d501a49ef01', 'squat',           'quadricipiti', 'home_basic',    array['gym','home'],'beginner',     'primary',   'compound'),  -- Dumbbell Squat
  -- Spalle
  ('c705c9a5-c43d-4b41-8df0-ea403f22efcc', 'isolation_arms',  'spalle',       'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Barbell Front Raise
  ('25420680-74ae-4e14-a37a-9df38dc6472f', 'vertical_push',   'spalle',       'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Barbell Overhead Press
  ('1b8316a9-c822-45d3-8663-dc4b5aec86cb', 'isolation_arms',  'spalle',       'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Barbell Shrug
  ('f15bee0f-60f1-45f9-8fdb-bcf582871263', 'isolation_arms',  'spalle',       'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Cable Lateral Raise
  ('69406ca5-ead5-4c41-9843-2784c01551c8', 'isolation_arms',  'spalle',       'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Cable Rope Face Pull
  ('d24d94ea-6a02-41da-ad63-01d07008466a', 'vertical_push',   'spalle',       'home_basic',    array['gym','home'],'beginner',     'primary',   'compound'),  -- Dumbbell Overhead Press
  -- Tricipiti
  ('c31dec83-a8e7-475a-a00c-c706802a851c', 'isolation_arms',  'tricipiti',    'full_gym',      array['gym'],       'intermediate', 'accessory', 'isolation'), -- Barbell Skull Crushers
  ('96679980-4d8b-47f0-a6d3-33ed69957bf0', 'isolation_arms',  'tricipiti',    'bodyweight_only',array['gym','home'],'beginner',    'accessory', 'isolation'), -- Bench Dips
  ('86c37f52-7230-4e81-b87f-cd6cd2be71a6', 'isolation_arms',  'tricipiti',    'full_gym',      array['gym'],       'beginner',     'accessory', 'isolation'), -- Cable Tricep Pushdown
  ('01d82cfc-0c3f-465d-a6bd-61aaeb684e9f', 'horizontal_push', 'tricipiti',    'full_gym',      array['gym'],       'intermediate', 'primary',   'compound'),  -- Close Grip Bench Barbell
  ('19e3fd0f-3b8d-450a-b852-46e669fe5793', 'isolation_arms',  'tricipiti',    'home_basic',    array['gym','home'],'intermediate', 'accessory', 'isolation')  -- Dumbbell Skull Crushers
on conflict (exercise_id) do nothing;

-- substitution_group deliberatamente NULL per tutti i 50: usato solo dalla
-- sostituzione automatica di run_cycle_review in decisione 'partial_change'
-- (fuori perimetro di questo pilota, che riguarda solo l'eleggibilita'
-- iniziale/di matching) — un gruppo non popolato significa "nessuna
-- sostituzione automatica proposta per questo esercizio specifico", mai un
-- comportamento non sicuro (fallback: l'esercizio resta invariato).

do $$
declare
  v_seeded_count integer;
begin
  select count(*) into v_seeded_count
  from public.exercise_movement_metadata
  where exercise_id in (
    '65c1b360-af01-43b5-88fa-41da784d0a75','dbc5917a-99a9-4a5e-90b0-5c2e30670e20','d9a1f929-03d3-4d32-b501-69e0ec4367e0',
    'dc4339c1-8340-4dc2-8843-695e35356545','7858f90c-347c-463d-b000-9acda35c1c8d','e059a5e9-44a8-4286-98c2-871d1d371f1e',
    'b43b9122-2bd5-479c-85f5-64a23da144f0','ae8d46db-158c-4265-8f25-65b570a617d0','40495e2c-6204-49ce-8499-7a0c7bb5654e',
    '357a1917-13d4-477a-8799-33de2e0d1471','7850c2d1-bf6c-426e-b0d4-35344b062cae','5ea85917-336a-4495-9cf5-8b915089c77e',
    'd50e421a-23ed-4a43-8983-1e33c1b167f4','d25aad24-4e4f-4f02-b6c9-6edd7c398210','c75ac0e9-6832-465c-8055-361bc74dd850',
    'ba8e4824-b2b4-4dab-adea-6325f7b9e6da','66053a02-07f4-4e86-9672-6af16e332ebc','317446c0-20a0-4af9-b49b-ddb99ef3bed2',
    '1c3a7bc0-6994-4dd5-855d-7bac3fe2e010','2cb18845-ea52-4106-bab2-70aaf6347a56','f125e930-66ae-45fe-ba8d-05ced77c7e58',
    '92a23d34-138a-4e77-9776-f93ecccf9d61','d2adc6a8-0bb7-4b88-9595-9c9316485477','216f3804-a718-4051-b058-698027918147',
    '83dd2152-cccf-4ec4-8419-0363c3bcb909','745a1200-9d2d-4b8e-ac02-c155e4674ea2','7f9c16ef-c520-43cf-9eac-c88ea2d06b02',
    '384585ba-9dfd-4add-87d1-eed27b73ab56','97e76a72-07b9-450c-8109-99d06d6ce9fc','157b3ccc-4f2b-46b8-88ab-898069fe6dc7',
    'ce51cee0-ae88-4a4f-9a70-1695aa7a8222','4a1fa324-d6ce-44a2-9af7-e74e87375805','a0a04272-c27b-4a7b-9beb-0b6b3d4423e2',
    '97182619-8a87-4b66-8bd2-891666df2e5c','577d4216-30bd-404b-a2d0-7ab89fdec02b','f14fccfe-0f5e-43c9-a30d-afbdd1e2fa1b',
    '1985f5c0-f5c1-44ba-8055-98cd809e930c','9991ba43-5607-4a23-9698-427f03237912','228c0e6c-0145-4090-a01c-7d501a49ef01',
    'c705c9a5-c43d-4b41-8df0-ea403f22efcc','25420680-74ae-4e14-a37a-9df38dc6472f','1b8316a9-c822-45d3-8663-dc4b5aec86cb',
    'f15bee0f-60f1-45f9-8fdb-bcf582871263','69406ca5-ead5-4c41-9843-2784c01551c8','d24d94ea-6a02-41da-ad63-01d07008466a',
    'c31dec83-a8e7-475a-a00c-c706802a851c','96679980-4d8b-47f0-a6d3-33ed69957bf0','86c37f52-7230-4e81-b87f-cd6cd2be71a6',
    '01d82cfc-0c3f-465d-a6bd-61aaeb684e9f','19e3fd0f-3b8d-450a-b852-46e669fe5793'
  ) and is_active;

  raise notice 'YMOVE_AUTO_METADATA_SEED_COUNT seeded=%', v_seeded_count;

  if v_seeded_count <> 50 then
    raise exception 'YMOVE_AUTO_METADATA_SEED_INCOMPLETE: attesi 50 esercizi con metadata attivo, trovati %', v_seeded_count;
  end if;

  -- Nessun esercizio orfano: ogni exercise_id usato dagli 8 template YMove
  -- deve comparire tra quelli appena seminati (copertura 50/50 reale, non
  -- solo il conteggio).
  if exists (
    select 1
    from public.workout_templates wt
    join public.workout_template_days wtd on wtd.template_id = wt.id
    join public.workout_template_exercises wte on wte.template_day_id = wtd.id
    left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
    where wt.is_ymove and emm.exercise_id is null
  ) then
    raise exception 'YMOVE_AUTO_METADATA_SEED_INCOMPLETE: almeno un esercizio degli 8 template YMove resta senza metadata attivo';
  end if;
end
$$;

-- ============================================================================
-- PARTE B — pilota: SOLO "Forza Base YMove" diventa auto_eligible=true
-- ============================================================================
-- Nessun ORDER BY is_ymove, nessuna modifica a _match_auto_template: Forza
-- Base YMove diventa un candidato normale, selezionato dal matcher esistente
-- con gli stessi criteri di qualunque altro template. E' l'unico degli 8
-- senza un concorrente auto_eligible sullo stesso slot goal/livello/
-- giorni/luogo (Forza + Intermedio + Palestra + 4 giorni), verificato prima
-- di questa migration.
do $$
declare
  v_tpl_id constant uuid := 'a1000000-0000-4000-8000-000000000006';
  v_row public.workout_templates%rowtype;
  v_day_count integer;
  v_missing_metadata_count integer;
  v_other_ymove_eligible integer;
  v_matched_id uuid;
begin
  -- Guard 1: template atteso, per ID fisso — non solo per nome.
  select * into v_row from public.workout_templates where id = v_tpl_id;
  if not found then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: template % non trovato', v_tpl_id;
  end if;
  if v_row.name <> 'Forza Base YMove' then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: nome inatteso per id % (trovato %)', v_tpl_id, v_row.name;
  end if;
  if not (v_row.is_system and v_row.is_ymove and v_row.is_active) then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: is_system=% is_ymove=% is_active=% (attesi tutti true)', v_row.is_system, v_row.is_ymove, v_row.is_active;
  end if;
  if v_row.goal <> 'Forza' or v_row.level <> 'Intermedio' or v_row.sessions_per_week <> 4 or v_row.location <> 'Palestra' then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: parametri inattesi goal=% level=% sessions_per_week=% location=%', v_row.goal, v_row.level, v_row.sessions_per_week, v_row.location;
  end if;
  if v_row.auto_eligible then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: auto_eligible gia'' true prima di questa migration (stato inatteso)';
  end if;

  -- Guard 2: giorni coerenti con sessions_per_week dichiarato.
  select count(*) into v_day_count from public.workout_template_days where template_id = v_tpl_id;
  if v_day_count <> v_row.sessions_per_week then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: giorni attesi % (sessions_per_week), trovati %', v_row.sessions_per_week, v_day_count;
  end if;

  -- Guard 3: TUTTI gli esercizi del template hanno metadata attivo.
  select count(*) into v_missing_metadata_count
  from public.workout_template_days wtd
  join public.workout_template_exercises wte on wte.template_day_id = wtd.id
  left join public.exercise_movement_metadata emm on emm.exercise_id = wte.exercise_id and emm.is_active
  where wtd.template_id = v_tpl_id
    and emm.exercise_id is null;
  if v_missing_metadata_count <> 0 then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: % esercizi senza exercise_movement_metadata attivo', v_missing_metadata_count;
  end if;

  raise notice 'FORZA_BASE_YMOVE_GUARDS_PASSED template_id=% day_count=%', v_tpl_id, v_day_count;

  -- Tutte le guard superate: abilita SOLO questo template.
  update public.workout_templates set auto_eligible = true where id = v_tpl_id;

  -- Self-test: il matcher deve ora restituire esattamente questo template
  -- per un cliente Forza/Intermedio/Palestra/4gg/full_gym.
  v_matched_id := public._match_auto_template('Forza', 'Intermedio', 'Palestra', 4, 60, null::uuid, 'full_gym');
  if v_matched_id is distinct from v_tpl_id then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: _match_auto_template non restituisce il template atteso (atteso %, ottenuto %)', v_tpl_id, v_matched_id;
  end if;

  -- Guard finale: nessun altro template YMove risulta auto_eligible.
  select count(*) into v_other_ymove_eligible
  from public.workout_templates
  where is_ymove and id <> v_tpl_id and auto_eligible;
  if v_other_ymove_eligible <> 0 then
    raise exception 'FORZA_BASE_YMOVE_GUARD_FAILED: % altri template YMove risultano auto_eligible=true, atteso 0', v_other_ymove_eligible;
  end if;

  raise notice 'FORZA_BASE_YMOVE_PILOT_ENABLED template_id=%', v_tpl_id;
end
$$;

notify pgrst, 'reload schema';
