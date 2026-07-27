-- fix: sotto-blocco 2.2 (continuazione) — chiude le lacune di copertura
-- alternative trovate dalla validazione automatica della migration
-- precedente (20260805090000). Nessuna modifica a quella migration (già
-- applicata): solo nuove righe additive in exercise_alternatives.
--
-- Verificato con query read-only dopo il seed iniziale: 96/96 esercizi
-- classificati, 78/78 esercizi dei template auto_eligible con metadati,
-- 0 self-reference/duplicati/orfani — ma 37 esercizi con
-- eligible_for_substitution=true risultavano senza ALCUNA alternativa in
-- uscita, di cui 26 realmente usati dai 18 template auto_eligible. La
-- maggior parte erano semplicemente la direzione mancante di una coppia già
-- esistente nell'altro verso (es. "petto-panca-piana -> petto-chest-press"
-- esisteva, "petto-chest-press -> petto-panca-piana" no) — aggiunte qui.
-- Due casi restano senza alternativa per scelta esplicita, non per
-- dimenticanza: gambe-leg-extension (unico esercizio di isolamento
-- ginocchio in estensione nel catalogo, nessuna alternativa credibile senza
-- cambiare schema di movimento) e spalle-tirate-mento (movimento
-- sufficientemente specifico da non avere un sostituto diretto nel catalogo
-- attuale) — documentati anche in docs/EXERCISE_METADATA_COVERAGE.md.

insert into public.exercise_alternatives (
  source_exercise_id, alternative_exercise_id, movement_pattern_match, equipment_tag,
  relative_difficulty, priority, reason, is_active
) values
('bicipiti-curl-martello', 'bicipiti-curl-manubri', true, 'home_basic', 'equivalent', 2, 'Stessa attrezzatura, direzione inversa della coppia già esistente.', true),
('cardio-battle-rope', 'cardio-jumping-jack', true, 'bodyweight_only', 'easier', 3, 'Stesso obiettivo cardio HIIT, nessuna attrezzatura richiesta come fallback.', true),
('cardio-stair-climber', 'cardio-tapis-roulant', true, 'full_gym', 'equivalent', 2, 'Stesso obiettivo cardio steady-state su un''altra macchina.', true),
('core-dead-bug', 'core-plank', true, 'bodyweight_only', 'harder', 3, 'Stessa famiglia anti-estensione, direzione inversa (progressione verso la tenuta isometrica).', true),
('core-leg-raise', 'core-reverse-crunch', false, 'bodyweight_only', 'equivalent', 3, 'Stesso focus (basso addome), schema di movimento diverso (sollevamento gambe vs retroversione bacino).', true),
('core-mountain-climber', 'cardio-jumping-jack', true, 'bodyweight_only', 'equivalent', 3, 'Stesso obiettivo cardio a corpo libero, nessuna componente di stabilità core richiesta.', true),
('core-reverse-crunch', 'core-crunch', true, 'bodyweight_only', 'equivalent', 3, 'Stesso gruppo muscolare, direzione inversa della coppia già esistente.', true),
('core-side-plank', 'core-pallof-press', true, 'home_basic', 'equivalent', 2, 'Stessa famiglia anti-rotazione, direzione inversa della coppia già esistente.', true),
('femorali-hip-hinge', 'gambe-stacco-rumeno', true, 'full_gym', 'harder', 3, 'Stesso schema di movimento, progressione naturale una volta consolidato il pattern senza carico.', true),
('glutei-abduzioni', 'glutei-kickback-cavo', true, 'full_gym', 'equivalent', 2, 'Stesso obiettivo (isolamento glutei), direzione inversa della coppia già esistente.', true),
('glutei-affondi-posteriori', 'gambe-affondi', true, 'bodyweight_only', 'equivalent', 2, 'Stesso schema unilaterale, direzione inversa della coppia già esistente.', true),
('lombari-bird-dog', 'core-dead-bug', false, 'bodyweight_only', 'equivalent', 3, 'Entrambi drill di stabilità anti-movimento a corpo libero, gruppo muscolare principale diverso (lombari vs addome) ma stessa funzione di controllo del tronco in quadrupedia/supino.', true),
('polpacci-calf-raise-monopodalico', 'gambe-calf-raise', true, 'home_basic', 'easier', 2, 'Stesso movimento in versione bipodalica, direzione inversa della coppia già esistente.', true),
('spalle-alzate-frontali', 'spalle-alzate-laterali', false, 'home_basic', 'equivalent', 4, 'Isolamento della spalla con manubri, piano di movimento diverso — stessa motivazione della coppia già esistente in direzione opposta.', true),
('tricipiti-kickback', 'tricipiti-pushdown-cavo', true, 'full_gym', 'equivalent', 2, 'Stesso gruppo muscolare, direzione inversa della coppia già esistente.', true),
('cardio-ellittica', 'cardio-tapis-roulant', true, 'full_gym', 'equivalent', 2, 'Stesso obiettivo cardio steady-state, direzione inversa della coppia già esistente.', true),
('cardio-vogatore', 'cardio-cyclette', true, 'full_gym', 'equivalent', 3, 'Stesso obiettivo cardio, direzione inversa della coppia già esistente.', true),
('dorso-lat-machine-neutra', 'dorso-lat-machine-avanti', true, 'full_gym', 'equivalent', 2, 'Stessa macchina, direzione inversa della coppia già esistente.', true),
('dorso-vertical-row', 'dorso-rematore-macchina', true, 'full_gym', 'equivalent', 2, 'Entrambe macchine guidate per la tirata orizzontale, direzione inversa della coppia già esistente.', true),
('gambe-leg-curl', 'femorali-leg-curl-sdraiato', true, 'full_gym', 'equivalent', 1, 'Stesso movimento: gambe-leg-curl è la voce storica ambigua (vedi nota di classificazione), qui la variante specifica come alternativa preferita.', true),
('glutei-squat-sumo', 'gambe-squat', true, 'full_gym', 'equivalent', 3, 'Stesso schema squat, direzione inversa della coppia già esistente.', true),
('petto-chest-press', 'petto-panca-piana-manubri', true, 'home_basic', 'harder', 2, 'Stessa funzione, progressione dalla macchina guidata al peso libero.', true),
('petto-push-up', 'petto-panca-piana-manubri', true, 'home_basic', 'harder', 3, 'Stesso schema, progressione dal corpo libero al carico esterno quando l''attrezzatura diventa disponibile.', true),
('tricipiti-panca-presa-stretta', 'tricipiti-dip-tricipiti', false, 'home_basic', 'equivalent', 3, 'Entrambi movimenti composti (non isolamento) a forte impegno tricipiti, schema di spinta diverso (orizzontale vs verticale).', true),

-- Esercizi non usati dai template auto_eligible ma comunque selezionabili
-- nell'app: stessa cura, priorità di completamento più bassa (non richiesta
-- esplicitamente da nessun template reale, ma coerente con "100% copertura
-- degli esercizi attivi quando classificabili con sicurezza").
('bicipiti-curl-alternato', 'bicipiti-curl-manubri', true, 'home_basic', 'equivalent', 2, 'Stessa attrezzatura ed esecuzione, direzione inversa della coppia già esistente.', true),
('bicipiti-curl-cavo', 'bicipiti-curl-bilanciere', true, 'full_gym', 'equivalent', 2, 'Stesso movimento, direzione inversa della coppia già esistente.', true),
('femorali-nordic-curl', 'femorali-leg-curl-sdraiato', true, 'full_gym', 'easier', 4, 'Stesso gruppo muscolare, direzione inversa della coppia già esistente (regressione dalla variante eccentrica avanzata alla macchina guidata).', true),
('gambe-step-up', 'gambe-affondi', true, 'bodyweight_only', 'equivalent', 2, 'Stesso schema unilaterale, direzione inversa della coppia già esistente.', true),
('glutei-kickback-cavo', 'glutei-abduzioni', true, 'home_basic', 'equivalent', 2, 'Stesso obiettivo, direzione inversa della coppia già esistente.', true),
('mobilita-cat-cow', 'mobilita-rotazioni-toraciche', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (mobilità treno superiore), distretto diverso.', true),
('mobilita-caviglie', 'mobilita-anche', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (mobilità generale), direzione inversa della coppia già esistente.', true),
('mobilita-rotazioni-toraciche', 'mobilita-spalle', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (mobilità treno superiore), direzione inversa della coppia già esistente.', true),
('polpacci-calf-press-leg-press', 'polpacci-calf-raise-seduto', true, 'full_gym', 'equivalent', 1, 'Stessa meccanica, direzione inversa della coppia già esistente.', true),
('stretching-pettorali', 'stretching-femorali', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (stretching statico), distretto diverso.', true),
('stretching-quadricipiti', 'stretching-femorali', false, 'bodyweight_only', 'equivalent', 4, 'Stessa categoria (stretching statico), distretto diverso.', true)

on conflict (source_exercise_id, alternative_exercise_id) do update set
  movement_pattern_match = excluded.movement_pattern_match,
  equipment_tag = excluded.equipment_tag,
  relative_difficulty = excluded.relative_difficulty,
  priority = excluded.priority,
  reason = excluded.reason,
  is_active = excluded.is_active,
  updated_at = now();

notify pgrst, 'reload schema';
