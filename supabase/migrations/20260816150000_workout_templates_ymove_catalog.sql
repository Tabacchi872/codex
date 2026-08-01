-- feat: libreria "Allenamenti YMove" nell'area coach.
--
-- Aggiunge una distinzione minima e additiva ai modelli di sistema
-- esistenti (workout_templates.is_ymove, default false) per separare la
-- nuova libreria "Allenamenti YMove" dalla libreria "Professionali" già
-- esistente (18 modelli, migration 20260724090000), senza toccare
-- is_system/coach_id/RLS/RPC già in vigore: un modello YMove è comunque un
-- modello di sistema (is_system=true, coach_id=null), quindi apertura,
-- duplicazione ("Duplica nella mia libreria") e assegnazione a cliente
-- funzionano già identici, zero modifiche a save_workout_template/
-- assign_workout_template_to_client/RLS. is_ymove esiste SOLO per poter
-- raggruppare/filtrare la UI in due sezioni distinte.
--
-- Segue con 8 modelli YMove reali (3 Massa muscolare, 2 Dimagrimento,
-- 2 Forza, 1 Principianti), ciascuno con Workout A/B/... ed esercizi presi
-- ESCLUSIVAMENTE dal catalogo YMove già importato in produzione
-- (public.exercises, source='ymove', 360 righe, verificate active=true e
-- library_status='active' — nessun record quarantinato coinvolto). Ogni
-- exercise_id qui sotto è un UUID reale verificato via query diretta prima
-- di scrivere questa migration (nessun id inventato, nessun UUID-bridge:
-- workout_template_exercises.exercise_id è già "text", lo stesso
-- meccanismo già usato per gli esercizi storici locali). Solo INSERT,
-- nessuna modifica a righe esistenti: migration non distruttiva. Nessuna
-- serie prescritta "al cedimento": indicazioni RIR/RPE con margine.

alter table public.workout_templates add column if not exists is_ymove boolean not null default false;

alter table public.workout_templates drop constraint if exists workout_templates_ymove_requires_system_check;
alter table public.workout_templates add constraint workout_templates_ymove_requires_system_check
  check (not is_ymove or is_system);

create index if not exists workout_templates_is_ymove_idx on public.workout_templates(is_ymove) where is_ymove;

-- ============================================================================
-- MASSA MUSCOLARE
-- ============================================================================

do $$
declare
  -- ID fisso e noto in anticipo (non gen_random_uuid()): il rollback
  -- preparato in reports/ymove/output/rollback-ymove-workout-templates.sql
  -- deve poter operare sugli 8 ID esatti di QUESTA migration, non su un
  -- criterio (es. is_ymove=true) che in futuro potrebbe includere altri
  -- modelli YMove aggiunti da migration successive.
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000001'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Upper/Lower YMove',
    'Programma di ipertrofia Upper/Lower in 4 sedute a settimana, con esercizi del catalogo YMove per petto, dorso, spalle, gambe e braccia.',
    'Massa muscolare', 'Intermedio', 0,
    8, 4, 60, 'Bilanciere, manubri, cavi, macchine',
    'Palestra', 'Upper/Lower', 'Total body', 'Moderata-alta',
    'Aumentare il carico quando tutte le serie di un esercizio vengono completate a RIR 2 o superiore per due sedute consecutive. La settimana 8 è deload: stesso schema con circa il 30% di volume in meno.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A - Upper', 'Petto, dorso, spalle, braccia', 0, 60) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 1, 4, 9, 8, 10, 90, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_a, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 2, 4, 9, 8, 10, 90, null, 'Tirare con le scapole, non con le sole braccia.', 'RIR 2'),
    (v_day_a, '25420680-74ae-4e14-a37a-9df38dc6472f', 3, 3, 9, 8, 10, 90, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'dc4339c1-8340-4dc2-8843-695e35356545', 4, 3, 11, 10, 12, 75, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2'),
    (v_day_a, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_a, '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 6, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B - Lower', 'Quadricipiti, femorali, glutei, polpacci', 1, 60) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 4, 9, 8, 10, 120, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    (v_day_b, '157b3ccc-4f2b-46b8-88ab-898069fe6dc7', 2, 3, 9, 8, 10, 120, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_b, '9991ba43-5607-4a23-9698-427f03237912', 3, 3, 11, 10, 12, 90, null, 'Ginocchio anteriore sopra la caviglia, busto eretto.', 'RIR 2-3'),
    (v_day_b, '1985f5c0-f5c1-44ba-8055-98cd809e930c', 4, 3, 13, 12, 15, 60, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2-3'),
    (v_day_b, '357a1917-13d4-477a-8799-33de2e0d1471', 5, 3, 17, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C - Upper', 'Petto, dorso, spalle, braccia (variante)', 2, 60) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '5ea85917-336a-4495-9cf5-8b915089c77e', 1, 4, 9, 8, 10, 90, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_c, 'd9a1f929-03d3-4d32-b501-69e0ec4367e0', 2, 4, 9, 8, 10, 90, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_c, 'd24d94ea-6a02-41da-ad63-01d07008466a', 3, 3, 9, 8, 10, 90, null, 'Core attivo, movimento controllato.', 'RIR 2'),
    (v_day_c, '7858f90c-347c-463d-b000-9acda35c1c8d', 4, 3, 11, 10, 12, 75, null, 'Busto quasi parallelo al pavimento, gomito vicino al corpo.', 'RIR 2'),
    (v_day_c, '40495e2c-6204-49ce-8499-7a0c7bb5654e', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_c, '19e3fd0f-3b8d-450a-b852-46e669fe5793', 6, 3, 11, 10, 12, 60, null, 'Gomiti fermi, movimento controllato.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout D - Lower', 'Quadricipiti, femorali, glutei, polpacci (variante)', 3, 60) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, '745a1200-9d2d-4b8e-ac02-c155e4674ea2', 1, 4, 9, 8, 10, 120, null, 'Contrazione dei glutei in cima al movimento.', 'RIR 2'),
    (v_day_d, 'ce51cee0-ae88-4a4f-9a70-1695aa7a8222', 2, 3, 11, 10, 12, 90, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_d, '228c0e6c-0145-4090-a01c-7d501a49ef01', 3, 3, 11, 10, 12, 90, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2-3'),
    (v_day_d, '7f9c16ef-c520-43cf-9eac-c88ea2d06b02', 4, 3, 13, 12, 15, 60, null, 'Movimento controllato, busto stabile.', 'RIR 2-3'),
    (v_day_d, '7850c2d1-bf6c-426e-b0d4-35344b062cae', 5, 3, 17, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');
end
$$;

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000002'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Push Pull Legs YMove',
    'Ciclo Push/Pull/Legs classico in 3 sedute a settimana con esercizi del catalogo YMove, pensato per costruire massa su tutto il corpo.',
    'Massa muscolare', 'Intermedio', 1,
    8, 3, 65, 'Bilanciere, manubri, cavi',
    'Palestra', 'Push Pull Legs', 'Total body', 'Moderata-alta',
    'Aumentare il carico quando tutte le serie di un esercizio vengono completate a RIR 2 o superiore per due sedute consecutive. La settimana 8 è deload: stesso schema con circa il 30% di volume in meno.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A - Push', 'Petto, spalle, tricipiti', 0, 65) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 1, 4, 9, 8, 10, 90, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_a, '25420680-74ae-4e14-a37a-9df38dc6472f', 2, 3, 9, 8, 10, 90, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'c75ac0e9-6832-465c-8055-361bc74dd850', 3, 3, 11, 10, 12, 60, null, 'Movimento controllato, leggera flessione al gomito.', 'RIR 2-3'),
    (v_day_a, 'f15bee0f-60f1-45f9-8fdb-bcf582871263', 4, 3, 13, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_a, '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 5, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2-3'),
    (v_day_a, '96679980-4d8b-47f0-a6d3-33ed69957bf0', 6, 3, 11, 10, 12, 60, null, 'Gomiti vicini al busto, scendere con controllo.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B - Pull', 'Dorso, bicipiti', 1, 65) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, '65c1b360-af01-43b5-88fa-41da784d0a75', 1, 4, 7, 6, 8, 150, null, 'Schiena neutra, bilanciere vicino alle gambe.', 'RIR 2'),
    (v_day_b, 'dc4339c1-8340-4dc2-8843-695e35356545', 2, 4, 9, 8, 10, 90, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2'),
    (v_day_b, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 3, 3, 9, 8, 10, 90, null, 'Tirare con le scapole, non con le sole braccia.', 'RIR 2'),
    (v_day_b, '69406ca5-ead5-4c41-9843-2784c01551c8', 4, 3, 13, 12, 15, 60, null, 'Gomiti alti, contrazione tra le scapole.', 'RIR 2-3'),
    (v_day_b, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_b, 'b43b9122-2bd5-479c-85f5-64a23da144f0', 6, 3, 11, 10, 12, 60, null, 'Movimento lento e controllato, gomito appoggiato.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C - Legs', 'Quadricipiti, femorali, polpacci', 2, 65) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 4, 9, 8, 10, 120, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    (v_day_c, '157b3ccc-4f2b-46b8-88ab-898069fe6dc7', 2, 3, 9, 8, 10, 120, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_c, '9991ba43-5607-4a23-9698-427f03237912', 3, 3, 11, 10, 12, 90, null, 'Ginocchio anteriore sopra la caviglia, busto eretto.', 'RIR 2-3'),
    (v_day_c, '1985f5c0-f5c1-44ba-8055-98cd809e930c', 4, 3, 13, 12, 15, 60, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2-3'),
    (v_day_c, '357a1917-13d4-477a-8799-33de2e0d1471', 5, 3, 17, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');
end
$$;

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000003'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Full Body Ipertrofia YMove',
    'Programma full body in 3 sedute a settimana con esercizi del catalogo YMove: ogni seduta allena tutto il corpo con un multiarticolare per zona.',
    'Massa muscolare', 'Intermedio', 2,
    8, 3, 60, 'Bilanciere, manubri, cavi',
    'Palestra', 'Full body', 'Total body', 'Moderata',
    'Aumentare il carico quando tutte le serie di un esercizio vengono completate a RIR 2 o superiore per due sedute consecutive. La settimana 8 è deload: stesso schema con circa il 30% di volume in meno.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body, spinta', 0, 60) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 4, 9, 8, 10, 120, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    (v_day_a, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 2, 4, 9, 8, 10, 90, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_a, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 3, 3, 9, 8, 10, 90, null, 'Tirare con le scapole, non con le sole braccia.', 'RIR 2'),
    (v_day_a, 'd24d94ea-6a02-41da-ad63-01d07008466a', 4, 3, 11, 10, 12, 75, null, 'Core attivo, movimento controllato.', 'RIR 2-3'),
    (v_day_a, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_a, '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 6, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body, trazione', 1, 60) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, '157b3ccc-4f2b-46b8-88ab-898069fe6dc7', 1, 4, 9, 8, 10, 120, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_b, '5ea85917-336a-4495-9cf5-8b915089c77e', 2, 3, 9, 8, 10, 90, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_b, 'dc4339c1-8340-4dc2-8843-695e35356545', 3, 3, 11, 10, 12, 75, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2'),
    (v_day_b, 'f15bee0f-60f1-45f9-8fdb-bcf582871263', 4, 3, 13, 12, 15, 60, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_b, '40495e2c-6204-49ce-8499-7a0c7bb5654e', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_b, '19e3fd0f-3b8d-450a-b852-46e669fe5793', 6, 3, 11, 10, 12, 60, null, 'Gomiti fermi, movimento controllato.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body, metabolico', 2, 60) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '745a1200-9d2d-4b8e-ac02-c155e4674ea2', 1, 4, 9, 8, 10, 120, null, 'Contrazione dei glutei in cima al movimento.', 'RIR 2'),
    (v_day_c, 'c75ac0e9-6832-465c-8055-361bc74dd850', 2, 3, 11, 10, 12, 60, null, 'Movimento controllato, leggera flessione al gomito.', 'RIR 2-3'),
    (v_day_c, 'd9a1f929-03d3-4d32-b501-69e0ec4367e0', 3, 3, 11, 10, 12, 75, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_c, 'c705c9a5-c43d-4b41-8df0-ea403f22efcc', 4, 3, 13, 12, 15, 60, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_c, 'ae8d46db-158c-4265-8f25-65b570a617d0', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_c, '96679980-4d8b-47f0-a6d3-33ed69957bf0', 6, 3, 11, 10, 12, 60, null, 'Gomiti vicini al busto, scendere con controllo.', 'RIR 2-3');
end
$$;

-- ============================================================================
-- DIMAGRIMENTO
-- ============================================================================

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000004'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Full Body Metabolico YMove',
    'Programma dimagrimento a corpo intero con densità alta: ogni seduta unisce pesi multiarticolari e lavoro metabolico a corpo libero, con esercizi del catalogo YMove.',
    'Dimagrimento', 'Intermedio', 0,
    6, 3, 50, 'Bilanciere, manubri, corpo libero',
    'Palestra', 'Full body metabolico', 'Total body', 'Alta',
    'Aumentare il carico sui pesi quando tutte le serie superano RIR 2. La settimana 6 è deload: stesso schema con circa il 30% di volume in meno.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body, spinta e metabolico', 0, 50) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'd2adc6a8-0bb7-4b88-9595-9c9316485477', 1, 3, 15, null, null, 45, null, 'Ritmo sostenuto, tecnica prima della velocità.', 'RPE 7-8'),
    (v_day_a, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 2, 3, 12, 10, 12, 60, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_a, 'ce51cee0-ae88-4a4f-9a70-1695aa7a8222', 3, 3, 12, 10, 12, 60, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_a, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 4, 3, 12, 10, 12, 45, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_a, 'f125e930-66ae-45fe-ba8d-05ced77c7e58', 5, 3, 12, null, null, 45, null, 'Ritmo controllato, respirazione regolare.', 'RPE 7'),
    (v_day_a, '317446c0-20a0-4af9-b49b-ddb99ef3bed2', 6, 3, 20, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body, trazione e metabolico', 1, 50) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, '83dd2152-cccf-4ec4-8419-0363c3bcb909', 1, 3, 12, null, null, 45, null, 'Movimento esplosivo ma controllato.', 'RPE 7-8'),
    (v_day_b, '9991ba43-5607-4a23-9698-427f03237912', 2, 3, 12, 10, 12, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2-3'),
    (v_day_b, '745a1200-9d2d-4b8e-ac02-c155e4674ea2', 3, 3, 12, 10, 12, 60, null, 'Contrazione dei glutei in cima al movimento.', 'RIR 2'),
    (v_day_b, 'dc4339c1-8340-4dc2-8843-695e35356545', 4, 3, 12, 10, 12, 45, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2'),
    (v_day_b, '92a23d34-138a-4e77-9776-f93ecccf9d61', 5, 3, 10, null, null, 45, null, 'Atterraggio morbido sulle ginocchia.', 'RPE 7'),
    (v_day_b, '2cb18845-ea52-4106-bab2-70aaf6347a56', 6, 3, 20, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body, metabolico', 2, 50) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '577d4216-30bd-404b-a2d0-7ab89fdec02b', 1, 3, 10, null, null, 45, null, 'Atterraggio morbido sulle ginocchia.', 'RPE 7'),
    (v_day_c, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 2, 3, 12, 10, 12, 60, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_c, 'd9a1f929-03d3-4d32-b501-69e0ec4367e0', 3, 3, 12, 10, 12, 45, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_c, '216f3804-a718-4051-b058-698027918147', 4, 3, 20, null, null, 30, null, 'Ritmo controllato, respirazione regolare.', 'RPE 7'),
    (v_day_c, 'ba8e4824-b2b4-4dab-adea-6325f7b9e6da', 5, 3, 20, null, null, 30, null, 'Movimento controllato dal busto.', 'RIR 3'),
    (v_day_c, '384585ba-9dfd-4add-87d1-eed27b73ab56', 6, 3, 15, null, null, 30, null, 'Bacino stabile, movimento controllato.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000005'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Pesi + Cardio YMove',
    'Programma dimagrimento in 4 sedute a settimana: due giornate di forza e due di condizionamento metabolico, con esercizi del catalogo YMove.',
    'Dimagrimento', 'Intermedio', 1,
    8, 4, 55, 'Bilanciere, manubri, corpo libero',
    'Palestra', 'Ibrido forza/resistenza', 'Total body', 'Medio-alta',
    'Aumentare il carico sui pesi quando tutte le serie superano RIR 2. La settimana 8 è deload: stesso schema con circa il 30% di volume in meno sulle giornate di forza.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A - Upper Forza', 'Petto, dorso, spalle, braccia', 0, 55) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 1, 4, 9, 8, 10, 75, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_a, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 2, 4, 9, 8, 10, 75, null, 'Tirare con le scapole, non con le sole braccia.', 'RIR 2'),
    (v_day_a, '25420680-74ae-4e14-a37a-9df38dc6472f', 3, 3, 11, 10, 12, 60, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2-3'),
    (v_day_a, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 4, 3, 11, 10, 12, 45, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_a, '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 5, 3, 11, 10, 12, 45, null, 'Gomiti fermi vicino al busto.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B - Cardio/Core', 'Condizionamento metabolico e addome', 1, 45) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'd2adc6a8-0bb7-4b88-9595-9c9316485477', 1, 3, 15, null, null, 45, null, 'Ritmo sostenuto, tecnica prima della velocità.', 'RPE 7-8'),
    (v_day_b, '92a23d34-138a-4e77-9776-f93ecccf9d61', 2, 3, 10, null, null, 45, null, 'Atterraggio morbido sulle ginocchia.', 'RPE 7'),
    (v_day_b, '216f3804-a718-4051-b058-698027918147', 3, 3, 20, null, null, 30, null, 'Ritmo controllato, respirazione regolare.', 'RPE 7'),
    (v_day_b, '317446c0-20a0-4af9-b49b-ddb99ef3bed2', 4, 3, 20, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3'),
    (v_day_b, '2cb18845-ea52-4106-bab2-70aaf6347a56', 5, 3, 20, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3'),
    (v_day_b, 'f125e930-66ae-45fe-ba8d-05ced77c7e58', 6, 3, 10, null, null, 45, null, 'Ritmo controllato, respirazione regolare.', 'RPE 7');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C - Lower Forza', 'Quadricipiti, femorali, polpacci', 2, 55) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 4, 9, 8, 10, 90, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    (v_day_c, '157b3ccc-4f2b-46b8-88ab-898069fe6dc7', 2, 3, 11, 10, 12, 75, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_c, '9991ba43-5607-4a23-9698-427f03237912', 3, 3, 12, 10, 12, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2-3'),
    (v_day_c, '357a1917-13d4-477a-8799-33de2e0d1471', 4, 3, 17, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout D - Cardio/Full Body', 'Condizionamento metabolico a corpo intero', 3, 45) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, '83dd2152-cccf-4ec4-8419-0363c3bcb909', 1, 3, 12, null, null, 45, null, 'Movimento esplosivo ma controllato.', 'RPE 7-8'),
    (v_day_d, '577d4216-30bd-404b-a2d0-7ab89fdec02b', 2, 3, 10, null, null, 45, null, 'Atterraggio morbido sulle ginocchia.', 'RPE 7'),
    (v_day_d, 'ba8e4824-b2b4-4dab-adea-6325f7b9e6da', 3, 3, 20, null, null, 30, null, 'Movimento controllato dal busto.', 'RIR 3'),
    (v_day_d, '66053a02-07f4-4e86-9672-6af16e332ebc', 4, 3, 20, null, null, 30, null, 'Movimento controllato, non tirare il collo.', 'RIR 3');
end
$$;

-- ============================================================================
-- FORZA
-- ============================================================================

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000006'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Forza Base YMove',
    'Programma di forza 5x5 sui quattro multiarticolari principali, con accessori del catalogo YMove per completare ogni seduta.',
    'Forza', 'Intermedio', 0,
    8, 4, 70, 'Bilanciere, power rack, panca',
    'Palestra', 'Forza 5x5', 'Squat, panca, stacco, press', 'Alta',
    'Aumentare il carico quando tutte le serie da 5 vengono completate con tecnica pulita. La settimana 8 è deload: stesso schema a circa il 60% del carico abituale.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A - Squat', 'Quadricipiti, polpacci', 0, 70) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 5, 5, null, null, 150, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    -- Accessorio in range da ipertrofia (8-10 rip., recupero più corto), non
    -- un secondo tentativo quasi massimale: evita di sommare due serie 5x5
    -- di pattern squat nella stessa seduta sopra al back squat principale.
    (v_day_a, 'f14fccfe-0f5e-43c9-a30d-afbdd1e2fa1b', 2, 3, 9, 8, 10, 90, null, 'Variante accessoria dello squat, carico più leggero della serie principale.', 'RIR 2-3'),
    (v_day_a, '1985f5c0-f5c1-44ba-8055-98cd809e930c', 3, 3, 10, null, null, 60, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2-3'),
    (v_day_a, '357a1917-13d4-477a-8799-33de2e0d1471', 4, 3, 15, null, null, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B - Panca', 'Petto, tricipiti', 1, 70) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 1, 5, 5, null, null, 150, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_b, '5ea85917-336a-4495-9cf5-8b915089c77e', 2, 3, 7, 6, 8, 120, null, 'Scapole retratte, controllo in discesa.', 'RIR 2'),
    (v_day_b, '01d82cfc-0c3f-465d-a6bd-61aaeb684e9f', 3, 3, 7, 6, 8, 90, null, 'Gomiti vicini al busto, focus tricipiti.', 'RIR 2'),
    (v_day_b, 'c75ac0e9-6832-465c-8055-361bc74dd850', 4, 3, 11, 10, 12, 60, null, 'Movimento controllato, leggera flessione al gomito.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C - Stacco', 'Dorso, trapezi', 2, 70) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '65c1b360-af01-43b5-88fa-41da784d0a75', 1, 5, 5, null, null, 180, null, 'Schiena neutra, bilanciere vicino alle gambe.', 'RIR 2'),
    (v_day_c, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 2, 3, 7, 6, 8, 120, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_c, 'dc4339c1-8340-4dc2-8843-695e35356545', 3, 3, 9, 8, 10, 90, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2'),
    (v_day_c, '1b8316a9-c822-45d3-8663-dc4b5aec86cb', 4, 3, 11, 10, 12, 60, null, 'Sollevare le spalle senza usare le braccia.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout D - Press', 'Spalle, bicipiti, tricipiti', 3, 70) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, '25420680-74ae-4e14-a37a-9df38dc6472f', 1, 5, 5, null, null, 150, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2'),
    (v_day_d, 'c705c9a5-c43d-4b41-8df0-ea403f22efcc', 2, 3, 11, 10, 12, 60, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_d, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 3, 3, 9, 8, 10, 75, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2'),
    (v_day_d, 'c31dec83-a8e7-475a-a00c-c706802a851c', 4, 3, 9, 8, 10, 75, null, 'Gomiti fermi, movimento controllato.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000007'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
  v_day_e uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Powerbuilding YMove',
    'Programma avanzato in 5 sedute a settimana: forza sui tre multiarticolari principali con volume di ipertrofia sugli accessori, esercizi del catalogo YMove.',
    'Forza', 'Avanzato', 1,
    10, 5, 75, 'Bilanciere, manubri, cavi, macchine',
    'Palestra', 'Powerbuilding', 'Multiarticolari principali', 'Alta',
    'Aumentare il carico sui multiarticolari quando le serie principali vengono completate con tecnica pulita; sugli accessori quando si supera RIR 2. La settimana 10 è deload: volume accessori -30%, carichi principali invariati.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A - Squat Focus', 'Quadricipiti, polpacci', 0, 75) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'a0a04272-c27b-4a7b-9beb-0b6b3d4423e2', 1, 5, 5, null, null, 150, null, 'Ginocchia in linea con le punte dei piedi, core attivo.', 'RIR 2'),
    -- Accessorio in range da ipertrofia (8-10 rip.), distinto dal fondamentale
    -- 5x5 sopra: qui il box squat costruisce volume senza aggiungere un
    -- secondo carico quasi massimale nella stessa seduta.
    (v_day_a, 'f14fccfe-0f5e-43c9-a30d-afbdd1e2fa1b', 2, 3, 9, 8, 10, 90, null, 'Variante accessoria dello squat, carico più leggero della serie principale.', 'RIR 2-3'),
    (v_day_a, '9991ba43-5607-4a23-9698-427f03237912', 3, 3, 11, 10, 12, 75, null, 'Ginocchio anteriore sopra la caviglia, busto eretto.', 'RIR 2-3'),
    (v_day_a, '1985f5c0-f5c1-44ba-8055-98cd809e930c', 4, 3, 13, 12, 15, 60, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2-3'),
    (v_day_a, '357a1917-13d4-477a-8799-33de2e0d1471', 5, 3, 17, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B - Bench Focus', 'Petto, tricipiti', 1, 75) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 1, 5, 5, null, null, 150, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2'),
    (v_day_b, '5ea85917-336a-4495-9cf5-8b915089c77e', 2, 3, 7, 6, 8, 120, null, 'Scapole retratte, controllo in discesa.', 'RIR 2'),
    (v_day_b, '01d82cfc-0c3f-465d-a6bd-61aaeb684e9f', 3, 3, 9, 8, 10, 90, null, 'Gomiti vicini al busto, focus tricipiti.', 'RIR 2'),
    (v_day_b, 'c75ac0e9-6832-465c-8055-361bc74dd850', 4, 3, 11, 10, 12, 60, null, 'Movimento controllato, leggera flessione al gomito.', 'RIR 2-3'),
    (v_day_b, '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 5, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C - Deadlift Focus', 'Dorso, trapezi, femorali', 2, 75) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '65c1b360-af01-43b5-88fa-41da784d0a75', 1, 5, 5, null, null, 180, null, 'Schiena neutra, bilanciere vicino alle gambe.', 'RIR 2'),
    (v_day_c, '97e76a72-07b9-450c-8109-99d06d6ce9fc', 2, 3, 9, 8, 10, 120, null, 'Ginocchia leggermente flesse, busto che scende in avanti dall''anca.', 'RIR 2'),
    (v_day_c, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 3, 3, 9, 8, 10, 90, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_c, '1b8316a9-c822-45d3-8663-dc4b5aec86cb', 4, 3, 11, 10, 12, 60, null, 'Sollevare le spalle senza usare le braccia.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout D - Shoulders/Arms', 'Spalle, bicipiti, tricipiti', 3, 75) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, '25420680-74ae-4e14-a37a-9df38dc6472f', 1, 4, 7, 6, 8, 120, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2'),
    (v_day_d, 'f15bee0f-60f1-45f9-8fdb-bcf582871263', 2, 3, 13, 12, 15, 60, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_d, 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 3, 3, 9, 8, 10, 75, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2'),
    (v_day_d, '19e3fd0f-3b8d-450a-b852-46e669fe5793', 4, 3, 11, 10, 12, 60, null, 'Gomiti fermi, movimento controllato.', 'RIR 2-3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout E - Accessori', 'Full body, accessori di ipertrofia', 4, 75) returning id into v_day_e;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_e, 'd9a1f929-03d3-4d32-b501-69e0ec4367e0', 1, 3, 11, 10, 12, 75, null, 'Tirare con le scapole, busto stabile.', 'RIR 2'),
    (v_day_e, 'ce51cee0-ae88-4a4f-9a70-1695aa7a8222', 2, 3, 11, 10, 12, 90, null, 'Schiena neutra per tutta la serie.', 'RIR 2'),
    (v_day_e, '40495e2c-6204-49ce-8499-7a0c7bb5654e', 3, 3, 11, 10, 12, 60, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_e, '96679980-4d8b-47f0-a6d3-33ed69957bf0', 4, 3, 11, 10, 12, 60, null, 'Gomiti vicini al busto, scendere con controllo.', 'RIR 2-3'),
    (v_day_e, '317446c0-20a0-4af9-b49b-ddb99ef3bed2', 5, 3, 20, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3');
end
$$;

-- ============================================================================
-- PRINCIPIANTI
-- ============================================================================

do $$
declare
  v_tpl uuid := 'a1000000-0000-4000-8000-000000000008'::uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    id, coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, is_ymove, source_template_id
  ) values (
    v_tpl, null, null, 'Full Body Principiante YMove',
    'Primo programma full body in 3 sedute a settimana, esercizi semplici e sicuri del catalogo YMove per imparare la tecnica di base.',
    'Principianti', 'Principiante', 0,
    6, 3, 45, 'Manubri, macchine guidate, corpo libero',
    'Palestra', 'Full body', 'Total body', 'Bassa-moderata',
    'Aumentare leggermente il carico solo quando tutte le serie vengono completate con tecnica corretta per due sedute consecutive. La settimana 6 è deload: stesso schema con circa il 30% di volume in meno.',
    true, true, true, null
  );

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body, introduzione', 0, 45) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, '97182619-8a87-4b66-8bd2-891666df2e5c', 1, 3, 12, null, null, 60, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 3'),
    (v_day_a, 'd50e421a-23ed-4a43-8983-1e33c1b167f4', 2, 3, 11, 10, 12, 75, null, 'Scapole retratte, gomiti a circa 45 gradi.', 'RIR 2-3'),
    (v_day_a, 'dbc5917a-99a9-4a5e-90b0-5c2e30670e20', 3, 3, 11, 10, 12, 75, null, 'Tirare con le scapole, busto stabile.', 'RIR 2-3'),
    (v_day_a, 'd24d94ea-6a02-41da-ad63-01d07008466a', 4, 3, 11, 10, 12, 60, null, 'Core attivo, movimento controllato.', 'RIR 2-3'),
    (v_day_a, '317446c0-20a0-4af9-b49b-ddb99ef3bed2', 5, 3, 15, null, null, 30, null, 'Lombare a contatto con il suolo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body, introduzione (variante)', 1, 45) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, '228c0e6c-0145-4090-a01c-7d501a49ef01', 1, 3, 12, null, null, 60, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 3'),
    (v_day_b, 'c75ac0e9-6832-465c-8055-361bc74dd850', 2, 3, 12, null, null, 60, null, 'Movimento controllato, leggera flessione al gomito.', 'RIR 2-3'),
    (v_day_b, 'd9a1f929-03d3-4d32-b501-69e0ec4367e0', 3, 3, 12, null, null, 60, null, 'Tirare con le scapole, busto stabile.', 'RIR 2-3'),
    (v_day_b, '40495e2c-6204-49ce-8499-7a0c7bb5654e', 4, 3, 12, null, null, 45, null, 'Gomiti fissi, evitare lo slancio.', 'RIR 2-3'),
    (v_day_b, 'ba8e4824-b2b4-4dab-adea-6325f7b9e6da', 5, 3, 15, null, null, 30, null, 'Movimento controllato dal busto.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body, introduzione (variante 2)', 2, 45) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, '9991ba43-5607-4a23-9698-427f03237912', 1, 3, 11, 10, 12, 60, null, 'Ginocchio anteriore sopra la caviglia, busto eretto.', 'RIR 2-3'),
    -- Sostituito un push-up in variante decline (più difficile di un push-up
    -- standard) con una distensione manubri caricabile: più adatta a un
    -- livello principiante, dove il carico si regola facilmente riducendo i
    -- pesi invece di dover già padroneggiare una progressione calisthenics.
    (v_day_c, 'd25aad24-4e4f-4f02-b6c9-6edd7c398210', 2, 3, 11, 10, 12, 60, null, 'Manubri leggeri, gomiti a circa 45 gradi dal busto.', 'RIR 2-3'),
    (v_day_c, 'dc4339c1-8340-4dc2-8843-695e35356545', 3, 3, 11, 10, 12, 60, null, 'Tirare verso il petto, controllo in fase eccentrica.', 'RIR 2-3'),
    (v_day_c, '4a1fa324-d6ce-44a2-9af7-e74e87375805', 4, 3, 13, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2-3'),
    (v_day_c, '1c3a7bc0-6994-4dd5-855d-7bac3fe2e010', 5, 3, 10, null, null, 30, null, 'Corpo allineato, addome contratto.', 'RIR 3');
end
$$;

notify pgrst, 'reload schema';
