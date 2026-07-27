-- feat: sotto-blocco 2.2 — seed completo e verificato dei metadati esercizio.
--
-- SOLO SEED + una piccola estensione di tassonomia dimostrata necessaria
-- (vedi punto 0 sotto). Nessun motore di revisione, nessuna RPC, nessuna
-- variazione automatica effettiva, nessuna UI/notifica, nessuna modifica
-- all'algoritmo di assegnazione iniziale (Blocco 1).
--
-- ANALISI DEL CATALOGO REALE (read-only, eseguita prima di scrivere questa
-- migration — vedi anche docs/EXERCISE_METADATA_COVERAGE.md per il dettaglio
-- completo):
--   - mobile/src/data/exercise-library.ts: 96 esercizi totali (44 "storici"
--     + 52 "coverage"), TUTTI con active=true (nessun esercizio disattivato/
--     legacy in questo file). ID univoci: 96 (nessun duplicato di id — sono
--     chiavi letterali dell'array, garantito dalla struttura del file).
--   - Esercizi usati dai 18 template auto_eligible: 78 id distinti (query
--     diretta su workout_template_exercises/workout_template_days/
--     workout_templates), TUTTI presenti nel catalogo (0 riferimenti
--     orfani/mancanti, verificato riga per riga).
--   - Esercizi usati in TUTTE le schede reali assegnate (non solo template):
--     stessi 78 id "locali" (testo) PIU' 2 id in formato UUID, entrambi
--     verificati appartenere esclusivamente a workout_plans con
--     origin='coach' (esercizi custom/ymove di un coach reale) — fuori
--     scope per il sistema automatico self-guided (che usa sempre e solo id
--     locali, mai custom/ymove: verificato che i template di sistema non
--     referenziano mai un id in formato uuid). Zero righe self-guided
--     coinvolgono id non presenti nel catalogo locale.
--   - Duplicati di NOME/movimento (non di id) trovati e documentati (non
--     rinominati/rimossi, fuori scope — solo annotati nel metadato):
--     `gambe-leg-press` e `gambe-leg-press-45` sono la stessa macchina con
--     nome leggermente diverso; `gambe-leg-curl` ha una descrizione
--     originale ambigua ("da sdraiati o seduti") che si sovrappone a
--     `femorali-leg-curl-sdraiato`/`femorali-leg-curl-seduto`.
--
-- 0) ESTENSIONE TASSONOMIA — SOLO 3 VALORI, NECESSITA' DIMOSTRATA
-- ============================================================================
-- Il CHECK di exercise_movement_metadata.movement_pattern (2.1) ha 14 valori:
-- squat/hinge/lunge/horizontal_push/horizontal_pull/vertical_push/
-- vertical_pull/core_anti_extension/core_anti_rotation/carry/isolation_arms/
-- isolation_legs/cardio/mobility. Classificando i 96 esercizi reali e'
-- emersa una necessita' dimostrata: crunch/reverse-crunch/cable-crunch
-- (flessione del busto), hyperextension/superman (estensione del busto) e
-- russian-twist (rotazione del busto) NON sono movimenti "anti" (non sono
-- tenute isometriche di resistenza come plank/pallof-press): sono movimenti
-- dinamici nella direzione opposta. Forzarli in core_anti_extension/
-- core_anti_rotation sarebbe una classificazione fattualmente sbagliata,
-- proprio il tipo di errore che il compito chiede di evitare ("nessuna
-- classificazione inventata"). Aggiunti SOLO 3 valori (non i 24 suggeriti
-- nel testo del compito, che includevano anche categorie — knee_flexion/
-- knee_extension/hip_abduction/hip_adduction/calf_raise/elbow_flexion/
-- elbow_extension/shoulder_abduction/shoulder_isolation — gia' ragionevolmente
-- coperte da isolation_legs/isolation_arms esistenti senza necessita'
-- dimostrata di frammentarle ulteriormente): core_flexion, core_extension,
-- core_rotation. Nessun'altra estensione ai CHECK del 2.1.
--
-- Le altre tassonomie richieste dal compito (attrezzatura, luogo, livello,
-- categoria, gruppi muscolari) NON sono state estese: sono gia' quelle reali
-- del 2.1 (equipment_tag a 3 livelli bodyweight_only/home_basic/full_gym,
-- identico a client_fitness_profile.equipment_level — verificato nell'app,
-- questionario-fitness.tsx, "Solo corpo libero"/"Attrezzatura di base:
-- Manubri, elastici, tappetino"/"Palestra completa: Bilancieri, macchine,
-- cavi" — regola applicata: un esercizio ottiene il livello PIU' BASSO tra
-- le alternative di attrezzatura esplicitamente elencate nel testo, mai il
-- piu' alto, perche' equipment_tag rappresenta "il minimo sufficiente per
-- eseguirlo", non l'attrezzatura preferita; primary_muscle_group e' lo
-- stesso ExerciseMuscleGroupId gia' usato da mobile/src/types/training.ts,
-- riusato identico, non reinventato).
alter table public.exercise_movement_metadata drop constraint exercise_movement_metadata_movement_pattern_check;
alter table public.exercise_movement_metadata add constraint exercise_movement_metadata_movement_pattern_check
  check (movement_pattern in (
    'squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull',
    'vertical_push', 'vertical_pull', 'core_anti_extension', 'core_anti_rotation',
    'core_flexion', 'core_extension', 'core_rotation',
    'carry', 'isolation_arms', 'isolation_legs', 'cardio', 'mobility'
  ));

-- Nuova colonna richiesta dal compito ("fonte o nota di classificazione, se
-- disponibile"), additiva, nullable — nessun impatto sui dati esistenti.
alter table public.exercise_movement_metadata add column if not exists classification_note text;

-- ============================================================================
-- 1) SEED — 96 esercizi (upsert idempotente, sostituisce la riga minima del
-- 2.1 con la classificazione completa; nessuna eliminazione)
-- ============================================================================
-- Colonne: exercise_id, movement_pattern, primary_muscle_group,
-- secondary_muscle_groups, equipment_tag, compatible_locations, min_level,
-- role, is_unilateral, movement_class, eligible_for_substitution,
-- substitution_group, classification_note. metadata_version=2 per ogni riga
-- (era 1 nella riga minima del 2.1 — solo per gambe-squat).
insert into public.exercise_movement_metadata (
  exercise_id, movement_pattern, primary_muscle_group, secondary_muscle_groups,
  equipment_tag, compatible_locations, min_level, role, is_unilateral,
  movement_class, eligible_for_substitution, substitution_group,
  classification_note, metadata_version
) values
-- PETTO (9)
('petto-panca-piana', 'horizontal_push', 'petto', array['tricipiti','spalle'], 'full_gym', array['gym'], 'intermediate', 'primary', false, 'compound', true, 'bench_flat_petto', null, 2),
('petto-panca-piana-manubri', 'horizontal_push', 'petto', array['tricipiti','spalle'], 'home_basic', array['gym','home'], 'intermediate', 'primary', false, 'compound', true, 'bench_flat_petto', null, 2),
('petto-panca-inclinata', 'horizontal_push', 'petto', array['tricipiti','spalle'], 'home_basic', array['gym','home'], 'intermediate', 'secondary', false, 'compound', true, 'bench_incline_petto', null, 2),
('petto-panca-inclinata-manubri', 'horizontal_push', 'petto', array['tricipiti','spalle'], 'home_basic', array['gym','home'], 'intermediate', 'secondary', false, 'compound', true, 'bench_incline_petto', null, 2),
('petto-chest-press', 'horizontal_push', 'petto', array['tricipiti'], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'bench_flat_petto', 'Variante macchina guidata dello stesso movimento di spinta orizzontale.', 2),
('petto-croci-manubri', 'horizontal_push', 'petto', array[]::text[], 'home_basic', array['gym','home'], 'intermediate', 'accessory', false, 'isolation', true, 'chest_fly_isolation', null, 2),
('petto-croci-cavi', 'horizontal_push', 'petto', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'chest_fly_isolation', null, 2),
('petto-push-up', 'horizontal_push', 'petto', array['tricipiti','spalle'], 'bodyweight_only', array['gym','home'], 'beginner', 'secondary', false, 'compound', true, 'bench_flat_petto', 'Variante a corpo libero: nessuna attrezzatura richiesta, utile come fallback quando panca/bilanciere non sono disponibili.', 2),
('petto-dips-petto', 'vertical_push', 'petto', array['tricipiti'], 'full_gym', array['gym'], 'advanced', 'secondary', false, 'compound', true, 'dip_vertical_push', 'Stesso movimento fisico di tricipiti-dip-tricipiti, differenziato solo per inclinazione del busto (qui enfasi pettorale).', 2),

-- DORSO (10)
('dorso-lat-machine-avanti', 'vertical_pull', 'dorsali', array['bicipiti'], 'full_gym', array['gym'], 'beginner', 'primary', false, 'compound', true, 'lat_pulldown_wide', null, 2),
('dorso-lat-machine-neutra', 'vertical_pull', 'dorsali', array['bicipiti'], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'lat_pulldown_neutral', null, 2),
('dorso-trazioni', 'vertical_pull', 'dorsali', array['bicipiti'], 'home_basic', array['gym','home'], 'advanced', 'primary', false, 'compound', true, 'pullup_bodyweight', null, 2),
('dorso-trazioni-assistite', 'vertical_pull', 'dorsali', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'secondary', false, 'compound', true, 'pullup_bodyweight', 'Variante assistita, piu'' semplice della trazione completa.', 2),
('dorso-pulley-basso', 'horizontal_pull', 'dorsali', array['bicipiti'], 'full_gym', array['gym'], 'beginner', 'primary', false, 'compound', true, 'row_horizontal_dorsali', null, 2),
('dorso-rematore-manubrio', 'horizontal_pull', 'dorsali', array['bicipiti'], 'home_basic', array['gym','home'], 'intermediate', 'secondary', true, 'compound', true, 'row_horizontal_dorsali', null, 2),
('dorso-rematore-bilanciere', 'horizontal_pull', 'dorsali', array['bicipiti','lombari'], 'full_gym', array['gym'], 'advanced', 'primary', false, 'compound', true, 'row_horizontal_dorsali', null, 2),
('dorso-rematore-macchina', 'horizontal_pull', 'dorsali', array['bicipiti'], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'row_horizontal_dorsali', null, 2),
('dorso-vertical-row', 'horizontal_pull', 'dorsali', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'row_horizontal_dorsali', 'Nome commerciale "vertical row": nonostante il nome, la trazione allena scapole/dorso come una fila orizzontale (rematore), non come una trazione verticale tipo lat machine.', 2),
('dorso-pullover-cavo', 'vertical_pull', 'dorsali', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'lat_pullover_isolation', null, 2),

-- SPALLE (7)
('spalle-shoulder-press', 'vertical_push', 'spalle', array['tricipiti'], 'home_basic', array['gym','home'], 'intermediate', 'primary', false, 'compound', true, 'ohp_shoulder', null, 2),
('spalle-military-press', 'vertical_push', 'spalle', array['tricipiti'], 'full_gym', array['gym'], 'advanced', 'primary', false, 'compound', true, 'ohp_shoulder', null, 2),
('spalle-alzate-laterali', 'isolation_arms', 'spalle', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'lateral_raise_delts', 'Categoria isolation_arms usata in senso esteso (isolamento di un singolo gruppo della parte superiore del corpo), non solo braccio in senso stretto.', 2),
('spalle-alzate-frontali', 'isolation_arms', 'spalle', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'frontal_raise_delts', 'Categoria isolation_arms usata in senso esteso — vedi nota su spalle-alzate-laterali.', 2),
('spalle-reverse-fly', 'horizontal_pull', 'spalle', array['trapezi'], 'home_basic', array['gym','home'], 'intermediate', 'accessory', false, 'isolation', true, 'rear_delt_pull', null, 2),
('spalle-face-pull', 'horizontal_pull', 'spalle', array['trapezi'], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'isolation', true, 'rear_delt_pull', null, 2),
('spalle-tirate-mento', 'vertical_pull', 'spalle', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'upright_row_traps', null, 2),

-- BICIPITI (7)
('bicipiti-curl-bilanciere', 'isolation_arms', 'bicipiti', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'isolation', true, 'bicep_curl_main', null, 2),
('bicipiti-curl-manubri', 'isolation_arms', 'bicipiti', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'secondary', false, 'isolation', true, 'bicep_curl_main', null, 2),
('bicipiti-curl-alternato', 'isolation_arms', 'bicipiti', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'bicep_curl_main', null, 2),
('bicipiti-curl-martello', 'isolation_arms', 'bicipiti', array['avambracci'], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'bicep_curl_hammer', null, 2),
('bicipiti-curl-cavo', 'isolation_arms', 'bicipiti', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'bicep_curl_cable', null, 2),
('bicipiti-curl-panca-inclinata', 'isolation_arms', 'bicipiti', array[]::text[], 'home_basic', array['gym','home'], 'intermediate', 'accessory', false, 'isolation', true, 'bicep_curl_incline', null, 2),
('bicipiti-preacher-curl', 'isolation_arms', 'bicipiti', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'bicep_curl_incline', 'Stesso principio biomeccanico di bicipiti-curl-panca-inclinata (braccio fisso in appoggio, isolamento stretto del bicipite).', 2),

-- TRICIPITI (6)
('tricipiti-pushdown-cavo', 'isolation_arms', 'tricipiti', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'isolation', true, 'tricep_pushdown', null, 2),
('tricipiti-french-press', 'isolation_arms', 'tricipiti', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'isolation', true, 'tricep_overhead', null, 2),
('tricipiti-dip-tricipiti', 'vertical_push', 'tricipiti', array['petto'], 'home_basic', array['gym','home'], 'intermediate', 'secondary', false, 'compound', true, 'dip_vertical_push', 'Stesso movimento fisico di petto-dips-petto, differenziato solo per inclinazione del busto (qui enfasi tricipiti).', 2),
('tricipiti-estensioni-sopra-testa', 'isolation_arms', 'tricipiti', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'tricep_overhead', null, 2),
('tricipiti-kickback', 'isolation_arms', 'tricipiti', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'tricep_kickback', null, 2),
('tricipiti-panca-presa-stretta', 'horizontal_push', 'tricipiti', array['petto','spalle'], 'full_gym', array['gym'], 'intermediate', 'secondary', false, 'compound', true, 'bench_close_grip_tricipiti', null, 2),

-- GAMBE — famiglia SQUAT (7)
('gambe-squat', 'squat', 'quadricipiti', array['glutei','addome'], 'full_gym', array['gym'], 'intermediate', 'primary', false, 'compound', true, 'squat_barbell_quad', null, 2),
('gambe-front-squat', 'squat', 'quadricipiti', array['glutei','addome'], 'full_gym', array['gym'], 'advanced', 'secondary', false, 'compound', true, 'squat_barbell_quad', null, 2),
('gambe-hack-squat', 'squat', 'quadricipiti', array['glutei'], 'full_gym', array['gym'], 'intermediate', 'secondary', false, 'compound', true, 'squat_machine_quad', null, 2),
('gambe-leg-press', 'squat', 'quadricipiti', array['glutei'], 'full_gym', array['gym'], 'beginner', 'primary', false, 'compound', true, 'squat_machine_quad', 'Praticamente lo stesso esercizio di gambe-leg-press-45 (stessa macchina, differenza minima di angolazione, nomi diversi nel catalogo storico).', 2),
('gambe-leg-press-45', 'squat', 'quadricipiti', array['glutei'], 'full_gym', array['gym'], 'beginner', 'primary', false, 'compound', true, 'squat_machine_quad', 'Praticamente lo stesso esercizio di gambe-leg-press (vedi nota su quell''esercizio).', 2),
('glutei-squat-sumo', 'squat', 'glutei', array['quadricipiti','adduttori'], 'home_basic', array['gym','home'], 'intermediate', 'secondary', false, 'compound', true, 'squat_sumo_glute', null, 2),
('gambe-leg-extension', 'isolation_legs', 'quadricipiti', array[]::text[], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'isolation', true, 'knee_extension_isolation', null, 2),

-- GAMBE — famiglia LUNGE (4)
('gambe-affondi', 'lunge', 'quadricipiti', array['glutei'], 'bodyweight_only', array['gym','home'], 'intermediate', 'secondary', true, 'compound', true, 'lunge_bodyweight_quad', null, 2),
('gambe-bulgarian-split-squat', 'lunge', 'quadricipiti', array['glutei'], 'home_basic', array['gym','home'], 'advanced', 'secondary', true, 'compound', true, 'lunge_bodyweight_quad', null, 2),
('gambe-step-up', 'lunge', 'quadricipiti', array['glutei'], 'home_basic', array['gym','home'], 'beginner', 'accessory', true, 'compound', true, 'lunge_bodyweight_quad', null, 2),
('glutei-affondi-posteriori', 'lunge', 'glutei', array['quadricipiti'], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', true, 'compound', true, 'lunge_bodyweight_quad', null, 2),

-- GAMBE/FEMORALI/GLUTEI — famiglia HINGE (5)
('gambe-stacco-rumeno', 'hinge', 'femorali', array['glutei','lombari'], 'full_gym', array['gym'], 'advanced', 'primary', false, 'compound', true, 'hinge_hamstring_barbell', null, 2),
('femorali-good-morning', 'hinge', 'femorali', array['glutei','lombari'], 'full_gym', array['gym'], 'advanced', 'secondary', false, 'compound', true, 'hinge_hamstring_barbell', null, 2),
('femorali-hip-hinge', 'hinge', 'femorali', array['glutei','lombari'], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'compound', true, 'hinge_hamstring_barbell', 'Drill introduttivo senza carico per apprendere il pattern, stesso schema di movimento delle varianti caricate.', 2),
('gambe-hip-thrust', 'hinge', 'glutei', array['femorali'], 'full_gym', array['gym'], 'intermediate', 'primary', false, 'compound', true, 'hinge_glute_extension', null, 2),
('glutei-glute-bridge', 'hinge', 'glutei', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'secondary', false, 'compound', true, 'hinge_glute_extension', null, 2),

-- FEMORALI — isolamento ginocchio (4)
('gambe-leg-curl', 'isolation_legs', 'femorali', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'isolation', true, 'knee_flexion_isolation', 'Descrizione originale ambigua ("da sdraiati o seduti"): si sovrappone a femorali-leg-curl-sdraiato/femorali-leg-curl-seduto. Classificato come equivalente generico, sostituibile con entrambe le varianti specifiche.', 2),
('femorali-leg-curl-sdraiato', 'isolation_legs', 'femorali', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'isolation', true, 'knee_flexion_isolation', null, 2),
('femorali-leg-curl-seduto', 'isolation_legs', 'femorali', array[]::text[], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'isolation', true, 'knee_flexion_isolation', null, 2),
('femorali-nordic-curl', 'isolation_legs', 'femorali', array[]::text[], 'bodyweight_only', array['gym','home'], 'advanced', 'accessory', false, 'isolation', true, 'knee_flexion_isolation', null, 2),

-- GLUTEI — isolamento (2)
('glutei-kickback-cavo', 'isolation_legs', 'glutei', array[]::text[], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'isolation', true, 'glute_isolation', null, 2),
('glutei-abduzioni', 'isolation_legs', 'glutei', array['abduttori'], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'glute_isolation', null, 2),

-- POLPACCI (4)
('gambe-calf-raise', 'isolation_legs', 'polpacci', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'secondary', false, 'isolation', true, 'calf_raise_standing', null, 2),
('polpacci-calf-raise-seduto', 'isolation_legs', 'polpacci', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'isolation', true, 'calf_raise_seated', null, 2),
('polpacci-calf-press-leg-press', 'isolation_legs', 'polpacci', array[]::text[], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'isolation', true, 'calf_raise_seated', 'Ginocchio flesso sulla pedana leg press: biomeccanicamente simile al calf raise da seduto.', 2),
('polpacci-calf-raise-monopodalico', 'isolation_legs', 'polpacci', array[]::text[], 'bodyweight_only', array['gym','home'], 'intermediate', 'accessory', true, 'isolation', true, 'calf_raise_standing', null, 2),

-- CORE — flessione (4)
('core-crunch', 'core_flexion', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'secondary', false, 'isolation', true, 'crunch_ab_flexion', null, 2),
('core-cable-crunch', 'core_flexion', 'addome', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'secondary', false, 'isolation', true, 'crunch_ab_flexion', null, 2),
('core-reverse-crunch', 'core_flexion', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'crunch_ab_flexion', null, 2),
('core-leg-raise', 'core_flexion', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'intermediate', 'accessory', false, 'isolation', true, 'leg_raise_lower_ab', null, 2),

-- CORE — anti-estensione/stabilita' (3)
('core-plank', 'core_anti_extension', 'addome', array['obliqui','lombari'], 'bodyweight_only', array['gym','home'], 'beginner', 'secondary', false, 'isolation', true, 'plank_ab_stability', null, 2),
('core-hollow-hold', 'core_anti_extension', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'intermediate', 'accessory', false, 'isolation', true, 'plank_ab_stability', null, 2),
('core-dead-bug', 'core_anti_extension', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'plank_ab_stability', null, 2),

-- CORE — rotazione/anti-rotazione (3)
('core-russian-twist', 'core_rotation', 'obliqui', array['addome'], 'bodyweight_only', array['gym','home'], 'intermediate', 'secondary', false, 'isolation', true, 'rotation_oblique', null, 2),
('core-pallof-press', 'core_anti_rotation', 'obliqui', array['addome'], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'antirotation_oblique', null, 2),
('core-side-plank', 'core_anti_rotation', 'obliqui', array['addome'], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'antirotation_oblique', 'Stabilita'' anti-flessione-laterale: bucket piu'' vicino disponibile e'' core_anti_rotation (nessuna categoria dedicata alla flessione laterale nella tassonomia attuale).', 2),

-- CORE — ibrido cardio (1)
('core-mountain-climber', 'cardio', 'addome', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'compound', true, 'cardio_bodyweight_core', 'Esercizio ibrido core/cardio: movement_pattern=cardio per coerenza con l''exerciseType gia'' impostato nel catalogo app (override esplicito), pur avendo gruppo muscolare principale addome.', 2),

-- LOMBARI (3)
('lombari-hyperextension', 'core_extension', 'lombari', array['glutei','femorali'], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'back_extension_lumbar', null, 2),
('lombari-superman-controllato', 'core_extension', 'lombari', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'back_extension_lumbar', null, 2),
('lombari-bird-dog', 'core_anti_rotation', 'lombari', array['addome'], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'antirotation_lumbar', null, 2),

-- CARDIO (9)
('cardio-tapis-roulant', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'cardio_machine_steady', null, 2),
('cardio-cyclette', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'cardio_machine_steady', null, 2),
('cardio-ellittica', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'cardio_machine_steady', null, 2),
('cardio-vogatore', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'beginner', 'secondary', false, 'compound', true, 'cardio_machine_steady', null, 2),
('cardio-stair-climber', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'beginner', 'accessory', false, 'compound', true, 'cardio_machine_steady', null, 2),
('cardio-battle-rope', 'cardio', 'cardio', array[]::text[], 'full_gym', array['gym'], 'intermediate', 'accessory', false, 'compound', true, 'cardio_hiit_functional', null, 2),
('cardio-burpees', 'cardio', 'cardio', array[]::text[], 'bodyweight_only', array['gym','home'], 'advanced', 'accessory', false, 'compound', true, 'cardio_hiit_functional', null, 2),
('cardio-jumping-jack', 'cardio', 'cardio', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'compound', true, 'cardio_hiit_functional', null, 2),
('cardio-salto-corda', 'cardio', 'cardio', array[]::text[], 'home_basic', array['gym','home'], 'intermediate', 'accessory', false, 'compound', true, 'cardio_hiit_functional', null, 2),

-- MOBILITA'/STRETCHING (8)
('mobilita-anche', 'mobility', 'mobilita', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'mobility_lower', null, 2),
('mobilita-caviglie', 'mobility', 'mobilita', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'mobility_lower', null, 2),
('mobilita-spalle', 'mobility', 'mobilita', array[]::text[], 'home_basic', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'mobility_upper', null, 2),
('mobilita-rotazioni-toraciche', 'mobility', 'mobilita', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'mobility_upper', null, 2),
('mobilita-cat-cow', 'mobility', 'mobilita', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'mobility_upper', null, 2),
('stretching-femorali', 'mobility', 'stretching', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'stretch_static', null, 2),
('stretching-quadricipiti', 'mobility', 'stretching', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'stretch_static', null, 2),
('stretching-pettorali', 'mobility', 'stretching', array[]::text[], 'bodyweight_only', array['gym','home'], 'beginner', 'accessory', false, 'isolation', true, 'stretch_static', null, 2)

on conflict (exercise_id) do update set
  movement_pattern = excluded.movement_pattern,
  primary_muscle_group = excluded.primary_muscle_group,
  secondary_muscle_groups = excluded.secondary_muscle_groups,
  equipment_tag = excluded.equipment_tag,
  compatible_locations = excluded.compatible_locations,
  min_level = excluded.min_level,
  role = excluded.role,
  is_unilateral = excluded.is_unilateral,
  movement_class = excluded.movement_class,
  eligible_for_substitution = excluded.eligible_for_substitution,
  substitution_group = excluded.substitution_group,
  classification_note = excluded.classification_note,
  metadata_version = excluded.metadata_version,
  updated_at = now();

-- ============================================================================
-- 2) ALTERNATIVE CURATE — direzionali, motivate, mai simmetriche per default
-- ============================================================================
-- Priorita': 1 = equivalente molto vicino (stesso schema+attrezzatura simile
-- o stessa macchina); 2 = stessa funzione con attrezzatura diversa; 3 =
-- variante piu' semplice/piu' complessa; 4 = ripiego (fallback bodyweight/
-- macchina quando l'attrezzatura preferita manca). Ogni riga e' scritta
-- esplicitamente in UNA direzione; le coppie simmetriche (bilanciere<->
-- manubri, ecc.) hanno entrambe le righe inserite di proposito, mai assunte.
insert into public.exercise_alternatives (
  source_exercise_id, alternative_exercise_id, movement_pattern_match, equipment_tag,
  relative_difficulty, priority, reason, is_active
) values
-- Spinta orizzontale (petto)
('petto-panca-piana', 'petto-panca-piana-manubri', true, 'home_basic', 'equivalent', 1, 'Stesso schema di movimento e stesso gruppo muscolare principale, solo attrezzatura diversa (bilanciere -> manubri).', true),
('petto-panca-piana-manubri', 'petto-panca-piana', true, 'full_gym', 'equivalent', 1, 'Stesso schema di movimento, direzione inversa (manubri -> bilanciere).', true),
('petto-panca-piana', 'petto-chest-press', true, 'full_gym', 'easier', 2, 'Stessa funzione (spinta orizzontale petto) su macchina guidata: piu'' semplice tecnicamente, stesso stimolo principale.', true),
('petto-panca-piana-manubri', 'petto-push-up', true, 'bodyweight_only', 'easier', 4, 'Ripiego a corpo libero quando panca/manubri non sono disponibili: stesso schema di movimento, carico ridotto al peso corporeo.', true),
('petto-panca-inclinata', 'petto-panca-inclinata-manubri', true, 'home_basic', 'equivalent', 1, 'Stesso schema di movimento, attrezzatura diversa.', true),
('petto-panca-inclinata-manubri', 'petto-panca-inclinata', true, 'full_gym', 'equivalent', 1, 'Stesso schema di movimento, direzione inversa.', true),
('petto-croci-manubri', 'petto-croci-cavi', true, 'full_gym', 'equivalent', 1, 'Stesso movimento di isolamento (fly), tensione continua ai cavi invece che libera con i manubri.', true),
('petto-croci-cavi', 'petto-croci-manubri', true, 'home_basic', 'equivalent', 1, 'Stesso movimento di isolamento, direzione inversa.', true),
('petto-dips-petto', 'tricipiti-dip-tricipiti', false, 'home_basic', 'equivalent', 3, 'Stesso esercizio fisico (dip alle parallele), enfasi muscolare diversa in base all''inclinazione del busto: non scambiare automaticamente il gruppo muscolare principale, solo come variante di programmazione se il petto non e'' il focus.', true),

-- Tirata verticale/orizzontale (dorso)
('dorso-lat-machine-avanti', 'dorso-lat-machine-neutra', true, 'full_gym', 'equivalent', 2, 'Stessa macchina, presa diversa (larga vs neutra): enfasi leggermente diversa su dorsali/bicipiti, stesso schema verticale.', true),
('dorso-lat-machine-avanti', 'dorso-trazioni-assistite', true, 'full_gym', 'harder', 3, 'Stesso schema di tirata verticale, variante assistita per progressione verso la trazione libera.', true),
('dorso-trazioni-assistite', 'dorso-trazioni', true, 'home_basic', 'harder', 3, 'Stesso schema di tirata verticale senza assistenza: variante piu'' complessa per progressione.', true),
('dorso-trazioni', 'dorso-trazioni-assistite', true, 'full_gym', 'easier', 3, 'Stesso schema di tirata verticale con assistenza: variante piu'' semplice per regressione o rientro dopo pausa.', true),
('dorso-pulley-basso', 'dorso-rematore-manubrio', true, 'home_basic', 'equivalent', 2, 'Stessa funzione (tirata orizzontale al dorso), attrezzatura diversa.', true),
('dorso-rematore-manubrio', 'dorso-rematore-bilanciere', true, 'full_gym', 'harder', 2, 'Stessa funzione, il bilanciere permette carichi bilaterali maggiori.', true),
('dorso-rematore-bilanciere', 'dorso-rematore-manubrio', true, 'home_basic', 'easier', 2, 'Stessa funzione, il manubrio monolaterale e'' tecnicamente piu'' semplice da gestire sulla schiena.', true),
('dorso-rematore-manubrio', 'dorso-rematore-macchina', true, 'full_gym', 'easier', 2, 'Stessa funzione su macchina guidata: piu'' semplice tecnicamente.', true),
('dorso-rematore-macchina', 'dorso-vertical-row', true, 'full_gym', 'equivalent', 2, 'Entrambe macchine guidate per la tirata orizzontale al dorso.', true),
('dorso-pullover-cavo', 'dorso-lat-machine-avanti', false, 'full_gym', 'harder', 4, 'Ripiego verso un movimento composto quando il pullover isolato non e'' disponibile: gruppo muscolare condiviso (dorsali), schema di movimento diverso (isolamento -> composto verticale) — usare solo come ultima risorsa.', true),

-- Spinta verticale (spalle)
('spalle-shoulder-press', 'spalle-military-press', true, 'full_gym', 'harder', 2, 'Stessa funzione (spinta sopra la testa), il bilanciere in piedi richiede piu'' stabilita'' del core.', true),
('spalle-military-press', 'spalle-shoulder-press', true, 'home_basic', 'easier', 2, 'Stessa funzione, variante seduta/manubri piu'' semplice da stabilizzare.', true),
('spalle-alzate-laterali', 'spalle-alzate-frontali', false, 'home_basic', 'equivalent', 4, 'Isolamento della spalla con manubri, ma piano di movimento diverso (laterale vs frontale): non equivalenti per enfasi, priorita'' bassa, da preferire solo per varieta'' quando entrambe le teste del deltoide sono gia'' allenate altrove nella scheda.', true),
('spalle-reverse-fly', 'spalle-face-pull', true, 'full_gym', 'equivalent', 1, 'Stesso obiettivo (deltoide posteriore, tirata orizzontale isolata), attrezzatura diversa.', true),
('spalle-face-pull', 'spalle-reverse-fly', true, 'home_basic', 'equivalent', 1, 'Stesso obiettivo, direzione inversa.', true),

-- Bicipiti
('bicipiti-curl-bilanciere', 'bicipiti-curl-manubri', true, 'home_basic', 'equivalent', 1, 'Stesso movimento di isolamento, attrezzatura diversa.', true),
('bicipiti-curl-manubri', 'bicipiti-curl-bilanciere', true, 'full_gym', 'equivalent', 1, 'Stesso movimento, direzione inversa.', true),
('bicipiti-curl-manubri', 'bicipiti-curl-alternato', true, 'home_basic', 'equivalent', 1, 'Stessa attrezzatura ed esecuzione, alternata invece che simultanea.', true),
('bicipiti-curl-manubri', 'bicipiti-curl-martello', true, 'home_basic', 'equivalent', 2, 'Stessa attrezzatura, presa neutra: coinvolge anche il brachioradiale, buona variante di rotazione.', true),
('bicipiti-curl-bilanciere', 'bicipiti-curl-cavo', true, 'full_gym', 'equivalent', 2, 'Stesso movimento con tensione costante del cavo invece del bilanciere libero.', true),
('bicipiti-curl-panca-inclinata', 'bicipiti-preacher-curl', true, 'full_gym', 'equivalent', 1, 'Stesso principio (braccio fisso in appoggio, isolamento stretto), attrezzatura diversa.', true),
('bicipiti-preacher-curl', 'bicipiti-curl-panca-inclinata', true, 'home_basic', 'equivalent', 1, 'Stesso principio, direzione inversa.', true),

-- Tricipiti
('tricipiti-pushdown-cavo', 'tricipiti-french-press', false, 'full_gym', 'equivalent', 3, 'Stesso gruppo muscolare (tricipiti), schema di movimento diverso (spinta al cavo verso il basso vs estensione sopra la testa): buona variante per stimolo diverso sul capo lungo del tricipite.', true),
('tricipiti-french-press', 'tricipiti-estensioni-sopra-testa', true, 'home_basic', 'equivalent', 2, 'Stesso schema (estensione sopra la testa), attrezzatura diversa.', true),
('tricipiti-estensioni-sopra-testa', 'tricipiti-french-press', true, 'full_gym', 'equivalent', 2, 'Stesso schema, direzione inversa.', true),
('tricipiti-pushdown-cavo', 'tricipiti-kickback', false, 'home_basic', 'easier', 3, 'Stesso gruppo muscolare, schema diverso (estensione al cavo vs kickback con manubrio): fallback quando il cavo non e'' disponibile.', true),
('tricipiti-dip-tricipiti', 'petto-dips-petto', false, 'full_gym', 'equivalent', 3, 'Stesso esercizio fisico, enfasi muscolare diversa — vedi nota sulla coppia inversa.', true),

-- Squat / leg press
('gambe-squat', 'gambe-front-squat', true, 'full_gym', 'harder', 3, 'Stesso schema (squat), l''appoggio frontale del bilanciere richiede piu'' mobilita''/controllo del core: variante piu'' avanzata.', true),
('gambe-front-squat', 'gambe-squat', true, 'full_gym', 'easier', 3, 'Stesso schema, direzione inversa (variante piu'' accessibile).', true),
('gambe-squat', 'gambe-hack-squat', true, 'full_gym', 'easier', 2, 'Stesso schema (squat) su macchina guidata: schiena supportata, tecnicamente piu'' semplice.', true),
('gambe-hack-squat', 'gambe-leg-press', true, 'full_gym', 'equivalent', 2, 'Stesso schema (squat) su macchina, angolazione e appoggio diversi.', true),
('gambe-leg-press', 'gambe-leg-press-45', true, 'full_gym', 'equivalent', 1, 'Stessa macchina, differenza minima di angolazione (vedi nota di classificazione).', true),
('gambe-leg-press-45', 'gambe-leg-press', true, 'full_gym', 'equivalent', 1, 'Stessa macchina, direzione inversa.', true),
('gambe-squat', 'glutei-squat-sumo', true, 'home_basic', 'equivalent', 3, 'Stesso schema (squat), stance piu'' ampia con enfasi maggiore su glutei/adduttori: buona variante di focus.', true),

-- Affondi/lunge
('gambe-affondi', 'gambe-bulgarian-split-squat', true, 'home_basic', 'harder', 3, 'Stesso schema (affondo unilaterale), il piede posteriore rialzato aumenta la richiesta di equilibrio e carico sulla gamba anteriore.', true),
('gambe-bulgarian-split-squat', 'gambe-affondi', true, 'bodyweight_only', 'easier', 3, 'Stesso schema, direzione inversa (variante piu'' accessibile).', true),
('gambe-affondi', 'gambe-step-up', true, 'home_basic', 'equivalent', 2, 'Stesso schema unilaterale, movimento di salita invece che di affondo.', true),
('gambe-affondi', 'glutei-affondi-posteriori', true, 'bodyweight_only', 'equivalent', 2, 'Stesso schema unilaterale, direzione del passo invertita (indietro invece che avanti/in camminata).', true),

-- Hinge
('gambe-stacco-rumeno', 'femorali-good-morning', true, 'full_gym', 'harder', 2, 'Stesso schema (hinge, focus femorali/glutei), il bilanciere sulle spalle invece che nelle mani cambia il braccio di leva e richiede piu'' controllo lombare.', true),
('femorali-good-morning', 'gambe-stacco-rumeno', true, 'full_gym', 'easier', 2, 'Stesso schema, direzione inversa.', true),
('gambe-stacco-rumeno', 'femorali-hip-hinge', true, 'bodyweight_only', 'easier', 4, 'Stesso schema di movimento senza carico: regressione per apprendere/consolidare il pattern dopo una pausa lunga.', true),
('gambe-hip-thrust', 'glutei-glute-bridge', true, 'bodyweight_only', 'easier', 2, 'Stesso schema (hinge, estensione dell''anca), senza bilanciere: variante piu'' accessibile.', true),
('glutei-glute-bridge', 'gambe-hip-thrust', true, 'full_gym', 'harder', 2, 'Stesso schema, direzione inversa (aggiunta di carico e maggiore range con schiena appoggiata alla panca).', true),

-- Leg curl / leg extension
('femorali-leg-curl-sdraiato', 'femorali-leg-curl-seduto', true, 'full_gym', 'equivalent', 1, 'Stesso movimento di isolamento (flessione ginocchio), posizione del corpo diversa.', true),
('femorali-leg-curl-seduto', 'femorali-leg-curl-sdraiato', true, 'full_gym', 'equivalent', 1, 'Stesso movimento, direzione inversa.', true),
('femorali-leg-curl-sdraiato', 'gambe-leg-curl', true, 'full_gym', 'equivalent', 1, 'Stesso movimento: gambe-leg-curl e'' la voce storica ambigua che descrive entrambe le varianti (vedi nota di classificazione).', true),
('femorali-leg-curl-sdraiato', 'femorali-nordic-curl', true, 'bodyweight_only', 'harder', 4, 'Stesso gruppo muscolare e schema di flessione del ginocchio in versione eccentrica a corpo libero: variante avanzata, non un fallback per principianti.', true),

-- Calf raise
('gambe-calf-raise', 'polpacci-calf-raise-seduto', true, 'full_gym', 'equivalent', 2, 'Stesso movimento (sollevamento sui polpacci), ginocchio esteso vs flesso: enfasi leggermente diversa tra gastrocnemio e soleo.', true),
('polpacci-calf-raise-seduto', 'gambe-calf-raise', true, 'home_basic', 'equivalent', 2, 'Stesso movimento, direzione inversa.', true),
('polpacci-calf-raise-seduto', 'polpacci-calf-press-leg-press', true, 'full_gym', 'equivalent', 1, 'Stessa meccanica (ginocchio flesso, estensione di caviglia), macchina diversa.', true),
('gambe-calf-raise', 'polpacci-calf-raise-monopodalico', true, 'bodyweight_only', 'harder', 3, 'Stesso movimento in versione monopodalica: piu'' impegnativo per equilibrio e carico relativo.', true),

-- Core flessione
('core-crunch', 'core-cable-crunch', true, 'full_gym', 'harder', 2, 'Stesso movimento (flessione del busto), tensione aggiuntiva del cavo.', true),
('core-cable-crunch', 'core-crunch', true, 'bodyweight_only', 'easier', 2, 'Stesso movimento, direzione inversa (variante a corpo libero).', true),
('core-crunch', 'core-reverse-crunch', false, 'bodyweight_only', 'equivalent', 3, 'Stesso gruppo muscolare (addome), direzione del movimento invertita (bacino verso il busto invece del busto verso il bacino): buona variante di stimolo.', true),

-- Core anti-estensione/stabilita'
('core-plank', 'core-hollow-hold', true, 'bodyweight_only', 'harder', 2, 'Stessa famiglia di tenuta anti-estensione, la hollow hold richiede piu'' controllo su tutto il corpo esteso.', true),
('core-hollow-hold', 'core-plank', true, 'bodyweight_only', 'easier', 2, 'Stessa famiglia, direzione inversa.', true),
('core-plank', 'core-dead-bug', true, 'bodyweight_only', 'easier', 3, 'Stessa famiglia (stabilita'' anti-estensione), il dead bug e'' piu'' controllabile per chi fatica a mantenere il plank isometrico.', true),

-- Core rotazione/anti-rotazione
('core-russian-twist', 'core-pallof-press', false, 'home_basic', 'equivalent', 3, 'Stesso gruppo muscolare (obliqui), direzione opposta del lavoro (rotazione attiva vs resistenza alla rotazione): buona variante per chi ha bisogno di lavoro anti-rotazione invece che rotatorio.', true),
('core-pallof-press', 'core-side-plank', true, 'bodyweight_only', 'equivalent', 2, 'Stessa famiglia di stabilita'' del tronco (obliqui), un carico esterno vs il solo peso corporeo.', true),

-- Lombari
('lombari-hyperextension', 'lombari-superman-controllato', true, 'bodyweight_only', 'easier', 2, 'Stesso schema (estensione del busto), senza panca romana: variante accessibile ovunque.', true),
('lombari-superman-controllato', 'lombari-hyperextension', true, 'full_gym', 'harder', 2, 'Stesso schema, direzione inversa (aggiunta di range/leva con la panca romana).', true),

-- Cardio
('cardio-tapis-roulant', 'cardio-cyclette', true, 'full_gym', 'equivalent', 2, 'Stesso obiettivo cardiovascolare steady-state, minore impatto articolare sulla cyclette.', true),
('cardio-tapis-roulant', 'cardio-ellittica', true, 'full_gym', 'equivalent', 2, 'Stesso obiettivo cardiovascolare, basso impatto sull''ellittica.', true),
('cardio-cyclette', 'cardio-vogatore', true, 'full_gym', 'equivalent', 3, 'Stesso obiettivo cardiovascolare, il vogatore coinvolge anche il treno superiore.', true),
('cardio-burpees', 'cardio-jumping-jack', true, 'bodyweight_only', 'easier', 2, 'Stesso obiettivo (cardio HIIT a corpo libero), intensita'' articolare/di carico inferiore.', true),
('cardio-jumping-jack', 'cardio-burpees', true, 'bodyweight_only', 'harder', 2, 'Stesso obiettivo, direzione inversa (maggiore intensita'').', true),
('cardio-salto-corda', 'cardio-jumping-jack', true, 'bodyweight_only', 'easier', 2, 'Stesso pattern di salto ritmico, nessuna attrezzatura necessaria.', true),

-- Mobilita'/stretching
('mobilita-anche', 'mobilita-caviglie', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria di mobilita'' generale, distretto articolare diverso: da preferire solo come varieta'', non come sostituzione mirata.', true),
('mobilita-spalle', 'mobilita-rotazioni-toraciche', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (mobilita'' treno superiore), distretto diverso.', true),
('stretching-femorali', 'stretching-quadricipiti', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (stretching statico), distretto diverso — da preferire solo come varieta''.', true)

on conflict (source_exercise_id, alternative_exercise_id) do update set
  movement_pattern_match = excluded.movement_pattern_match,
  equipment_tag = excluded.equipment_tag,
  relative_difficulty = excluded.relative_difficulty,
  priority = excluded.priority,
  reason = excluded.reason,
  is_active = excluded.is_active,
  updated_at = now();

notify pgrst, 'reload schema';
