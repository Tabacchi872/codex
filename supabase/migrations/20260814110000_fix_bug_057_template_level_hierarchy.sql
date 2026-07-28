-- fix: BUG-057 — applica la regola ordinale definitiva dei livelli
-- (beginner=1/intermediate=2/advanced=3, exercise.min_level <= template.level)
-- a tutti i 18 template auto_eligible, non solo alla singola riga corretta
-- in BUG-056. Rivalidando con la regola letterale (non la regola operativa
-- più permissiva usata durante 2.2/BUG-055/BUG-055b, "solo advanced in
-- Principiante") emergono 11 template con 26 righe incompatibili — non 12
-- come stimato in BUGS.md al momento dell'apertura di BUG-057: quella stima
-- ("12 template") escludeva "Corpo Libero" perché il fix di BUG-055b lo
-- aveva già validato PASS, ma con la regola più permissiva di allora (solo
-- "nessun advanced in Principiante") — con la regola letterale odierna,
-- "Corpo Libero" (Principiante) contiene 2 esercizi 'intermediate'
-- (gambe-affondi, tricipiti-dip-tricipiti), quindi FALLISCE anch'esso.
-- Nessun livello esercizio abbassato artificialmente, nessun livello
-- template alzato, nessuna scheda cliente già assegnata toccata (i
-- template sono copiati per valore in workout_plans al momento
-- dell'assegnazione, zero FK verso le schede reali — stessa garanzia già
-- verificata per BUG-055).
--
-- 2 nuovi esercizi di catalogo aggiunti (mobile/src/data/exercise-library.ts,
-- COVERAGE_EXERCISES), nessuna alternativa esistente soddisfaceva
-- contemporaneamente livello/attrezzatura/ruolo richiesti:
--   - spalle-shoulder-press-macchina (beginner, full_gym, ruolo primary,
--     stesso substitution_group 'ohp_shoulder' di spalle-military-press/
--     spalle-shoulder-press): nessuna spinta verticale spalle a ruolo
--     primary esiste sotto 'intermediate' nel catalogo attuale.
--   - tricipiti-dip-ginocchia-piegate (beginner, home_basic, stesso
--     substitution_group 'dip_vertical_push' di tricipiti-dip-tricipiti,
--     stessa attrezzatura testuale "sedia o panca stabile"): nessuna
--     alternativa tricipiti sotto 'intermediate' offre nel testo
--     un'alternativa a corpo libero/bassa attrezzatura domestica coerente
--     con "Corpo Libero" (le uniche due opzioni beginner esistenti,
--     tricipiti-estensioni-sopra-testa/tricipiti-kickback, richiedono
--     sempre un manubrio nel testo — stesso identico difetto già
--     individuato e corretto da BUG-055b per altri esercizi).
--
-- Ogni altra sostituzione riusa un esercizio GIA' esistente nello stesso
-- substitution_group (quando disponibile a un livello idoneo) o nello
-- stesso ruolo/gruppo muscolare/pattern di movimento, verificato riga per
-- riga anche per conflitti di duplicato esercizio nello stesso giorno
-- (un caso trovato: "Upper/Lower + Conditioning"/"Upper B" già conteneva
-- cardio-battle-rope in un'altra posizione dello stesso giorno — usato
-- cardio-salto-corda al suo posto, stesso substitution_group
-- 'cardio_hiit_functional', stesso livello 'intermediate').
--
-- sets/reps/reps_min/reps_max/rest_seconds NON modificati per nessuna
-- riga (volume/difficoltà prescritti restano identici, come richiesto):
-- solo exercise_id e notes cambiano, per riflettere il nuovo esercizio.

-- === 1. Nuovi metadati esercizio ==========================================

insert into public.exercise_movement_metadata (
  exercise_id, movement_pattern, primary_muscle_group, secondary_muscle_groups,
  equipment_tag, compatible_locations, min_level, role, is_unilateral,
  movement_class, eligible_for_substitution, substitution_group,
  contraindications, is_pain_sensitive_default, is_active, metadata_version,
  classification_note
) values
(
  'spalle-shoulder-press-macchina', 'vertical_push', 'spalle', array['tricipiti']::text[],
  'full_gym', array['gym']::text[], 'beginner', 'primary', false,
  'compound', true, 'ohp_shoulder',
  array[]::text[], false, true, 1,
  'Variante guidata su macchina dello stesso schema di spinta verticale di spalle-shoulder-press/spalle-military-press: traiettoria fissata dalla macchina, più sicura e accessibile per un principiante rispetto a bilanciere/manubri liberi. Nessuna alternativa a ruolo primary esisteva sotto il livello intermediate in questo substitution_group.'
),
(
  'tricipiti-dip-ginocchia-piegate', 'vertical_push', 'tricipiti', array['petto','spalle']::text[],
  'home_basic', array['gym','home']::text[], 'beginner', 'secondary', false,
  'compound', true, 'dip_vertical_push',
  array[]::text[], false, true, 1,
  'Regressione del dip su sedia/panca (tricipiti-dip-tricipiti): ginocchia piegate e piedi vicini al corpo riducono il peso corporeo sostenuto dalle braccia, stessa identica attrezzatura testuale ("sedia o panca stabile") e stesso substitution_group. Nessuna delle due alternative beginner esistenti (tricipiti-estensioni-sopra-testa, tricipiti-kickback) offre un''opzione priva di manubrio, necessaria per un template dichiarato "a corpo libero".'
)
on conflict (exercise_id) do nothing;

-- === 2. Correzione delle 26 righe (precondizione esplicita su ognuna) =====

do $$
declare
  v_count integer;
begin
  -- Corpo Libero / Workout A: gambe-affondi -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: ginocchia in linea con le punte dei piedi, schiena neutra, scendere fino a cosce parallele o quanto la mobilità consente.'
  where id = '7423cac0-a598-489f-af75-f4ebde2d2b86'
    and exercise_id = 'gambe-affondi' and sets = 3 and reps = 14 and reps_min = 12 and reps_max = 15 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Corpo Libero/Workout A pos.1'; end if;

  -- Corpo Libero / Workout C: tricipiti-dip-tricipiti -> tricipiti-dip-ginocchia-piegate
  update public.workout_template_exercises
  set exercise_id = 'tricipiti-dip-ginocchia-piegate',
      notes = 'Dip su sedia con ginocchia piegate e piedi vicini al corpo: busto il più verticale possibile, gomiti che puntano indietro. Avvicinare ulteriormente i piedi o distendere le gambe quando pronti per aumentare la difficoltà.'
  where id = '543d2172-b253-44e1-9f41-dea7273da604'
    and exercise_id = 'tricipiti-dip-tricipiti' and sets = 3 and reps = 12 and reps_min = 10 and reps_max = 15 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Corpo Libero/Workout C pos.2'; end if;

  -- Dimagrimento Principiante / Workout B: gambe-affondi -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: ginocchia in linea con le punte dei piedi, schiena neutra, ritmo sostenuto per lo stimolo metabolico.'
  where id = 'ba403ee2-ba9c-48e0-ba30-86e44ff6512f'
    and exercise_id = 'gambe-affondi' and sets = 2 and reps = 12 and reps_min is null and reps_max is null and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Dimagrimento Principiante/Workout B pos.4'; end if;

  -- Forza Base 5x5 / Workout A: dorso-rematore-bilanciere -> dorso-pulley-basso
  update public.workout_template_exercises
  set exercise_id = 'dorso-pulley-basso',
      notes = 'Trazione al pulley basso: scapole attive, tirare verso l addome, evitare rimbalzi.'
  where id = '33f4aaa4-48e6-4602-a4eb-5aa6e23efc9e'
    and exercise_id = 'dorso-rematore-bilanciere' and sets = 5 and reps = 5 and reps_min = 5 and reps_max = 5 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Forza Base 5x5/Workout A pos.3'; end if;

  -- Forza Base 5x5 / Workout B pos.1: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra per tutta l esecuzione, manubri vicini alle gambe.'
  where id = 'b69c497f-d070-42d7-b65c-12c360deec7e'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 5 and reps = 5 and reps_min = 5 and reps_max = 5 and rest_seconds = 150;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Forza Base 5x5/Workout B pos.1'; end if;

  -- Forza Base 5x5 / Workout B pos.2: spalle-military-press -> spalle-shoulder-press
  update public.workout_template_exercises
  set exercise_id = 'spalle-shoulder-press',
      notes = 'Spinta sopra la testa con manubri, seduti o in piedi: traiettoria verticale, core attivo.'
  where id = '6d4e8b96-644c-44b1-9e0b-f3bdc2c0e143'
    and exercise_id = 'spalle-military-press' and sets = 5 and reps = 5 and reps_min = 5 and reps_max = 5 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Forza Base 5x5/Workout B pos.2'; end if;

  -- Forza Base 5x5 / Workout C: gambe-front-squat -> gambe-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-squat',
      notes = 'Squat con bilanciere: con bilanciere vuoto o carico leggero, tecnica prima di tutto.'
  where id = 'c56e0758-7332-4d57-a405-8fcd0ea5c089'
    and exercise_id = 'gambe-front-squat' and sets = 5 and reps = 5 and reps_min = 5 and reps_max = 5 and rest_seconds = 150;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Forza Base 5x5/Workout C pos.1'; end if;

  -- Forza e Resistenza / Forza B: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra per tutta l esecuzione, manubri vicini alle gambe.'
  where id = 'f23f5495-52fc-40ca-8658-ea5d206e2a1e'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 3 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Forza e Resistenza/Forza B pos.2'; end if;

  -- Full Body Metabolico / Workout B: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra, manubri vicini alle gambe.'
  where id = '66674f8a-d718-45f2-a64c-43a16e389b06'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 3 and reps = 12 and reps_min = 10 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Full Body Metabolico/Workout B pos.1'; end if;

  -- Full Body Metabolico / Workout C: cardio-burpees -> cardio-battle-rope
  update public.workout_template_exercises
  set exercise_id = 'cardio-battle-rope',
      notes = 'Battle rope: ondulazioni continue, ginocchia leggermente flesse, movimento generato dalle spalle, ritmo sostenuto.'
  where id = 'a928ab5e-030a-4790-976d-4f38c859448d'
    and exercise_id = 'cardio-burpees' and sets = 3 and reps = 1 and reps_min is null and reps_max is null and rest_seconds = 45;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Full Body Metabolico/Workout C pos.5'; end if;

  -- Inizio Palestra (3 giorni) / Workout A: gambe-squat -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: tecnica prima di tutto, scendere fino a cosce parallele o quanto la mobilità consente.'
  where id = 'aa2cc6d3-af0e-49e4-9f1e-af50014463c7'
    and exercise_id = 'gambe-squat' and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Inizio Palestra/Workout A pos.1'; end if;

  -- Inizio Palestra (3 giorni) / Workout B: spalle-shoulder-press -> spalle-shoulder-press-macchina
  update public.workout_template_exercises
  set exercise_id = 'spalle-shoulder-press-macchina',
      notes = 'Shoulder press su macchina guidata: schiena in appoggio, traiettoria fissata dalla macchina, non bloccare i gomiti in alto.'
  where id = '5c64953c-d7a5-4efe-b8e2-d2fbbfac4ba9'
    and exercise_id = 'spalle-shoulder-press' and sets = 3 and reps = 14 and reps_min = 12 and reps_max = 15 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Inizio Palestra/Workout B pos.3'; end if;

  -- Inizio Palestra (3 giorni) / Workout C pos.1: gambe-affondi -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: ginocchia in linea con le punte dei piedi, schiena neutra.'
  where id = 'c69a9e82-3625-4c5d-8279-a2149a640365'
    and exercise_id = 'gambe-affondi' and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Inizio Palestra/Workout C pos.1'; end if;

  -- Inizio Palestra (3 giorni) / Workout C pos.3: dorso-rematore-manubrio -> dorso-rematore-macchina
  update public.workout_template_exercises
  set exercise_id = 'dorso-rematore-macchina',
      notes = 'Trazione orizzontale su macchina guidata: petto in appoggio se previsto, scapole attive, ritmo controllato.'
  where id = 'fbd065a9-5437-4f6a-96e8-2607be224524'
    and exercise_id = 'dorso-rematore-manubrio' and sets = 3 and reps = 14 and reps_min = 12 and reps_max = 15 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Inizio Palestra/Workout C pos.3'; end if;

  -- Pesi e Cardio / Workout D: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra per tutta l esecuzione.'
  where id = '3fa84fd5-0fda-4d55-afe5-81af259a6cf5'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 4 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Pesi e Cardio/Workout D pos.1'; end if;

  -- Strength & Shape / Workout B: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra per tutta l esecuzione.'
  where id = 'fab1b9e5-bc25-42cd-b465-6601a468dc45'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 4 and reps = 7 and reps_min = 6 and reps_max = 8 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Strength & Shape/Workout B pos.1'; end if;

  -- Tecnica dei Fondamentali / Focus Squat: gambe-squat -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: focus sulla tecnica, scendere fino a cosce parallele o quanto la mobilità consente.'
  where id = '5c20c1d3-328d-4b29-bd92-042769081fb1'
    and exercise_id = 'gambe-squat' and sets = 4 and reps = 8 and reps_min is null and reps_max is null and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Tecnica dei Fondamentali/Focus Squat pos.2'; end if;

  -- Tecnica dei Fondamentali / Focus Panca e Trazione: petto-panca-piana -> petto-chest-press
  update public.workout_template_exercises
  set exercise_id = 'petto-chest-press',
      notes = 'Chest press su macchina guidata: focus sulla tecnica, scapole stabili.'
  where id = '8a00623a-235f-48dc-bfa6-6a700dfd6ca6'
    and exercise_id = 'petto-panca-piana' and sets = 4 and reps = 8 and reps_min is null and reps_max is null and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Tecnica dei Fondamentali/Focus Panca e Trazione pos.2'; end if;

  -- Tecnica dei Fondamentali / Focus Stacco e Press: spalle-shoulder-press -> spalle-shoulder-press-macchina
  update public.workout_template_exercises
  set exercise_id = 'spalle-shoulder-press-macchina',
      notes = 'Shoulder press su macchina guidata: schiena in appoggio, traiettoria fissata dalla macchina.'
  where id = 'a631cdf6-9889-4a25-8226-406cf31f5f49'
    and exercise_id = 'spalle-shoulder-press' and sets = 3 and reps = 12 and reps_min is null and reps_max is null and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Tecnica dei Fondamentali/Focus Stacco e Press pos.3'; end if;

  -- Upper/Lower + Conditioning / Lower A: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra per tutta l esecuzione.'
  where id = 'c5525a2c-9781-41b4-bbdf-5851dc858925'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 3 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower + Conditioning/Lower A pos.2'; end if;

  -- Upper/Lower + Conditioning / Upper B: cardio-burpees -> cardio-salto-corda (evita duplicato con cardio-battle-rope gia' presente nello stesso giorno)
  update public.workout_template_exercises
  set exercise_id = 'cardio-salto-corda',
      notes = 'Salto con la corda: ritmo sostenuto, tecnica prima della velocità.'
  where id = 'daccde6a-a2f7-4c16-bd93-30bfa204facc'
    and exercise_id = 'cardio-burpees' and sets = 3 and reps = 1 and reps_min is null and reps_max is null and rest_seconds = 30;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower + Conditioning/Upper B pos.5'; end if;

  -- Upper/Lower Ipertrofia / Lower A: gambe-stacco-rumeno -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri: schiena neutra, manubri vicini alle gambe.'
  where id = '57e5610d-b677-4455-9c9f-ac314ec2ef1b'
    and exercise_id = 'gambe-stacco-rumeno' and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower Ipertrofia/Lower A pos.2'; end if;

  -- Upper/Lower Ipertrofia / Upper B pos.2: dorso-rematore-bilanciere -> dorso-pulley-basso
  update public.workout_template_exercises
  set exercise_id = 'dorso-pulley-basso',
      notes = 'Trazione al pulley basso: busto stabile, scapole attive, tirare verso l addome.'
  where id = '4901e1ef-c6f6-4fd2-ad7d-330ac6fcc163'
    and exercise_id = 'dorso-rematore-bilanciere' and sets = 4 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower Ipertrofia/Upper B pos.2'; end if;

  -- Upper/Lower Ipertrofia / Upper B pos.3: spalle-military-press -> spalle-shoulder-press
  update public.workout_template_exercises
  set exercise_id = 'spalle-shoulder-press',
      notes = 'Spinta sopra la testa con manubri: traiettoria verticale, core attivo.'
  where id = '9e957f22-e479-48a3-93f0-27423848d4f1'
    and exercise_id = 'spalle-military-press' and sets = 3 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower Ipertrofia/Upper B pos.3'; end if;

  -- Upper/Lower Ipertrofia / Lower B pos.1: gambe-front-squat -> gambe-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-squat',
      notes = 'Squat con bilanciere: busto verticale, ginocchia in linea con i piedi.'
  where id = 'f535d05a-4660-40db-abf4-8f7d76501a13'
    and exercise_id = 'gambe-front-squat' and sets = 3 and reps = 9 and reps_min = 8 and reps_max = 10 and rest_seconds = 120;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower Ipertrofia/Lower B pos.1'; end if;

  -- Upper/Lower Ipertrofia / Lower B pos.3: gambe-bulgarian-split-squat -> gambe-affondi
  update public.workout_template_exercises
  set exercise_id = 'gambe-affondi',
      notes = 'Affondi: ginocchio anteriore sopra la caviglia, busto stabile, spinta dal piede avanti.'
  where id = '65491fca-28cb-4e20-add7-f38b8c9a5c51'
    and exercise_id = 'gambe-bulgarian-split-squat' and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'BUG_057_MISMATCH: Upper/Lower Ipertrofia/Lower B pos.3'; end if;
end $$;

-- === 3. Alternative per i 2 nuovi esercizi =================================

insert into public.exercise_alternatives (
  source_exercise_id, alternative_exercise_id, movement_pattern_match, equipment_tag,
  relative_difficulty, priority, reason, is_active
) values
('spalle-military-press', 'spalle-shoulder-press-macchina', true, 'full_gym', 'easier', 3,
 'Stesso schema di spinta verticale su macchina guidata, più sicura per un principiante: regressione prima del bilanciere libero.', true),
('spalle-shoulder-press', 'spalle-shoulder-press-macchina', true, 'full_gym', 'easier', 2,
 'Stesso schema di spinta verticale su macchina guidata invece che con manubri liberi: regressione tecnica per un principiante.', true),
('spalle-shoulder-press-macchina', 'spalle-shoulder-press', true, 'home_basic', 'harder', 2,
 'Stesso schema con manubri liberi: progressione naturale una volta acquisita fiducia col movimento guidato.', true),
('tricipiti-dip-tricipiti', 'tricipiti-dip-ginocchia-piegate', true, 'home_basic', 'easier', 2,
 'Stessa attrezzatura (sedia o panca stabile), ginocchia piegate per ridurre il peso corporeo sostenuto: regressione per un principiante.', true),
('tricipiti-dip-ginocchia-piegate', 'tricipiti-dip-tricipiti', true, 'home_basic', 'harder', 2,
 'Stessa attrezzatura, gambe distese per aumentare il peso corporeo sostenuto: progressione naturale una volta consolidata la tecnica.', true)
on conflict (source_exercise_id, alternative_exercise_id) do update set
  movement_pattern_match = excluded.movement_pattern_match,
  equipment_tag = excluded.equipment_tag,
  relative_difficulty = excluded.relative_difficulty,
  priority = excluded.priority,
  reason = excluded.reason,
  is_active = excluded.is_active;

notify pgrst, 'reload schema';
