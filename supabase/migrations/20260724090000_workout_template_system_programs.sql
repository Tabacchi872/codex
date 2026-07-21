-- feat: aggiunge modelli workout professionali.
--
-- Popola la libreria "Professionali" (modelli di sistema, is_system = true,
-- coach_id null) introdotta dalla migration 20260723090000 con 18 programmi
-- completi, organizzati in 7 categorie, ciascuno con i suoi Workout
-- A/B/C reali ed esercizi coerenti con la libreria (mobile/src/data/
-- exercise-library.ts). Ogni exercise_id qui sotto e' stato verificato
-- contro SEED_EXERCISES + COVERAGE_EXERCISES di quel file: nessun id
-- inventato. Solo INSERT, nessuna modifica a righe esistenti: migration
-- non distruttiva. Nessuna serie e' prescritta "al cedimento": tutte le
-- indicazioni usano RIR/RPE con margine, come richiesto — sono programmi
-- generali che il coach personalizza per il singolo cliente.

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Full Body Metabolico',
    'Programma dimagrimento a corpo intero con densita alta: ogni seduta unisce pesi multiarticolari e un finisher cardio.',
    'Dimagrimento', 'Intermedio', 0,
    6, 3, 50, 'Bilanciere, manubri, macchine base, corpo libero',
    'Palestra', 'Full body metabolico', 'Total body', 'Medio-alta',
    'Aumentare il carico quando tutte le serie di un esercizio vengono completate a RIR 3 o superiore per due sedute consecutive. La settimana 6 e'' deload: stesso schema con circa il 30% di volume in meno.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body, spinta', 0, 50) returning id into v_day_a;

  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 3, 12, 10, 12, 75, null, 'Base multiarticolare della seduta: tecnica prima del carico.', 'RIR 2'),
    (v_day_a, 'petto-panca-piana', 2, 3, 10, 8, 10, 75, null, 'Scapole retratte, bilanciere sulla linea del petto.', 'RIR 2'),
    (v_day_a, 'dorso-pulley-basso', 3, 3, 12, 10, 12, 60, null, 'Busto stabile, tirare con le scapole.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 4, 3, 12, 10, 12, 60, null, 'Core attivo, evitare di inarcare la lombare.', 'RIR 2-3'),
    (v_day_a, 'core-plank', 5, 3, 1, null, null, 30, 40, 'Tenuta isometrica, corpo allineato.', 'RIR 3'),
    (v_day_a, 'cardio-jumping-jack', 6, 3, 1, null, null, 20, 30, 'Finisher metabolico a ritmo sostenuto.', 'RPE 7');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body, trazione', 1, 50) returning id into v_day_b;

  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-stacco-rumeno', 1, 3, 12, 10, 12, 75, null, 'Schiena neutra, bilanciere vicino alle gambe.', 'RIR 2'),
    (v_day_b, 'dorso-lat-machine-avanti', 2, 3, 12, 10, 12, 60, null, 'Tirare con le scapole, non con le braccia.', 'RIR 2'),
    (v_day_b, 'petto-chest-press', 3, 3, 12, 10, 12, 60, null, 'Regolare il sedile per allineare le maniglie al petto.', 'RIR 2'),
    (v_day_b, 'gambe-affondi', 4, 3, 14, 12, 15, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2-3'),
    (v_day_b, 'core-russian-twist', 5, 3, 16, 14, 20, 45, null, 'Movimento controllato dal busto, non dalle sole braccia.', 'RIR 3'),
    (v_day_b, 'cardio-battle-rope', 6, 3, 1, null, null, 30, 30, 'Ondulazioni ad alta intensita, ginocchia morbide.', 'RPE 7-8');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body, metabolico', 2, 50) returning id into v_day_c;

  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-leg-press', 1, 3, 14, 12, 15, 60, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_c, 'dorso-rematore-manubrio', 2, 3, 12, 10, 12, 60, null, 'Schiena parallela al pavimento, gomito vicino al busto.', 'RIR 2'),
    (v_day_c, 'spalle-alzate-laterali', 3, 3, 15, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2'),
    (v_day_c, 'core-mountain-climber', 4, 3, 1, null, null, 30, 30, 'Bacino stabile per tutto il movimento.', 'RPE 7'),
    (v_day_c, 'cardio-burpees', 5, 3, 1, null, null, 45, 30, 'Ritmo sostenuto, tecnica prima della velocita.', 'RPE 7-8'),
    (v_day_c, 'cardio-tapis-roulant', 6, 1, 1, null, null, 0, 600, 'Camminata in salita o corsa leggera come chiusura aerobica.', 'RPE 6');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Pesi e Cardio',
    'Programma dimagrimento upper/lower con un blocco cardio dedicato alla fine di ogni seduta.',
    'Dimagrimento', 'Intermedio', 1,
    8, 4, 55, 'Bilanciere, manubri, macchine, cardio (tapis roulant, cyclette, vogatore, ellittica)',
    'Palestra', 'Upper/Lower + cardio', 'Total body', 'Alta',
    'Aumentare il carico sui pesi quando tutte le serie superano RIR 2. La settimana 8 e'' deload: volume pesi -30%, blocco cardio invariato.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Upper + cardio', 0, 55) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 9, 8, 10, 90, null, 'Serie principale della seduta upper.', 'RIR 2'),
    (v_day_a, 'dorso-lat-machine-avanti', 2, 4, 11, 10, 12, 75, null, 'Tirare con le scapole, non con le braccia.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 3, 3, 11, 10, 12, 75, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'bicipiti-curl-manubri', 4, 3, 14, 12, 15, 45, null, 'Rotazione del polso in risalita.', 'RIR 2-3'),
    (v_day_a, 'tricipiti-pushdown-cavo', 5, 3, 14, 12, 15, 45, null, 'Gomiti fissi vicino al busto.', 'RIR 2-3'),
    (v_day_a, 'cardio-cyclette', 6, 1, 1, null, null, 0, 600, 'Intervalli moderati-intensi per 10 minuti.', 'RPE 7');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Lower + cardio', 1, 55) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-squat', 1, 4, 9, 8, 10, 90, null, 'Serie principale della seduta lower.', 'RIR 2'),
    (v_day_b, 'gambe-leg-press', 2, 3, 14, 12, 15, 75, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_b, 'gambe-leg-curl', 3, 3, 14, 12, 15, 60, null, 'Bacino fermo, range completo.', 'RIR 2'),
    (v_day_b, 'gambe-calf-raise', 4, 3, 18, 15, 20, 45, null, 'Escursione completa, pausa in contrazione.', 'RIR 2-3'),
    (v_day_b, 'core-leg-raise', 5, 3, 14, 12, 15, 45, null, 'Lombare a contatto con il suolo.', 'RIR 3'),
    (v_day_b, 'cardio-tapis-roulant', 6, 1, 1, null, null, 0, 900, 'Camminata in salita o corsa leggera per 15 minuti.', 'RPE 7');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Upper + cardio (variante)', 2, 55) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'petto-panca-inclinata-manubri', 1, 4, 9, 8, 10, 90, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_c, 'dorso-rematore-manubrio', 2, 4, 11, 10, 12, 75, null, 'Schiena parallela al pavimento in tirata.', 'RIR 2'),
    (v_day_c, 'spalle-alzate-laterali', 3, 3, 15, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2'),
    (v_day_c, 'bicipiti-curl-martello', 4, 3, 14, 12, 15, 45, null, 'Polso fisso in posizione neutra.', 'RIR 2-3'),
    (v_day_c, 'tricipiti-french-press', 5, 3, 12, 10, 12, 60, null, 'Gomiti stabili rivolti in avanti.', 'RIR 2-3'),
    (v_day_c, 'cardio-vogatore', 6, 1, 1, null, null, 0, 600, 'Ritmo costante per 10 minuti.', 'RPE 7-8');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout D', 'Lower + cardio (variante)', 3, 55) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'gambe-stacco-rumeno', 1, 4, 9, 8, 10, 90, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_d, 'gambe-affondi', 2, 3, 14, 12, 15, 60, null, 'Busto eretto, passo controllato.', 'RIR 2'),
    (v_day_d, 'gambe-hip-thrust', 3, 3, 14, 12, 15, 75, null, 'Contrazione glutei in massima estensione.', 'RIR 2'),
    (v_day_d, 'femorali-leg-curl-seduto', 4, 3, 14, 12, 15, 60, null, 'Schiena in appoggio, range controllato.', 'RIR 2-3'),
    (v_day_d, 'core-plank', 5, 3, 1, null, null, 30, 45, 'Corpo allineato, bacino stabile.', 'RIR 3'),
    (v_day_d, 'cardio-ellittica', 6, 1, 1, null, null, 0, 900, 'Postura eretta, 15 minuti a intensita costante.', 'RPE 7');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Dimagrimento Principiante',
    'Primo approccio al dimagrimento in palestra: full body a bassa complessita tecnica, due sedute a settimana.',
    'Dimagrimento', 'Principiante', 2,
    6, 2, 40, 'Macchine guidate, manubri leggeri, corpo libero',
    'Palestra', 'Full body', 'Total body', 'Moderata',
    'Aumentare prima le ripetizioni fino al limite del range, poi il peso. Valutare un piccolo incremento di carico ogni 2 settimane solo se la tecnica resta solida.',
    false, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body', 0, 40) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-leg-press', 1, 3, 14, 12, 15, 75, null, 'Escursione controllata, non bloccare le ginocchia.', 'RIR 3'),
    (v_day_a, 'petto-chest-press', 2, 3, 14, 12, 15, 75, null, 'Regolare il sedile per allineare le maniglie al petto.', 'RIR 3'),
    (v_day_a, 'dorso-pulley-basso', 3, 3, 14, 12, 15, 60, null, 'Busto stabile, tirare con le scapole.', 'RIR 3'),
    (v_day_a, 'spalle-alzate-laterali', 4, 2, 15, null, null, 45, null, 'Movimento controllato, niente slanci.', 'RIR 3'),
    (v_day_a, 'core-crunch', 5, 2, 15, null, null, 45, null, 'Movimento breve, non tirare il collo.', 'RIR 3'),
    (v_day_a, 'cardio-cyclette', 6, 1, 1, null, null, 0, 600, 'Ritmo blando, 10 minuti.', 'RPE 6');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body (variante)', 1, 40) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-leg-extension', 1, 3, 14, 12, 15, 60, null, 'Movimento controllato, no scatti in ritorno.', 'RIR 3'),
    (v_day_b, 'dorso-vertical-row', 2, 3, 14, 12, 15, 60, null, 'Movimento controllato, niente slanci.', 'RIR 3'),
    (v_day_b, 'petto-push-up', 3, 3, 10, 8, 12, 60, null, 'Su ginocchia se necessario per mantenere la tecnica.', 'RIR 3'),
    (v_day_b, 'gambe-affondi', 4, 2, 12, null, null, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 3'),
    (v_day_b, 'core-plank', 5, 3, 1, null, null, 30, 30, 'Corpo allineato, bacino stabile.', 'RIR 3'),
    (v_day_b, 'cardio-tapis-roulant', 6, 1, 1, null, null, 0, 600, 'Camminata a ritmo blando, 10 minuti.', 'RPE 6');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Upper/Lower Ipertrofia',
    'Split upper/lower classico per ipertrofia: volume alto sui multiarticolari e sugli accessori.',
    'Massa muscolare', 'Intermedio', 3,
    8, 4, 65, 'Bilanciere, manubri, cavi, macchine',
    'Palestra', 'Upper/Lower', 'Total body', 'Alta',
    'Aumentare carico o ripetizioni quando tutte le serie sono completate a RIR 2 o meno. La settimana 8 e'' deload: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper A', 'Petto, dorso, spalle', 0, 65) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 9, 8, 10, 90, null, 'Serie principale, tecnica solida prima del carico.', 'RIR 2'),
    (v_day_a, 'dorso-lat-machine-avanti', 2, 4, 9, 8, 10, 90, null, 'Tirare con le scapole.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 3, 3, 11, 10, 12, 75, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'petto-croci-manubri', 4, 3, 14, 12, 15, 60, null, 'Leggera flessione dei gomiti per tutta l''esecuzione.', 'RIR 1-2'),
    (v_day_a, 'dorso-rematore-manubrio', 5, 3, 11, 10, 12, 60, null, 'Gomito vicino al busto in fase di tirata.', 'RIR 2'),
    (v_day_a, 'bicipiti-curl-bilanciere', 6, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower A', 'Quadricipiti, posteriori', 1, 65) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-squat', 1, 4, 9, 8, 10, 120, null, 'Serie principale della seduta lower.', 'RIR 2'),
    (v_day_b, 'gambe-stacco-rumeno', 2, 3, 11, 10, 12, 90, null, 'Schiena neutra, bilanciere vicino alle gambe.', 'RIR 2'),
    (v_day_b, 'gambe-leg-press', 3, 3, 14, 12, 15, 75, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_b, 'gambe-leg-curl', 4, 3, 14, 12, 15, 60, null, 'Bacino fermo, range completo.', 'RIR 1-2'),
    (v_day_b, 'gambe-calf-raise', 5, 4, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 1-2'),
    (v_day_b, 'core-cable-crunch', 6, 3, 14, 12, 15, 45, null, 'Flettere la colonna, bacino fermo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper B', 'Petto, dorso, spalle (variante)', 2, 65) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'petto-panca-inclinata-manubri', 1, 4, 9, 8, 10, 90, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_c, 'dorso-rematore-bilanciere', 2, 4, 9, 8, 10, 90, null, 'Busto inclinato, schiena neutra.', 'RIR 2'),
    (v_day_c, 'spalle-military-press', 3, 3, 9, 8, 10, 75, null, 'Traiettoria verticale, core attivo.', 'RIR 2'),
    (v_day_c, 'dorso-pullover-cavo', 4, 3, 14, 12, 15, 60, null, 'Gomiti con leggera flessione fissa.', 'RIR 2'),
    (v_day_c, 'spalle-alzate-laterali', 5, 3, 15, null, null, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 1-2'),
    (v_day_c, 'tricipiti-pushdown-cavo', 6, 3, 14, 12, 15, 45, null, 'Gomiti fissi vicino al busto.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower B', 'Quadricipiti, posteriori (variante)', 3, 65) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'gambe-front-squat', 1, 3, 9, 8, 10, 120, null, 'Gomiti alti, busto verticale.', 'RIR 2'),
    (v_day_d, 'gambe-hip-thrust', 2, 4, 11, 10, 12, 90, null, 'Contrazione glutei in massima estensione.', 'RIR 2'),
    (v_day_d, 'gambe-bulgarian-split-squat', 3, 3, 11, 10, 12, 75, null, 'Busto stabile, spinta dal piede avanti.', 'RIR 2'),
    (v_day_d, 'femorali-leg-curl-sdraiato', 4, 3, 14, 12, 15, 60, null, 'Bacino fermo per tutta l''esecuzione.', 'RIR 1-2'),
    (v_day_d, 'polpacci-calf-raise-seduto', 5, 4, 18, 15, 20, 45, null, 'Escursione completa, pausa in alto.', 'RIR 1-2'),
    (v_day_d, 'core-leg-raise', 6, 3, 14, 12, 15, 45, null, 'Lombare a contatto con il suolo.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Push Pull Legs',
    'Split PPL ad alta frequenza: i tre giorni si ripetono due volte a settimana (Push-Pull-Legs-Push-Pull-Legs).',
    'Massa muscolare', 'Avanzato', 4,
    8, 6, 70, 'Bilanciere, manubri, cavi, macchine',
    'Palestra', 'Push Pull Legs', 'Total body', 'Alta',
    'Alternare i tre giorni due volte a settimana con almeno un giorno di riposo ogni 6-7 sedute. Deload ogni 8 settimane: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Push', 'Petto, spalle, tricipiti', 0, 70) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 7, 6, 8, 120, null, 'Serie principale, priorita alla tecnica sotto carico.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 2, 3, 9, 8, 10, 90, null, 'Core attivo, traiettoria verticale.', 'RIR 2'),
    (v_day_a, 'petto-panca-inclinata-manubri', 3, 3, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_a, 'spalle-alzate-laterali', 4, 3, 14, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 1-2'),
    (v_day_a, 'tricipiti-french-press', 5, 3, 11, 10, 12, 60, null, 'Gomiti stabili rivolti in avanti.', 'RIR 1-2'),
    (v_day_a, 'tricipiti-pushdown-cavo', 6, 3, 14, 12, 15, 45, null, 'Gomiti fissi vicino al busto.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Pull', 'Dorso, bicipiti', 1, 70) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'dorso-trazioni', 1, 4, 7, 6, 8, 120, null, 'Petto verso la sbarra, controllo in discesa.', 'RIR 2'),
    (v_day_b, 'dorso-rematore-bilanciere', 2, 4, 9, 8, 10, 90, null, 'Schiena neutra, tirare verso l''addome.', 'RIR 2'),
    (v_day_b, 'dorso-lat-machine-neutra', 3, 3, 11, 10, 12, 75, null, 'Spalle basse, gomiti verso il fianco.', 'RIR 2'),
    (v_day_b, 'spalle-face-pull', 4, 3, 15, null, null, 45, null, 'Gomiti alti, extrarotazione finale.', 'RIR 2'),
    (v_day_b, 'bicipiti-curl-bilanciere', 5, 3, 11, 10, 12, 60, null, 'Gomiti fermi, no dondolio con la schiena.', 'RIR 1-2'),
    (v_day_b, 'bicipiti-curl-martello', 6, 3, 14, 12, 15, 45, null, 'Polso fisso in posizione neutra.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Legs', 'Gambe, glutei', 2, 70) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-squat', 1, 4, 7, 6, 8, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_c, 'gambe-stacco-rumeno', 2, 3, 9, 8, 10, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_c, 'gambe-leg-press', 3, 3, 14, 12, 15, 75, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_c, 'gambe-leg-curl', 4, 3, 14, 12, 15, 60, null, 'Bacino fermo, range completo.', 'RIR 1-2'),
    (v_day_c, 'gambe-calf-raise', 5, 4, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 1-2'),
    (v_day_c, 'core-plank', 6, 3, 1, null, null, 30, 45, 'Corpo allineato, bacino stabile.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
  v_day_e uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Bodybuilding Classico',
    'Split classico bodybuilding: un gruppo muscolare principale per seduta, alto volume di isolamento.',
    'Massa muscolare', 'Avanzato', 5,
    10, 5, 65, 'Bilanciere, manubri, cavi, macchine',
    'Palestra', 'Bro split', 'Un gruppo muscolare principale per seduta', 'Alta',
    'Incremento progressivo del carico settimanale mantenendo il range di ripetizioni indicato. La settimana 10 e'' deload: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Petto e Tricipiti', 'Petto, tricipiti', 0, 65) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 9, 8, 10, 90, null, 'Serie principale della seduta.', 'RIR 2'),
    (v_day_a, 'petto-panca-inclinata-manubri', 2, 3, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_a, 'petto-croci-cavi', 3, 3, 14, 12, 15, 60, null, 'Torace alto, gomiti morbidi.', 'RIR 1-2'),
    (v_day_a, 'petto-dips-petto', 4, 3, 11, 10, 12, 75, null, 'Busto inclinato avanti per enfatizzare il petto.', 'RIR 2'),
    (v_day_a, 'tricipiti-panca-presa-stretta', 5, 3, 11, 10, 12, 60, null, 'Gomiti vicino al busto, polsi neutri.', 'RIR 2'),
    (v_day_a, 'tricipiti-kickback', 6, 3, 14, 12, 15, 45, null, 'Braccio alto e fermo, estendere solo il gomito.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Dorso e Bicipiti', 'Dorso, bicipiti', 1, 65) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'dorso-trazioni-assistite', 1, 4, 9, 8, 10, 90, null, 'Scendere fino a estensione quasi completa.', 'RIR 2'),
    (v_day_b, 'dorso-rematore-bilanciere', 2, 4, 9, 8, 10, 90, null, 'Schiena neutra, evitare rimbalzi.', 'RIR 2'),
    (v_day_b, 'dorso-lat-machine-avanti', 3, 3, 11, 10, 12, 75, null, 'Tirare con le scapole.', 'RIR 2'),
    (v_day_b, 'dorso-pullover-cavo', 4, 3, 14, 12, 15, 60, null, 'Gomiti con leggera flessione fissa.', 'RIR 2'),
    (v_day_b, 'bicipiti-curl-bilanciere', 5, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2'),
    (v_day_b, 'bicipiti-preacher-curl', 6, 3, 14, 12, 15, 45, null, 'Non staccare i gomiti dal supporto.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Gambe', 'Quadricipiti, posteriori, polpacci', 2, 65) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-squat', 1, 4, 9, 8, 10, 120, null, 'Serie principale della seduta.', 'RIR 2'),
    (v_day_c, 'gambe-leg-press', 2, 3, 14, 12, 15, 90, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_c, 'gambe-hack-squat', 3, 3, 11, 10, 12, 90, null, 'Schiena in appoggio, controllo in discesa.', 'RIR 2'),
    (v_day_c, 'gambe-leg-curl', 4, 3, 14, 12, 15, 60, null, 'Bacino fermo, range completo.', 'RIR 2'),
    (v_day_c, 'gambe-leg-extension', 5, 3, 14, 12, 15, 60, null, 'Movimento controllato, no scatti in ritorno.', 'RIR 1-2'),
    (v_day_c, 'gambe-calf-raise', 6, 4, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 1-2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Spalle e Addome', 'Spalle, addome', 3, 65) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'spalle-military-press', 1, 4, 9, 8, 10, 90, null, 'Traiettoria verticale, core attivo.', 'RIR 2'),
    (v_day_d, 'spalle-alzate-laterali', 2, 4, 14, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 1-2'),
    (v_day_d, 'spalle-alzate-frontali', 3, 3, 14, 12, 15, 45, null, 'Movimento controllato, niente slanci.', 'RIR 2'),
    (v_day_d, 'spalle-reverse-fly', 4, 3, 15, null, null, 45, null, 'Scapole che si avvicinano in apertura.', 'RIR 2'),
    (v_day_d, 'core-cable-crunch', 5, 3, 15, null, null, 45, null, 'Flettere la colonna, bacino fermo.', 'RIR 2'),
    (v_day_d, 'core-russian-twist', 6, 3, 18, 16, 20, 45, null, 'Movimento controllato dal busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Braccia e Core', 'Bicipiti, tricipiti, core', 4, 65) returning id into v_day_e;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_e, 'bicipiti-curl-manubri', 1, 3, 11, 10, 12, 60, null, 'Rotazione del polso in risalita.', 'RIR 2'),
    (v_day_e, 'bicipiti-curl-panca-inclinata', 2, 3, 14, 12, 15, 45, null, 'Spalle ferme, braccio in allungamento.', 'RIR 1-2'),
    (v_day_e, 'tricipiti-french-press', 3, 3, 11, 10, 12, 60, null, 'Gomiti stabili rivolti in avanti.', 'RIR 2'),
    (v_day_e, 'tricipiti-estensioni-sopra-testa', 4, 3, 14, 12, 15, 45, null, 'Gomiti puntati verso l''alto e fermi.', 'RIR 1-2'),
    (v_day_e, 'core-hollow-hold', 5, 3, 1, null, null, 30, 30, 'Lombare a terra, regredire se si perde controllo.', 'RIR 3'),
    (v_day_e, 'core-pallof-press', 6, 3, 12, null, null, 45, null, 'Resistere alla rotazione, bacino fermo.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Strength & Shape',
    'Full body con base di forza sui multiarticolari e completamento di isolamento per la forma fisica.',
    'Ricomposizione corporea', 'Intermedio', 6,
    8, 3, 60, 'Bilanciere, manubri, macchine',
    'Palestra', 'Full body forza e forma', 'Total body', 'Medio-alta',
    'Progressione doppia: prima le ripetizioni fino al massimo del range, poi il carico. La settimana 8 e'' deload: volume -30%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Squat + upper', 0, 60) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 4, 7, 6, 8, 120, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_a, 'petto-panca-piana', 2, 3, 9, 8, 10, 90, null, 'Scapole retratte, tecnica prima del carico.', 'RIR 2'),
    (v_day_a, 'dorso-pulley-basso', 3, 3, 11, 10, 12, 75, null, 'Busto stabile, tirare con le scapole.', 'RIR 2'),
    (v_day_a, 'spalle-alzate-laterali', 4, 3, 14, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2'),
    (v_day_a, 'core-plank', 5, 3, 1, null, null, 30, 40, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Stacco + upper', 1, 60) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-stacco-rumeno', 1, 4, 7, 6, 8, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_b, 'dorso-rematore-manubrio', 2, 3, 11, 10, 12, 75, null, 'Gomito vicino al busto in fase di tirata.', 'RIR 2'),
    (v_day_b, 'petto-panca-inclinata-manubri', 3, 3, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_b, 'bicipiti-curl-manubri', 4, 3, 14, 12, 15, 45, null, 'Rotazione del polso in risalita.', 'RIR 2'),
    (v_day_b, 'core-russian-twist', 5, 3, 16, null, null, 45, null, 'Movimento controllato dal busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Lower accessori + core', 2, 60) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-leg-press', 1, 3, 11, 10, 12, 90, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_c, 'gambe-affondi', 2, 3, 14, 12, 15, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2'),
    (v_day_c, 'spalle-shoulder-press', 3, 3, 11, 10, 12, 75, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_c, 'tricipiti-pushdown-cavo', 4, 3, 14, 12, 15, 45, null, 'Gomiti fissi vicino al busto.', 'RIR 2'),
    (v_day_c, 'core-dead-bug', 5, 3, 12, null, null, 45, null, 'Zona lombare stabile, movimento lento.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Upper/Lower + Conditioning',
    'Upper/Lower classico con un blocco di conditioning metabolico a chiusura di due sedute su quattro.',
    'Ricomposizione corporea', 'Intermedio', 7,
    8, 4, 60, 'Bilanciere, manubri, macchine, battle rope, corda',
    'Palestra', 'Upper/Lower + conditioning', 'Total body', 'Alta',
    'Priorita al carico sui multiarticolari, al ritmo sul conditioning. La settimana 8 e'' deload: volume -30%, conditioning dimezzato.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper A', 'Forza upper', 0, 60) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 7, 6, 8, 120, null, 'Serie principale della seduta.', 'RIR 2'),
    (v_day_a, 'dorso-lat-machine-avanti', 2, 4, 9, 8, 10, 90, null, 'Tirare con le scapole.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 3, 3, 9, 8, 10, 75, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'bicipiti-curl-bilanciere', 4, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2'),
    (v_day_a, 'tricipiti-pushdown-cavo', 5, 3, 11, 10, 12, 60, null, 'Gomiti fissi vicino al busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower A', 'Forza lower', 1, 60) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-squat', 1, 4, 7, 6, 8, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_b, 'gambe-stacco-rumeno', 2, 3, 9, 8, 10, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_b, 'gambe-leg-curl', 3, 3, 11, 10, 12, 75, null, 'Bacino fermo, range completo.', 'RIR 2'),
    (v_day_b, 'gambe-calf-raise', 4, 3, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 2'),
    (v_day_b, 'core-leg-raise', 5, 3, 14, 12, 15, 45, null, 'Lombare a contatto con il suolo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper B', 'Upper + conditioning', 2, 60) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'petto-chest-press', 1, 3, 11, 10, 12, 75, null, 'Regolare il sedile per allineare le maniglie al petto.', 'RIR 2'),
    (v_day_c, 'dorso-rematore-manubrio', 2, 3, 11, 10, 12, 75, null, 'Gomito vicino al busto in fase di tirata.', 'RIR 2'),
    (v_day_c, 'spalle-alzate-laterali', 3, 3, 14, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2'),
    (v_day_c, 'cardio-battle-rope', 4, 3, 1, null, null, 30, 30, 'Ondulazioni ad alta intensita, ginocchia morbide.', 'RPE 7-8'),
    (v_day_c, 'cardio-burpees', 5, 3, 1, null, null, 30, 30, 'Ritmo sostenuto, tecnica prima della velocita.', 'RPE 7-8');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower B', 'Lower + conditioning', 3, 60) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'gambe-leg-press', 1, 3, 11, 10, 12, 90, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_d, 'gambe-affondi', 2, 3, 14, 12, 15, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2'),
    (v_day_d, 'gambe-hip-thrust', 3, 3, 11, 10, 12, 75, null, 'Contrazione glutei in massima estensione.', 'RIR 2'),
    (v_day_d, 'cardio-vogatore', 4, 3, 1, null, null, 30, 45, 'Spinta gambe, tirata braccia, ritorno inverso.', 'RPE 7-8'),
    (v_day_d, 'cardio-jumping-jack', 5, 3, 1, null, null, 20, 30, 'Atterraggio morbido, ritmo costante.', 'RPE 7');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Forza Base 5x5',
    'Schema classico 5x5 sui tre multiarticolari principali, alternando due varianti di seduta.',
    'Forza', 'Intermedio', 8,
    8, 3, 55, 'Bilanciere, power rack, panca',
    'Palestra', 'Forza 5x5', 'Multiarticolari principali', 'Alta',
    'Incremento minimo di carico (2.5-5 kg) quando tutte le serie da 5 sono completate con tecnica solida. La settimana 8 e'' deload: carico -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Squat, panca, rematore', 0, 55) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 5, 5, 5, 5, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_a, 'petto-panca-piana', 2, 5, 5, 5, 5, 150, null, 'Scapole retratte, bilanciere sulla linea del petto.', 'RIR 2'),
    (v_day_a, 'dorso-rematore-bilanciere', 3, 5, 5, 5, 5, 120, null, 'Schiena neutra, evitare rimbalzi.', 'RIR 2'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 45, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Stacco, military press, trazioni', 1, 55) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-stacco-rumeno', 1, 5, 5, 5, 5, 150, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_b, 'spalle-military-press', 2, 5, 5, 5, 5, 120, null, 'Traiettoria verticale, core attivo.', 'RIR 2'),
    (v_day_b, 'dorso-trazioni-assistite', 3, 5, 5, 5, 5, 120, null, 'Scendere fino a estensione quasi completa.', 'RIR 2'),
    (v_day_b, 'core-hollow-hold', 4, 3, 1, null, null, 30, 30, 'Lombare a terra, regredire se si perde controllo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Squat, panca, rematore (variante)', 2, 55) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-front-squat', 1, 5, 5, 5, 5, 150, null, 'Gomiti alti, busto verticale.', 'RIR 2'),
    (v_day_c, 'petto-panca-inclinata-manubri', 2, 5, 5, 5, 5, 120, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_c, 'dorso-lat-machine-avanti', 3, 4, 8, null, null, 90, null, 'Tirare con le scapole.', 'RIR 2'),
    (v_day_c, 'core-russian-twist', 4, 3, 16, null, null, 45, null, 'Movimento controllato dal busto.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Powerbuilding',
    'Combina forza sui multiarticolari pesanti a basse ripetizioni e volume da ipertrofia sugli accessori.',
    'Forza', 'Avanzato', 9,
    10, 4, 70, 'Bilanciere, manubri, macchine',
    'Palestra', 'Powerbuilding', 'Total body', 'Alta',
    'Progressione lineare sul carico dei multiarticolari, doppia progressione sugli accessori. La settimana 10 e'' deload: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower Strength', 'Forza gambe', 0, 70) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 5, 5, 5, 5, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_a, 'gambe-stacco-rumeno', 2, 4, 6, null, null, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_a, 'gambe-leg-press', 3, 3, 11, 10, 12, 90, null, 'Non bloccare le ginocchia in estensione.', 'RIR 2'),
    (v_day_a, 'gambe-calf-raise', 4, 4, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper Strength', 'Forza upper', 1, 70) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'petto-panca-piana', 1, 5, 5, 5, 5, 150, null, 'Scapole retratte, bilanciere sulla linea del petto.', 'RIR 2'),
    (v_day_b, 'dorso-rematore-bilanciere', 2, 4, 6, null, null, 120, null, 'Schiena neutra, evitare rimbalzi.', 'RIR 2'),
    (v_day_b, 'spalle-military-press', 3, 3, 7, 6, 8, 90, null, 'Traiettoria verticale, core attivo.', 'RIR 2'),
    (v_day_b, 'tricipiti-panca-presa-stretta', 4, 3, 9, 8, 10, 75, null, 'Gomiti vicino al busto, polsi neutri.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower Hypertrophy', 'Ipertrofia gambe', 2, 70) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-hack-squat', 1, 4, 11, 10, 12, 90, null, 'Schiena in appoggio, controllo in discesa.', 'RIR 2'),
    (v_day_c, 'gambe-bulgarian-split-squat', 2, 3, 11, 10, 12, 75, null, 'Busto stabile, spinta dal piede avanti.', 'RIR 1-2'),
    (v_day_c, 'gambe-leg-curl', 3, 3, 14, 12, 15, 60, null, 'Bacino fermo, range completo.', 'RIR 1-2'),
    (v_day_c, 'core-cable-crunch', 4, 3, 15, null, null, 45, null, 'Flettere la colonna, bacino fermo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper Hypertrophy', 'Ipertrofia upper', 3, 70) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'petto-panca-inclinata-manubri', 1, 4, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_d, 'dorso-lat-machine-neutra', 2, 4, 11, 10, 12, 75, null, 'Spalle basse, gomiti verso il fianco.', 'RIR 2'),
    (v_day_d, 'spalle-alzate-laterali', 3, 3, 15, null, null, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 1-2'),
    (v_day_d, 'bicipiti-curl-manubri', 4, 3, 14, 12, 15, 45, null, 'Rotazione del polso in risalita.', 'RIR 1-2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
  v_day_e uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Forza e Ipertrofia',
    'Cinque sedute: tre dedicate ai multiarticolari principali con focus forza, due dedicate a ipertrofia complementare.',
    'Forza', 'Avanzato', 10,
    8, 5, 65, 'Bilanciere, manubri, macchine',
    'Palestra', 'Forza + ipertrofia', 'Total body', 'Alta',
    'Carico progressivo sui giorni focus, volume progressivo sui giorni ipertrofia. La settimana 8 e'' deload: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Squat', 'Squat, quadricipiti', 0, 65) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 5, 5, 5, 5, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_a, 'gambe-affondi', 2, 3, 11, 10, 12, 75, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2'),
    (v_day_a, 'gambe-leg-extension', 3, 3, 14, 12, 15, 60, null, 'Movimento controllato, no scatti in ritorno.', 'RIR 2'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 40, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Panca', 'Panca, petto, tricipiti', 1, 65) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'petto-panca-piana', 1, 5, 5, 5, 5, 150, null, 'Scapole retratte, bilanciere sulla linea del petto.', 'RIR 2'),
    (v_day_b, 'petto-panca-inclinata-manubri', 2, 3, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_b, 'tricipiti-pushdown-cavo', 3, 3, 14, 12, 15, 60, null, 'Gomiti fissi vicino al busto.', 'RIR 2'),
    (v_day_b, 'core-russian-twist', 4, 3, 16, null, null, 45, null, 'Movimento controllato dal busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Stacco', 'Stacco, dorso, posteriori', 2, 65) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-stacco-rumeno', 1, 5, 5, 5, 5, 150, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_c, 'dorso-rematore-bilanciere', 2, 3, 11, 10, 12, 75, null, 'Schiena neutra, evitare rimbalzi.', 'RIR 2'),
    (v_day_c, 'femorali-leg-curl-seduto', 3, 3, 14, 12, 15, 60, null, 'Schiena in appoggio, range controllato.', 'RIR 2'),
    (v_day_c, 'lombari-hyperextension', 4, 3, 14, 12, 15, 60, null, 'Movimento controllato, evitare iperestensione in alto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper Ipertrofia', 'Dorso, spalle, bicipiti', 3, 65) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'dorso-lat-machine-avanti', 1, 4, 11, 10, 12, 75, null, 'Tirare con le scapole.', 'RIR 1-2'),
    (v_day_d, 'spalle-shoulder-press', 2, 3, 11, 10, 12, 75, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_d, 'spalle-alzate-laterali', 3, 3, 15, null, null, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 1-2'),
    (v_day_d, 'bicipiti-curl-bilanciere', 4, 3, 11, 10, 12, 60, null, 'Gomiti fermi vicino al busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower Ipertrofia', 'Gambe, glutei', 4, 65) returning id into v_day_e;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_e, 'gambe-leg-press', 1, 4, 14, 12, 15, 75, null, 'Non bloccare le ginocchia in estensione.', 'RIR 1-2'),
    (v_day_e, 'gambe-hip-thrust', 2, 3, 11, 10, 12, 75, null, 'Contrazione glutei in massima estensione.', 'RIR 2'),
    (v_day_e, 'gambe-calf-raise', 3, 4, 18, 15, 20, 45, null, 'Pausa breve in massima contrazione.', 'RIR 1-2'),
    (v_day_e, 'core-cable-crunch', 4, 3, 15, null, null, 45, null, 'Flettere la colonna, bacino fermo.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Inizio Palestra (2 giorni)',
    'Primo contatto con la palestra: due sedute a settimana, macchine guidate, focus sull''apprendimento tecnico.',
    'Principianti', 'Principiante', 11,
    6, 2, 40, 'Macchine guidate, manubri leggeri',
    'Palestra', 'Full body', 'Total body', 'Bassa-moderata',
    'Non aumentare mai il carico se la tecnica non e'' stabile su tutte le serie. Priorita alle ripetizioni pulite.',
    false, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body base', 0, 40) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-leg-press', 1, 3, 14, 12, 15, 90, null, 'Escursione controllata, non bloccare le ginocchia.', 'RIR 3'),
    (v_day_a, 'petto-chest-press', 2, 3, 14, 12, 15, 75, null, 'Regolare il sedile per allineare le maniglie al petto.', 'RIR 3'),
    (v_day_a, 'dorso-pulley-basso', 3, 3, 14, 12, 15, 75, null, 'Busto stabile, tirare con le scapole.', 'RIR 3'),
    (v_day_a, 'spalle-alzate-laterali', 4, 2, 14, 12, 15, 60, null, 'Movimento controllato, niente slanci.', 'RIR 3'),
    (v_day_a, 'core-plank', 5, 3, 1, null, null, 30, 20, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body base (variante)', 1, 40) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-leg-extension', 1, 3, 14, 12, 15, 75, null, 'Movimento controllato, no scatti in ritorno.', 'RIR 3'),
    (v_day_b, 'dorso-vertical-row', 2, 3, 14, 12, 15, 75, null, 'Movimento controllato, niente slanci.', 'RIR 3'),
    (v_day_b, 'petto-push-up', 3, 3, 10, 8, 12, 75, null, 'Su ginocchia se necessario per mantenere la tecnica.', 'RIR 3'),
    (v_day_b, 'bicipiti-curl-manubri', 4, 2, 14, 12, 15, 60, null, 'Rotazione del polso in risalita.', 'RIR 3'),
    (v_day_b, 'core-crunch', 5, 2, 15, null, null, 60, null, 'Movimento breve, non tirare il collo.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Inizio Palestra (3 giorni)',
    'Prosecuzione naturale del programma a due sedute: introduce il bilanciere sui movimenti base con carichi leggeri.',
    'Principianti', 'Principiante', 12,
    8, 3, 45, 'Macchine guidate, bilanciere leggero, manubri',
    'Palestra', 'Full body', 'Total body', 'Moderata',
    'Incremento di ripetizioni prima del carico. Introdurre il bilanciere sullo squat solo quando la tecnica a corpo libero e'' solida.',
    false, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body A', 0, 45) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 3, 11, 10, 12, 90, null, 'Con bilanciere vuoto o carico leggero: tecnica prima di tutto.', 'RIR 3'),
    (v_day_a, 'petto-chest-press', 2, 3, 14, 12, 15, 75, null, 'Regolare il sedile per allineare le maniglie al petto.', 'RIR 3'),
    (v_day_a, 'dorso-pulley-basso', 3, 3, 14, 12, 15, 75, null, 'Busto stabile, tirare con le scapole.', 'RIR 3'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 25, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body B', 1, 45) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-leg-press', 1, 3, 14, 12, 15, 75, null, 'Escursione controllata, non bloccare le ginocchia.', 'RIR 3'),
    (v_day_b, 'dorso-lat-machine-avanti', 2, 3, 14, 12, 15, 75, null, 'Tirare con le scapole, non con le braccia.', 'RIR 3'),
    (v_day_b, 'spalle-shoulder-press', 3, 3, 14, 12, 15, 75, null, 'Con manubri leggeri, core attivo.', 'RIR 3'),
    (v_day_b, 'core-crunch', 4, 3, 15, null, null, 60, null, 'Movimento breve, non tirare il collo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body C', 2, 45) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-affondi', 1, 3, 11, 10, 12, 75, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 3'),
    (v_day_c, 'petto-push-up', 2, 3, 10, 8, 12, 75, null, 'Su ginocchia se necessario per mantenere la tecnica.', 'RIR 3'),
    (v_day_c, 'dorso-rematore-manubrio', 3, 3, 14, 12, 15, 75, null, 'Schiena parallela al pavimento, gomito vicino al busto.', 'RIR 3'),
    (v_day_c, 'core-dead-bug', 4, 3, 10, null, null, 60, null, 'Zona lombare stabile, movimento lento.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Tecnica dei Fondamentali',
    'Programma dedicato esclusivamente alla tecnica dei quattro movimenti fondamentali: squat, panca, stacco, press.',
    'Principianti', 'Principiante', 13,
    6, 3, 45, 'Bilanciere leggero, power rack',
    'Palestra', 'Tecnica fondamentali', 'Squat, panca, stacco, press', 'Bassa',
    'Il carico resta secondario: il coach valuta la progressione osservando la qualita del movimento, non il peso sollevato.',
    false, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Squat', 'Tecnica squat', 0, 45) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'mobilita-anche', 1, 2, 1, null, null, 30, 60, 'Movimenti lenti, range senza dolore.', 'RIR 3'),
    (v_day_a, 'gambe-squat', 2, 4, 8, null, null, 90, null, 'Bilanciere vuoto o carico leggero: focus sulla tecnica.', 'RIR 3'),
    (v_day_a, 'gambe-leg-press', 3, 3, 12, null, null, 75, null, 'Escursione controllata, non bloccare le ginocchia.', 'RIR 3'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 25, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Panca e Trazione', 'Tecnica panca e trazione', 1, 45) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'mobilita-spalle', 1, 2, 1, null, null, 30, 60, 'Movimento fluido, controllo delle scapole.', 'RIR 3'),
    (v_day_b, 'petto-panca-piana', 2, 4, 8, null, null, 90, null, 'Bilanciere vuoto o carico leggero: focus sulla tecnica.', 'RIR 3'),
    (v_day_b, 'dorso-pulley-basso', 3, 3, 12, null, null, 75, null, 'Busto stabile, tirare con le scapole.', 'RIR 3'),
    (v_day_b, 'core-crunch', 4, 3, 15, null, null, 60, null, 'Movimento breve, non tirare il collo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Focus Stacco e Press', 'Tecnica hip hinge e press', 2, 45) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'femorali-hip-hinge', 1, 3, 10, null, null, 60, null, 'Anche indietro, schiena neutra, ginocchia morbide.', 'RIR 3'),
    (v_day_c, 'gambe-stacco-rumeno', 2, 4, 8, null, null, 90, null, 'Bilanciere vuoto o carico leggero: focus sulla tecnica.', 'RIR 3'),
    (v_day_c, 'spalle-shoulder-press', 3, 3, 12, null, null, 75, null, 'Con manubri leggeri, core attivo.', 'RIR 3'),
    (v_day_c, 'lombari-bird-dog', 4, 3, 10, null, null, 60, null, 'Bacino stabile, schiena neutra, movimento lento.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Corpo Libero',
    'Programma interamente a corpo libero per allenarsi a casa senza pesi.',
    'Casa', 'Principiante', 14,
    6, 3, 35, 'Corpo libero, sbarra opzionale per il dorso',
    'Casa', 'Full body corpo libero', 'Total body', 'Moderata',
    'Progressione tramite aumento di ripetizioni o tenute, oppure varianti piu difficili (es. push up su ginocchia poi push up standard). Nessun carico esterno previsto.',
    false, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout A', 'Full body A', 0, 35) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-affondi', 1, 3, 14, 12, 15, 60, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2-3'),
    (v_day_a, 'petto-push-up', 2, 3, 12, 10, 15, 60, null, 'Corpo allineato dalla testa ai talloni.', 'RIR 2-3'),
    (v_day_a, 'glutei-glute-bridge', 3, 3, 15, null, null, 45, null, 'Retroversione del bacino in alto, spinta dai talloni.', 'RIR 2-3'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 30, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout B', 'Full body B', 1, 35) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-squat', 1, 3, 18, 15, 20, 60, null, 'Solo corpo libero: scendere sotto il parallelo se la mobilita lo consente.', 'RIR 2-3'),
    (v_day_b, 'dorso-trazioni', 2, 3, 10, 8, 12, 75, null, 'Se non disponibile una sbarra, sostituire con rematore usando uno zaino pesante.', 'RIR 2-3'),
    (v_day_b, 'core-mountain-climber', 3, 3, 1, null, null, 30, 30, 'Bacino stabile per tutto il movimento.', 'RPE 7'),
    (v_day_b, 'core-side-plank', 4, 3, 1, null, null, 30, 25, 'Corpo in linea, bacino alto.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Workout C', 'Full body C', 2, 35) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'glutei-affondi-posteriori', 1, 3, 14, 12, 15, 60, null, 'Passo controllato, busto stabile.', 'RIR 2-3'),
    (v_day_c, 'tricipiti-dip-tricipiti', 2, 3, 12, 10, 15, 60, null, 'Su sedia o panca stabile, busto il piu verticale possibile.', 'RIR 2-3'),
    (v_day_c, 'core-reverse-crunch', 3, 3, 15, null, null, 45, null, 'Non usare slancio, sollevare il bacino con controllo.', 'RIR 3'),
    (v_day_c, 'cardio-jumping-jack', 4, 3, 1, null, null, 20, 30, 'Atterraggio morbido sulle punte, ritmo costante.', 'RPE 7');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Manubri ed Elastici',
    'Programma casa con manubri ed elastici: split upper/lower per una progressione piu strutturata rispetto al solo corpo libero.',
    'Casa', 'Intermedio', 15,
    8, 4, 45, 'Manubri regolabili, elastici di resistenza',
    'Casa', 'Upper/Lower con manubri ed elastici', 'Total body', 'Moderata-alta',
    'Incremento del peso dei manubri o della resistenza dell''elastico quando il range alto viene completato con tecnica solida. La settimana 8 e'' deload: volume -30%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper A', 'Upper manubri', 0, 45) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana-manubri', 1, 4, 11, 10, 12, 75, null, 'Scapole stabili, manubri in linea con il petto.', 'RIR 2'),
    (v_day_a, 'dorso-rematore-manubrio', 2, 4, 11, 10, 12, 75, null, 'Schiena parallela al pavimento, gomito vicino al busto.', 'RIR 2'),
    (v_day_a, 'spalle-alzate-laterali', 3, 3, 14, 12, 15, 45, null, 'Non superare l''altezza delle spalle.', 'RIR 2'),
    (v_day_a, 'bicipiti-curl-manubri', 4, 3, 14, 12, 15, 45, null, 'Rotazione del polso in risalita.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower A', 'Lower manubri', 1, 45) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-affondi', 1, 4, 14, 12, 15, 60, null, 'Con manubri: ginocchio anteriore sopra la caviglia.', 'RIR 2'),
    (v_day_b, 'gambe-stacco-rumeno', 2, 3, 11, 10, 12, 75, null, 'Con manubri: schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_b, 'glutei-glute-bridge', 3, 3, 15, null, null, 45, null, 'Con manubrio sui fianchi: contrazione glutei in alto.', 'RIR 2'),
    (v_day_b, 'gambe-calf-raise', 4, 3, 18, 15, 20, 45, null, 'Con manubri: escursione completa, pausa in contrazione.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Upper B', 'Upper manubri ed elastici', 2, 45) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'dorso-rematore-manubrio', 1, 4, 11, 10, 12, 75, null, 'Variante di tirata rispetto a Upper A: gomito vicino al busto.', 'RIR 2'),
    (v_day_c, 'petto-panca-inclinata-manubri', 2, 4, 11, 10, 12, 75, null, 'Inclinazione moderata, gomiti sotto i polsi.', 'RIR 2'),
    (v_day_c, 'spalle-reverse-fly', 3, 3, 15, null, null, 45, null, 'Scapole che si avvicinano in apertura.', 'RIR 2'),
    (v_day_c, 'tricipiti-kickback', 4, 3, 14, 12, 15, 45, null, 'Braccio alto e fermo, estendere solo il gomito.', 'RIR 2'),
    (v_day_c, 'core-pallof-press', 5, 3, 12, null, null, 45, null, 'Con elastico: resistere alla rotazione, bacino fermo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Lower B', 'Lower manubri ed elastici', 3, 45) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'glutei-squat-sumo', 1, 4, 14, 12, 15, 75, null, 'Con manubrio: ginocchia verso le punte dei piedi.', 'RIR 2'),
    (v_day_d, 'gambe-bulgarian-split-squat', 2, 3, 11, 10, 12, 75, null, 'Con manubri: busto stabile, spinta dal piede avanti.', 'RIR 2'),
    (v_day_d, 'glutei-abduzioni', 3, 3, 18, 15, 20, 45, null, 'Con elastico: bacino stabile, pausa in apertura.', 'RIR 2'),
    (v_day_d, 'polpacci-calf-raise-monopodalico', 4, 3, 15, null, null, 45, null, 'Controllo dell''equilibrio, range completo.', 'RIR 2');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Preparazione Atletica',
    'Programma orientato alla performance atletica: potenza, forza e condizionamento in tre sedute distinte.',
    'Performance', 'Avanzato', 16,
    8, 3, 60, 'Bilanciere, manubri, corda, battle rope, vogatore',
    'Palestra', 'Potenza, forza, condizionamento', 'Total body', 'Alta',
    'Sui giorni potenza la priorita e'' la velocita esecutiva, non il carico. La settimana 8 e'' deload: volume -40%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Potenza', 'Potenza e velocita', 0, 60) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'gambe-squat', 1, 5, 3, 3, 3, 150, null, 'Esecuzione esplosiva in risalita, carico moderato.', 'RIR 3'),
    (v_day_a, 'cardio-salto-corda', 2, 4, 1, null, null, 45, 30, 'Rimbalzo morbido, ritmo alto.', 'RPE 7'),
    (v_day_a, 'gambe-affondi', 3, 3, 8, null, null, 90, null, 'Esecuzione esplosiva controllata in risalita.', 'RIR 3'),
    (v_day_a, 'core-hollow-hold', 4, 3, 1, null, null, 30, 30, 'Lombare a terra, regredire se si perde controllo.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Forza', 'Forza multiarticolare', 1, 60) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-stacco-rumeno', 1, 4, 6, null, null, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_b, 'petto-panca-piana', 2, 4, 6, null, null, 120, null, 'Scapole retratte, bilanciere sulla linea del petto.', 'RIR 2'),
    (v_day_b, 'dorso-rematore-bilanciere', 3, 4, 8, null, null, 90, null, 'Schiena neutra, evitare rimbalzi.', 'RIR 2'),
    (v_day_b, 'core-pallof-press', 4, 3, 12, null, null, 45, null, 'Resistere alla rotazione, bacino fermo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Condizionamento', 'Condizionamento metabolico', 2, 60) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'cardio-vogatore', 1, 4, 1, null, null, 45, 60, 'Spinta gambe, apertura busto, tirata braccia.', 'RPE 8'),
    (v_day_c, 'cardio-battle-rope', 2, 4, 1, null, null, 30, 30, 'Ondulazioni ad alta intensita, ginocchia morbide.', 'RPE 8'),
    (v_day_c, 'cardio-burpees', 3, 3, 1, null, null, 30, 30, 'Ritmo sostenuto, tecnica prima della velocita.', 'RPE 7-8'),
    (v_day_c, 'core-plank', 4, 3, 1, null, null, 30, 40, 'Corpo allineato, bacino stabile.', 'RIR 3');
end
$$;

do $$
declare
  v_tpl uuid;
  v_day_a uuid;
  v_day_b uuid;
  v_day_c uuid;
  v_day_d uuid;
begin
  insert into public.workout_templates (
    coach_id, folder_id, name, description, goal, level, sort_order,
    duration_weeks, sessions_per_week, estimated_session_minutes, equipment,
    location, training_style, muscle_focus, intensity, progression_notes,
    deload_week, is_system, source_template_id
  ) values (
    null, null, 'Forza e Resistenza',
    'Programma ibrido che alterna sedute a focus forza e sedute a focus resistenza muscolare/cardio.',
    'Performance', 'Intermedio', 17,
    8, 4, 55, 'Bilanciere, manubri, macchine, cardio (ellittica, stair climber)',
    'Palestra', 'Ibrido forza/resistenza', 'Total body', 'Alta',
    'Sui giorni forza la priorita e'' il carico, sui giorni resistenza la priorita e'' la densita (meno recupero, piu ripetizioni). La settimana 8 e'' deload: volume -30%.',
    true, true, null
  ) returning id into v_tpl;

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Forza A', 'Forza upper', 0, 55) returning id into v_day_a;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_a, 'petto-panca-piana', 1, 4, 7, 6, 8, 120, null, 'Scapole retratte, tecnica prima del carico.', 'RIR 2'),
    (v_day_a, 'dorso-lat-machine-avanti', 2, 4, 9, 8, 10, 90, null, 'Tirare con le scapole.', 'RIR 2'),
    (v_day_a, 'spalle-shoulder-press', 3, 3, 9, 8, 10, 90, null, 'Core attivo, non inarcare la lombare.', 'RIR 2'),
    (v_day_a, 'core-plank', 4, 3, 1, null, null, 30, 40, 'Corpo allineato, bacino stabile.', 'RIR 3');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Resistenza A', 'Resistenza lower + cardio', 1, 55) returning id into v_day_b;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_b, 'gambe-leg-press', 1, 3, 18, 15, 20, 45, null, 'Densita alta: recupero breve tra le serie.', 'RIR 2'),
    (v_day_b, 'gambe-affondi', 2, 3, 18, 15, 20, 45, null, 'Ginocchio anteriore sopra la caviglia.', 'RIR 2'),
    (v_day_b, 'cardio-stair-climber', 3, 3, 1, null, null, 60, 300, 'Postura alta, passo costante per 5 minuti.', 'RPE 7'),
    (v_day_b, 'core-russian-twist', 4, 3, 20, null, null, 30, null, 'Movimento controllato dal busto.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Forza B', 'Forza lower', 2, 55) returning id into v_day_c;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_c, 'gambe-squat', 1, 4, 7, 6, 8, 150, null, 'Ginocchia in linea con le punte dei piedi.', 'RIR 2'),
    (v_day_c, 'gambe-stacco-rumeno', 2, 3, 9, 8, 10, 120, null, 'Schiena neutra per tutta l''esecuzione.', 'RIR 2'),
    (v_day_c, 'gambe-calf-raise', 3, 3, 14, 12, 15, 60, null, 'Escursione completa, pausa in contrazione.', 'RIR 2'),
    (v_day_c, 'core-cable-crunch', 4, 3, 15, null, null, 45, null, 'Flettere la colonna, bacino fermo.', 'RIR 2');

  insert into public.workout_template_days (template_id, name, focus, sort_order, estimated_duration_minutes)
  values (v_tpl, 'Resistenza B', 'Resistenza upper + cardio', 3, 55) returning id into v_day_d;
  insert into public.workout_template_exercises (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, duration_seconds, notes, rpe_rir) values
    (v_day_d, 'petto-chest-press', 1, 3, 18, 15, 20, 45, null, 'Densita alta: recupero breve tra le serie.', 'RIR 2'),
    (v_day_d, 'dorso-rematore-manubrio', 2, 3, 18, 15, 20, 45, null, 'Schiena parallela al pavimento, gomito vicino al busto.', 'RIR 2'),
    (v_day_d, 'cardio-ellittica', 3, 3, 1, null, null, 60, 300, 'Postura eretta per 5 minuti a intensita costante.', 'RPE 7'),
    (v_day_d, 'core-mountain-climber', 4, 3, 1, null, null, 30, 30, 'Bacino stabile per tutto il movimento.', 'RPE 7');
end
$$;

notify pgrst, 'reload schema';
