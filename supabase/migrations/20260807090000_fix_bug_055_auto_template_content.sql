-- fix: BUG-055 — corregge il contenuto incompatibile dei 3 template
-- auto_eligible trovati durante il sotto-blocco 2.2 (Corpo Libero, Manubri
-- ed Elastici, Tecnica dei Fondamentali). Solo correzione dati Blocco 1
-- (workout_template_exercises) + 2 nuove relazioni exercise_alternatives
-- giustificate. Nessun motore di revisione, RPC, UI, modifica al sotto-
-- blocco 2.3.
--
-- REGOLA DI IMMUTABILITÀ — verificata prima di questa migration (read-only):
-- `workout_days.workout_plan_id` referenzia `workout_plans(id)`,
-- `workout_day_exercises.workout_day_id` referenzia `workout_days(id)` —
-- NESSUNA foreign key collega il contenuto di una scheda già assegnata
-- (workout_days/workout_day_exercises) a workout_template_days/
-- workout_template_exercises. `_copy_template_days_to_plans` (Blocco 1)
-- esegue una copia UNA TANTUM per valore al momento dell'assegnazione, mai
-- un riferimento vivo. Verificato inoltre che 0 workout_plans e 0
-- client_program_cycles derivano oggi da uno di questi 3 template
-- (template_id mai usato finora da alcun cliente reale). Correggere il
-- template SORGENTE in-place è quindi sicuro: nessuna scheda già assegnata
-- può cambiare, per costruzione dello schema, non solo per assenza di dati.
--
-- ANALISI PRELIMINARE (query read-only complete sui 3 template, contenuto
-- integrale con giorno/posizione/metadati — vedi anche
-- docs/BUG_055_TEMPLATE_FIX.md per la tabella prima/dopo completa):
--
-- 1) "Corpo Libero" (b6a45d88-a517-48c6-8510-26ed7285a1d7, Casa, Principiante,
--    equipment dichiarato "Corpo libero, sbarra opzionale per il dorso"):
--    - Workout B pos.1 (wte 1df6d2cd-7516-44e7-a9d1-666cb374dbe0): `gambe-squat`
--      (full_gym, bilanciere) — incompatibile con l'attrezzatura dichiarata.
--      Nessun esercizio "squat a corpo libero" esiste nel catalogo attuale
--      (ogni variante squat/leg-press richiede bilanciere o macchina):
--      sostituito con `glutei-squat-sumo` (home_basic, eseguibile anche a
--      corpo libero, stesso schema squat, stesso livello intermediate),
--      già presente come alternativa curata in exercise_alternatives (2.2).
--    - Workout B pos.2 (wte 44f2f186-6b54-481c-a8a9-59d397387fb6):
--      `dorso-trazioni` (livello advanced) — incompatibile col livello
--      Principiante dichiarato (l'attrezzatura era invece già coerente: la
--      sbarra è esplicitamente dichiarata come opzionale). La nota originale
--      dell'esercizio anticipava già questo esatto fallback ("Se non
--      disponibile una sbarra, sostituire con rematore usando uno zaino
--      pesante"): sostituito con `dorso-rematore-manubrio` (livello
--      intermediate, stesso gruppo muscolare dorsali, schema di movimento
--      orizzontale invece che verticale — nessuna alternativa verticale a
--      corpo libero/livello inferiore esiste nel catalogo).
--
-- 2) "Manubri ed Elastici" (6376a9e9-6add-4b77-b85d-00e97b7bd725, Casa,
--    Intermedio, equipment dichiarato "Manubri regolabili, elastici di
--    resistenza"):
--    - Lower A pos.2 (wte 11a09e8c-4a23-4ab2-875b-0393531f6e2b):
--      `gambe-stacco-rumeno` (full_gym, bilanciere) — incompatibile con
--      l'attrezzatura dichiarata, nonostante la nota template dicesse "Con
--      manubri" (nel catalogo non esiste una variante "stacco rumeno con
--      manubri" distinta). Nessuna alternativa hinge/femorali caricata a
--      home_basic esiste nel catalogo (le uniche due varianti caricate,
--      stacco-rumeno e good-morning, sono entrambe full_gym/advanced):
--      sostituito con `femorali-hip-hinge` (bodyweight_only, hinge,
--      femorali, già presente come alternativa curata "easier" in
--      exercise_alternatives). Ristrutturato con prudenza (non una
--      sostituzione diretta 1:1 di pari categoria, per assenza reale di
--      un'alternativa caricata home_basic): categoria primary->accessory,
--      volume aumentato (piu' ripetizioni, corpo libero) per compensare
--      l'assenza di carico esterno.
--
-- 3) "Tecnica dei Fondamentali" (549fee34-1614-4d04-962d-bf9efa8d6ff5,
--    Palestra, Principiante, equipment dichiarato "Bilanciere leggero,
--    power rack"):
--    - Focus Squat pos.2 (`gambe-squat`, intermediate, full_gym): NON
--      TOCCATO — coerente con l'attrezzatura dichiarata e con la funzione
--      tecnica del template (focus esplicito su "Squat, panca, stacco,
--      press"), livello intermediate tollerato per un template Principiante
--      per coerenza con la metodologia di validazione già stabilita nel
--      sotto-blocco 2.2 (solo 'advanced' viene considerato incompatibile).
--    - Focus Stacco e Press pos.2 (wte 7433b045-2779-4578-b1ea-299ba33637f9):
--      `gambe-stacco-rumeno` (livello advanced) — unico problema reale di
--      questo template. Sostituito con `gambe-hip-thrust` (livello
--      intermediate, stesso schema hinge, stessa catena posteriore
--      glutei/femorali, stessa categoria primary, compatibile con
--      l'attrezzatura dichiarata "Bilanciere leggero" — l'hip thrust si
--      esegue con un bilanciere leggero sui fianchi): regressione tecnica
--      coerente (meno tecnico e meno rischioso sulla zona lombare per un
--      principiante rispetto allo stacco rumeno), non un semplice
--      innalzamento del livello dichiarato del template.
--
-- Ogni UPDATE verifica esplicitamente lo stato attuale della riga (id +
-- exercise_id + sets/reps/rest_seconds) prima di scrivere: se il contenuto
-- reale non corrispondesse più a quello analizzato, la migration fallisce
-- con un errore esplicito invece di sovrascrivere alla cieca.

do $$
declare
  v_count integer;
begin
  -- 1) Corpo Libero — Workout B, posizione 1: gambe-squat -> glutei-squat-sumo
  update public.workout_template_exercises
  set exercise_id = 'glutei-squat-sumo',
      sets = 3,
      reps = 15,
      reps_min = 12,
      reps_max = 15,
      rest_seconds = 60,
      notes = 'Squat sumo a corpo libero o con carico aggiuntivo leggero: ginocchia verso le punte dei piedi, busto stabile, spinta dai talloni.'
  where id = '1df6d2cd-7516-44e7-a9d1-666cb374dbe0'
    and exercise_id = 'gambe-squat'
    and sets = 3 and reps = 18 and reps_min = 15 and reps_max = 20 and rest_seconds = 60;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055_MISMATCH: riga Corpo Libero/Workout B pos.1 (gambe-squat) non corrisponde allo stato atteso — migration interrotta senza modifiche.';
  end if;

  -- 2) Corpo Libero — Workout B, posizione 2: dorso-trazioni -> dorso-rematore-manubrio
  update public.workout_template_exercises
  set exercise_id = 'dorso-rematore-manubrio',
      sets = 3,
      reps = 12,
      reps_min = 10,
      reps_max = 12,
      rest_seconds = 60,
      notes = 'Rematore monolaterale: usa un oggetto pesante di uso comune (es. zaino carico) se non disponibili manubri. Schiena parallela al pavimento, gomito vicino al busto.'
  where id = '44f2f186-6b54-481c-a8a9-59d397387fb6'
    and exercise_id = 'dorso-trazioni'
    and sets = 3 and reps = 10 and reps_min = 8 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055_MISMATCH: riga Corpo Libero/Workout B pos.2 (dorso-trazioni) non corrisponde allo stato atteso — migration interrotta senza modifiche.';
  end if;

  -- 3) Manubri ed Elastici — Lower A, posizione 2: gambe-stacco-rumeno -> femorali-hip-hinge
  update public.workout_template_exercises
  set exercise_id = 'femorali-hip-hinge',
      sets = 4,
      reps = 15,
      reps_min = 12,
      reps_max = 18,
      rest_seconds = 60,
      notes = 'Pattern di hip hinge a corpo libero, ripetizioni più alte per compensare l''assenza di carico esterno: anche indietro, schiena neutra, ginocchia morbide.'
  where id = '11a09e8c-4a23-4ab2-875b-0393531f6e2b'
    and exercise_id = 'gambe-stacco-rumeno'
    and sets = 3 and reps = 11 and reps_min = 10 and reps_max = 12 and rest_seconds = 75;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055_MISMATCH: riga Manubri ed Elastici/Lower A pos.2 (gambe-stacco-rumeno) non corrisponde allo stato atteso — migration interrotta senza modifiche.';
  end if;

  -- 4) Tecnica dei Fondamentali — Focus Stacco e Press, posizione 2: gambe-stacco-rumeno -> gambe-hip-thrust
  update public.workout_template_exercises
  set exercise_id = 'gambe-hip-thrust',
      sets = 3,
      reps = 10,
      reps_min = null,
      reps_max = null,
      rest_seconds = 75,
      notes = 'Bilanciere leggero sui fianchi o corpo libero: spinta del bacino, contrazione glutei in massima estensione. Regressione più controllata rispetto allo stacco rumeno per apprendere il pattern hip-hinge.'
  where id = '7433b045-2779-4578-b1ea-299ba33637f9'
    and exercise_id = 'gambe-stacco-rumeno'
    and sets = 4 and reps = 8 and reps_min is null and reps_max is null and rest_seconds = 90;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'BUG_055_MISMATCH: riga Tecnica dei Fondamentali/Focus Stacco e Press pos.2 (gambe-stacco-rumeno) non corrisponde allo stato atteso — migration interrotta senza modifiche.';
  end if;
end $$;

-- Verifica esplicita di non-regressione: la riga "Focus Squat" pos.2 di
-- "Tecnica dei Fondamentali" (gambe-squat, coerente col template, mai
-- toccata sopra) deve restare invariata.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.workout_template_exercises
  where id = '5c20c1d3-328d-4b29-bd92-042769081fb1'
    and exercise_id = 'gambe-squat' and sets = 4 and reps = 8 and rest_seconds = 90;
  if v_count <> 1 then
    raise exception 'BUG_055_UNEXPECTED_CHANGE: la riga Focus Squat/gambe-squat di Tecnica dei Fondamentali (non parte di questo fix) risulta modificata o mancante.';
  end if;
end $$;

-- Due nuove relazioni exercise_alternatives, giustificate esplicitamente
-- dalle sostituzioni sopra (non generate automaticamente — vedi motivazione
-- nel commento di ciascuna sostituzione).
insert into public.exercise_alternatives (
  source_exercise_id, alternative_exercise_id, movement_pattern_match, equipment_tag,
  relative_difficulty, priority, reason, is_active
) values
('dorso-trazioni', 'dorso-rematore-manubrio', false, 'home_basic', 'easier', 3, 'Stesso gruppo muscolare (dorsali), schema di movimento diverso (tirata verticale vs orizzontale): fallback quando non è disponibile una sbarra per trazioni, come già anticipato dalla nota originale del template "Corpo Libero" (BUG-055).', true),
('gambe-stacco-rumeno', 'gambe-hip-thrust', true, 'full_gym', 'easier', 3, 'Stesso schema (hinge, catena posteriore), meno tecnico e meno rischioso sulla zona lombare: regressione adottata per correggere BUG-055 nel template "Tecnica dei Fondamentali".', true)
on conflict (source_exercise_id, alternative_exercise_id) do update set
  movement_pattern_match = excluded.movement_pattern_match,
  equipment_tag = excluded.equipment_tag,
  relative_difficulty = excluded.relative_difficulty,
  priority = excluded.priority,
  reason = excluded.reason,
  is_active = excluded.is_active,
  updated_at = now();

notify pgrst, 'reload schema';
