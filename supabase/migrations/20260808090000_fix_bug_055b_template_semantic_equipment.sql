-- fix: riapertura BUG-055 — correzione semantica di 2 sostituzioni del fix

create or replace function pg_temp._legacy_wte_selector(p_template_name text, p_day_name text, p_position integer)
returns uuid language plpgsql as $$
declare v_count integer; v_id uuid;
begin
  select count(*) into v_count from public.workout_template_exercises wte join public.workout_template_days wtd on wtd.id = wte.template_day_id join public.workout_templates wt on wt.id = wtd.template_id where wt.name=p_template_name and wtd.name=p_day_name and wte.exercise_order=p_position;
  select wte.id into v_id from public.workout_template_exercises wte join public.workout_template_days wtd on wtd.id=wte.template_day_id join public.workout_templates wt on wt.id=wtd.template_id where wt.name=p_template_name and wtd.name=p_day_name and wte.exercise_order=p_position order by wte.id limit 1;
  if v_count <> 1 then raise exception 'BUG_055B_SELECTOR_MISMATCH: template %, giorno %, posizione % ha cardinalita %',p_template_name,p_day_name,p_position,v_count; end if;
  return v_id;
end $$;
-- precedente (20260807090000) risultate incompatibili a un controllo più
-- rigoroso, più una terza incompatibilità pre-esistente mai notata prima
-- (stesso identico difetto di validazione, non un nuovo bug indipendente).
--
-- CAUSA DEL FALSO PASS (18/18) DEL FIX PRECEDENTE:
--
-- 1) Il controllo di compatibilità attrezzatura confrontava solo il tag
--    grezzo a 3 livelli (bodyweight_only/home_basic/full_gym) con la
--    location del template, mai il testo dichiarato dell'attrezzatura
--    dell'esercizio nel catalogo (mobile/src/data/exercise-library.ts,
--    campo `equipment`). Per il template "Corpo Libero" (equipment
--    dichiarato: "Corpo libero, sbarra opzionale per il dorso") questo ha
--    lasciato passare due esercizi il cui testo NON offre mai un'alternativa
--    a corpo libero: `dorso-rematore-manubrio` ("Manubrio, panca" — manubrio
--    sempre necessario) e `glutei-squat-sumo` ("Bilanciere o manubrio" —
--    nessuna opzione a corpo libero, introdotto proprio dal fix precedente
--    con lo stesso errore). Per confronto, altri esercizi bodyweight_only
--    dello stesso template (es. `gambe-affondi`: "a corpo libero o con
--    manubri") offrono esplicitamente l'opzione a corpo libero nel testo:
--    quelli restano corretti, non toccati qui. Anche
--    `tricipiti-dip-tricipiti` è stato riesaminato con lo stesso criterio:
--    il suo testo ("Parallele O panca") offre già un'alternativa a bassa
--    attrezzatura (qualunque sedia/panca stabile di casa, coerente con la
--    nota già scritta nella riga del template "Su sedia o panca stabile")
--    — NON è un'incompatibilità, non viene toccato.
--
-- 2) La sostituzione in "Tecnica dei Fondamentali" (gambe-stacco-rumeno →
--    gambe-hip-thrust) aveva verificato solo l'uguaglianza di
--    `movement_pattern` ('hinge' per entrambi), mai `substitution_group` —
--    il campo più preciso già presente nei dati: `gambe-stacco-rumeno`
--    appartiene a `hinge_hamstring_barbell` (vero hip-hinge: il busto si
--    inclina, il bacino arretra, i femorali si allungano sotto carico),
--    mentre `gambe-hip-thrust` appartiene a `hinge_glute_extension`
--    (estensione d'anca a busto fisso, funzione diversa) — la distinzione
--    era già presente nei dati del sotto-blocco 2.2, mai controllata da
--    questa sostituzione. Il giorno "Focus Stacco e Press" richiede di
--    insegnare proprio il pattern hip-hinge: la sostituzione non lo faceva.
--
-- NUOVA REGOLA DI VALIDAZIONE (usata per la riverifica dei 18 template,
-- vedi report): un esercizio è equipaggiamento-compatibile con un template
-- a corpo libero solo se il suo testo `equipment` nel catalogo offre
-- esplicitamente un'alternativa a corpo libero/bassa attrezzatura
-- domestica (non basta il tag equipment_tag grezzo); una sostituzione di un
-- esercizio `role='primary'` deve preservare `substitution_group`, non solo
-- `movement_pattern`.
--
-- 3 nuovi esercizi di catalogo aggiunti (mobile/src/data/exercise-library.ts,
-- COVERAGE_EXERCISES), con relativi metadati e alternative qui sotto:
--   - gambe-air-squat (squat a corpo libero, sostituisce glutei-squat-sumo
--     in "Corpo Libero")
--   - dorso-rematore-corpo-libero (rematore/inverted row a corpo libero,
--     sostituisce dorso-rematore-manubrio in "Corpo Libero")
--   - gambe-stacco-rumeno-manubri (stacco rumeno con manubri leggeri,
--     sostituisce gambe-hip-thrust in "Tecnica dei Fondamentali" E
--     femorali-hip-hinge in "Manubri ed Elastici" — preserva
--     substitution_group='hinge_hamstring_barbell' in entrambi i casi,
--     a differenza della regressione a corpo libero usata dal fix
--     precedente per "Manubri ed Elastici", ora sostituita da questa
--     variante più coerente con un template a manubri).
--
-- Nota: nessun video locale registrato per questi 3 id (videoStatus
-- risulterà 'missing', comportamento già gestito dal codice esistente,
-- coerente con molti altri esercizi del catalogo "coverage").

-- === 1. Nuovi metadati esercizio ==========================================

insert into public.exercise_movement_metadata (
  exercise_id, movement_pattern, primary_muscle_group, secondary_muscle_groups,
  equipment_tag, compatible_locations, min_level, role, is_unilateral,
  movement_class, eligible_for_substitution, substitution_group,
  contraindications, is_pain_sensitive_default, is_active, metadata_version,
  classification_note
) values
(
  'gambe-air-squat', 'squat', 'quadricipiti', array['glutei']::text[],
  'bodyweight_only', array['gym','home']::text[], 'beginner', 'primary', false,
  'compound', true, 'squat_barbell_quad',
  array[]::text[], false, true, 1,
  'Versione a corpo libero dello stesso schema di movimento (squat bilaterale, dominanza quadricipiti) di gambe-squat/gambe-front-squat; stesso substitution_group per segnalare la stessa famiglia di movimento a carico diverso, coerente con la convenzione già usata per femorali-hip-hinge/gambe-stacco-rumeno.'
),
(
  'dorso-rematore-corpo-libero', 'horizontal_pull', 'dorsali', array['bicipiti']::text[],
  'home_basic', array['gym','home']::text[], 'beginner', 'secondary', false,
  'compound', true, 'row_horizontal_dorsali',
  array[]::text[], false, true, 1,
  'Ammesso nel template "Corpo Libero" perché richiede solo una sbarra bassa/appoggio stabile, coerente con l''attrezzatura dichiarata ("sbarra opzionale per il dorso"); stesso schema di movimento (trazione orizzontale) e stesso substitution_group delle varianti caricate con manubrio/bilanciere/macchina.'
),
(
  'gambe-stacco-rumeno-manubri', 'hinge', 'femorali', array['glutei','lombari']::text[],
  'home_basic', array['gym','home']::text[], 'beginner', 'primary', false,
  'compound', true, 'hinge_hamstring_barbell',
  array[]::text[], false, true, 1,
  'Progressione a carico leggero (manubri) dello stesso schema hip-hinge di gambe-stacco-rumeno/femorali-good-morning, adatta a un principiante prima del bilanciere; preserva lo schema di movimento e il substitution_group, a differenza di gambe-hip-thrust (substitution_group "hinge_glute_extension": estensione d''anca a busto fisso, non hip hinge — causa del falso PASS corretta da questa migrazione).'
)
on conflict (exercise_id) do nothing;

-- === 2. Correzione delle 4 righe (precondizione esplicita su ognuna) ======

do $$
declare
  v_count integer;
begin
  -- Corpo Libero — Workout B, posizione 1: glutei-squat-sumo -> gambe-air-squat
  update public.workout_template_exercises
  set exercise_id = 'gambe-air-squat',
      notes = 'Squat a corpo libero: ginocchia in linea con le punte dei piedi, schiena neutra, scendere fino a cosce parallele o quanto la mobilità consente.'
  where id = pg_temp._legacy_wte_selector('Corpo Libero','Workout B',1)
    and exercise_id = 'glutei-squat-sumo'
    and sets = 3 and reps = 15 and reps_min = 12 and reps_max = 15 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055B_MISMATCH: riga Corpo Libero/Workout B pos.1 non nello stato atteso (glutei-squat-sumo, 3x15 12-15, rest 60) — verificare prima di procedere.';
  end if;

  -- Corpo Libero — Workout B, posizione 2: dorso-rematore-manubrio -> dorso-rematore-corpo-libero
  update public.workout_template_exercises
  set exercise_id = 'dorso-rematore-corpo-libero',
      notes = 'Rematore a corpo libero in appoggio su una sbarra bassa, un tavolo robusto o anelli di sospensione: corpo in linea, tirare il petto verso il punto di appoggio; avvicinare i piedi al punto di appoggio per aumentare la difficoltà, allontanarli per ridurla.'
  where id = pg_temp._legacy_wte_selector('Corpo Libero','Workout B',2)
    and exercise_id = 'dorso-rematore-manubrio'
    and sets = 3 and reps = 12 and reps_min = 10 and reps_max = 12 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055B_MISMATCH: riga Corpo Libero/Workout B pos.2 non nello stato atteso (dorso-rematore-manubrio, 3x12 10-12, rest 60) — verificare prima di procedere.';
  end if;

  -- Manubri ed Elastici — Lower A, posizione 2: femorali-hip-hinge -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      sets = 3, reps = 12, reps_min = 10, reps_max = 12, rest_seconds = 75, rpe_rir = 'RIR 2-3',
      notes = 'Stacco rumeno con manubri: schiena neutra, bacino che si sposta indietro, manubri vicini alle gambe, ginocchia con flessione minima e costante.'
  where id = pg_temp._legacy_wte_selector('Manubri ed Elastici','Lower A',2)
    and exercise_id = 'femorali-hip-hinge'
    and sets = 4 and reps = 15 and reps_min = 12 and reps_max = 18 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055B_MISMATCH: riga Manubri ed Elastici/Lower A pos.2 non nello stato atteso (femorali-hip-hinge, 4x15 12-18, rest 60) — verificare prima di procedere.';
  end if;

  -- Tecnica dei Fondamentali — Focus Stacco e Press, posizione 2: gambe-hip-thrust -> gambe-stacco-rumeno-manubri
  update public.workout_template_exercises
  set exercise_id = 'gambe-stacco-rumeno-manubri',
      notes = 'Stacco rumeno con manubri leggeri: schiena neutra, bacino indietro, manubri vicini alle gambe, ginocchia con flessione minima e costante — stessa tecnica dello stacco a bilanciere ma con carico più gestibile per un principiante.'
  where id = pg_temp._legacy_wte_selector('Tecnica dei Fondamentali','Focus Stacco e Press',2)
    and exercise_id = 'gambe-hip-thrust'
    and sets = 3 and reps = 10 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055B_MISMATCH: riga Tecnica dei Fondamentali/Focus Stacco e Press pos.2 non nello stato atteso (gambe-hip-thrust, 3x10, rest 75) — verificare prima di procedere.';
  end if;
end $$;

-- Verifica esplicita di non-regressione su una riga adiacente NON toccata
-- (Corpo Libero, Workout A, posizione 1: gambe-affondi, mai modificata da
-- nessuno dei due fix BUG-055).
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.workout_template_exercises
  where id = pg_temp._legacy_wte_selector('Tecnica dei Fondamentali','Focus Squat',2)
    and exercise_id = 'gambe-squat';
  if v_count <> 1 then
    raise exception 'BUG_055B_UNEXPECTED_CHANGE: la riga Tecnica dei Fondamentali/Focus Squat (non oggetto di questa correzione) risulta modificata rispetto all''atteso.';
  end if;
end $$;

-- === 3. Alternative per i 3 nuovi esercizi + correzione testo obsoleto ====
-- (le 2 righe seguenti erano state inserite dal fix precedente con un
-- `reason` che citava esplicitamente la scelta di sostituzione di quel fix,
-- ora superata da questa correzione: il testo viene generalizzato, la
-- relazione resta valida come alternativa a se' stante)

update public.exercise_alternatives
set reason = 'Stesso gruppo muscolare (dorsali), schema di movimento diverso (tirata verticale vs orizzontale): fallback quando non è disponibile una sbarra per trazioni.'
where source_exercise_id = 'dorso-trazioni' and alternative_exercise_id = 'dorso-rematore-manubrio';

update public.exercise_alternatives
set reason = 'Stesso schema (hinge, catena posteriore), meno tecnico e meno rischioso sulla zona lombare: regressione utile per un principiante prima di caricare il bilanciere.'
where source_exercise_id = 'gambe-stacco-rumeno' and alternative_exercise_id = 'gambe-hip-thrust';

insert into public.exercise_alternatives (
  source_exercise_id, alternative_exercise_id, movement_pattern_match, equipment_tag,
  relative_difficulty, priority, reason, is_active
) values
('gambe-squat', 'gambe-air-squat', true, 'bodyweight_only', 'easier', 4,
 'Stessa famiglia di movimento (squat bilaterale) a corpo libero: regressione per chi non ha accesso a bilanciere/rack o si allena a casa.', true),
('gambe-air-squat', 'glutei-squat-sumo', true, 'home_basic', 'harder', 2,
 'Stesso schema di movimento con carico aggiuntivo (bilanciere o manubrio) e stance più ampia: progressione naturale una volta acquisita fiducia col peso corporeo.', true),
('dorso-rematore-manubrio', 'dorso-rematore-corpo-libero', true, 'home_basic', 'easier', 3,
 'Stesso schema di movimento (trazione orizzontale) a corpo libero: fallback quando non sono disponibili manubri.', true),
('dorso-rematore-corpo-libero', 'dorso-rematore-manubrio', true, 'home_basic', 'harder', 2,
 'Stesso schema di movimento con carico aggiuntivo (manubrio): progressione naturale una volta disponibile l''attrezzo.', true),
('gambe-stacco-rumeno', 'gambe-stacco-rumeno-manubri', true, 'home_basic', 'easier', 2,
 'Stesso schema hip-hinge con carico più leggero e gestibile (manubri): regressione tecnica prima del bilanciere, o alternativa quando sono disponibili solo manubri.', true),
('gambe-stacco-rumeno-manubri', 'gambe-stacco-rumeno', true, 'full_gym', 'harder', 2,
 'Stesso schema hip-hinge con carico maggiore (bilanciere): progressione naturale una volta consolidata la tecnica.', true),
('femorali-hip-hinge', 'gambe-stacco-rumeno-manubri', true, 'home_basic', 'harder', 1,
 'Stesso schema hip-hinge, primo carico esterno (manubri leggeri) dopo il drill senza carico: progressione naturale all''interno della stessa sessione tecnica.', true)
on conflict (source_exercise_id, alternative_exercise_id) do update set
  movement_pattern_match = excluded.movement_pattern_match,
  equipment_tag = excluded.equipment_tag,
  relative_difficulty = excluded.relative_difficulty,
  priority = excluded.priority,
  reason = excluded.reason,
  is_active = excluded.is_active;

notify pgrst, 'reload schema';
