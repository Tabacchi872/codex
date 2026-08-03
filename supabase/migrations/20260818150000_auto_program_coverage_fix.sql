-- COPERTURA TOTALE SCHEDE AUTOMATICHE
-- 1) Corregge il bug di dati su workout_templates.goal ('Casa' e 'Ricomposizione corporea'
--    non sono mai prodotti da assign_initial_auto_program(), quindi quei template erano
--    strutturalmente irraggiungibili dal motore automatico).
-- 2) Aggiunge due template mancanti (Forza/Principiante/Palestra/4gg e
--    Performance/Principiante/Palestra/3gg) per chiudere le due combinazioni goal x level
--    a copertura totale zero rilevate dall'audit. Nessun esercizio con min_level diverso
--    da 'beginner' e nessun equipment_tag oltre 'full_gym' (stesso tetto di Forza Base YMove,
--    mai abbassato). Non viene modificato _match_auto_template né alcun template esistente,
--    inclusa la pilota Forza Base YMove.

begin;

-- 1a. 'Corpo Libero' (Principiante, Casa, 3gg, corpo libero puro) -> goal reale 'Principianti'
update public.workout_templates
set goal = 'Principianti'
where id = 'b6a45d88-a517-48c6-8510-26ed7285a1d7' and goal = 'Casa';

-- 1b. 'Manubri ed Elastici' (Intermedio, Casa, 4gg, split upper/lower con manubri) -> 'Massa muscolare'
update public.workout_templates
set goal = 'Massa muscolare'
where id = '6376a9e9-6add-4b77-b85d-00e97b7bd725' and goal = 'Casa';

-- 1c. 'Strength & Shape' (Intermedio, Palestra, 3gg, full body forza + isolamento) -> 'Massa muscolare'
update public.workout_templates
set goal = 'Massa muscolare'
where id = '2d652937-a02f-48a8-b4d2-26d936dfc597' and goal = 'Ricomposizione corporea';

-- 1d. 'Upper/Lower + Conditioning' (Intermedio, Palestra, 4gg, conditioning metabolico) -> 'Dimagrimento'
update public.workout_templates
set goal = 'Dimagrimento'
where id = '2bbd8608-f20a-4910-97d6-cec5685911cb' and goal = 'Ricomposizione corporea';

-- 1e. Correzione di tag: 'dorso-rematore-corpo-libero' e' un esercizio a corpo libero (il nome
-- lo dichiara esplicitamente) ma era classificato 'home_basic', escludendo per errore i clienti
-- con solo corpo libero dal template 'Corpo Libero' che lo contiene. Usato in un solo esercizio
-- di un solo template: correzione isolata, monotona (allarga la platea di livelli attrezzatura
-- compatibili, non la restringe mai), nessun altro template lo referenzia.
update public.exercise_movement_metadata
set equipment_tag = 'bodyweight_only'
where exercise_id = 'dorso-rematore-corpo-libero' and equipment_tag = 'home_basic';

-- 2a. Nuovo template: Forza / Principiante / Palestra / 4 giorni
insert into public.workout_templates
  (id, coach_id, name, description, goal, level, folder_id, sort_order, duration_weeks,
   sessions_per_week, estimated_session_minutes, equipment, location, training_style,
   muscle_focus, intensity, progression_notes, deload_week, is_system, source_template_id,
   is_active, auto_eligible, auto_assignment_rules, auto_progression_rules, next_template_id, is_ymove)
values
  ('b0b28c1d-d708-46e8-8863-0f4abdbdc253', null, 'Forza Base Principiante',
   'Programma forza a 4 giorni su macchine guidate e manubri, pensato per chi inizia: stessi pattern di movimento della linea Forza Base ma con esercizi al livello beginner e nessun bilanciere libero su squat/panca/stacco.',
   'Forza', 'Principiante', null, 18, 8, 4, 50,
   'Manubri, macchine guidate, cavi, leg press',
   'Palestra', 'Forza fondamentale su macchine e manubri', 'Squat, hinge, push, pull su macchine guidate',
   'Medio-alta', 'Quando tutte le serie sono completate a RIR 2 per 2 settimane consecutive, valutare il passaggio a Forza Base 5x5.',
   false, true, null, true, true, null, null, null, false);

insert into public.workout_template_days (id, template_id, name, focus, sort_order, estimated_duration_minutes)
values
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'b0b28c1d-d708-46e8-8863-0f4abdbdc253', 'Lower A', 'Leg press, hip hinge, core', 0, 50),
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'b0b28c1d-d708-46e8-8863-0f4abdbdc253', 'Upper A', 'Push orizzontale, pull verticale, spalle', 1, 50),
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', 'b0b28c1d-d708-46e8-8863-0f4abdbdc253', 'Lower B', 'Leg press orizzontale, affondi, glutei', 2, 50),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', 'b0b28c1d-d708-46e8-8863-0f4abdbdc253', 'Upper B', 'Pull orizzontale/verticale, spalle, braccia', 3, 50);

insert into public.workout_template_exercises
  (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, notes, technique_type, duration_seconds, rpe_rir)
values
  -- Lower A
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'gambe-leg-press-45', 1, 4, 10, 10, 12, 120, 'Ginocchia allineate con le punte dei piedi, escursione completa controllata.', 'normal', null, 'RIR 2'),
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'gambe-stacco-rumeno-manubri', 2, 3, 10, 10, 10, 120, 'Schiena neutra per tutta l''esecuzione, manubri vicini alle gambe.', 'normal', null, 'RIR 2'),
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'femorali-leg-curl-seduto', 3, 3, 12, null, null, 60, 'Movimento controllato, evitare rimbalzi.', 'normal', null, 'RIR 2'),
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'polpacci-calf-raise-seduto', 4, 3, 15, null, null, 45, 'Escursione completa, pausa in contrazione.', 'normal', null, 'RIR 2'),
  ('d6752b41-ba92-4794-9b00-6486685df9a6', 'core-plank', 5, 3, 1, null, null, 30, 'Corpo allineato, bacino stabile.', 'normal', 30, 'RIR 3'),
  -- Upper A
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'petto-chest-press', 1, 4, 10, 10, 10, 120, 'Scapole retratte, movimento controllato in spinta.', 'normal', null, 'RIR 2'),
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'dorso-lat-machine-avanti', 2, 4, 10, 10, 10, 120, 'Tirare con le scapole, gomiti verso il basso.', 'normal', null, 'RIR 2'),
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'd24d94ea-6a02-41da-ad63-01d07008466a', 3, 3, 10, 10, 10, 90, 'Traiettoria verticale, core attivo, evitare inarcamento lombare.', 'normal', null, 'RIR 2'),
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'spalle-alzate-laterali', 4, 3, 15, null, null, 45, 'Gomiti leggermente flessi, salita fino all''altezza spalle.', 'normal', null, 'RIR 2'),
  ('5712893c-fe9c-4ebf-b4a6-2a239607f17d', 'tricipiti-pushdown-cavo', 5, 3, 12, null, null, 45, 'Gomiti fissi lungo il corpo, estensione completa.', 'normal', null, 'RIR 2'),
  -- Lower B
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', 'gambe-leg-press', 1, 4, 10, 10, 10, 120, 'Piedi centrati sulla pedana, ginocchia in linea con le punte.', 'normal', null, 'RIR 2'),
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', '9991ba43-5607-4a23-9698-427f03237912', 2, 3, 10, 10, 10, 90, 'Affondo controllato, ginocchio anteriore sopra la caviglia.', 'normal', null, 'RIR 2'),
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', 'femorali-leg-curl-sdraiato', 3, 3, 12, null, null, 60, 'Movimento controllato, evitare rimbalzi.', 'normal', null, 'RIR 2'),
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', '7f9c16ef-c520-43cf-9eac-c88ea2d06b02', 4, 3, 12, null, null, 45, 'Movimento controllato dall''anca, busto stabile.', 'normal', null, 'RIR 2'),
  ('835728fd-1dc8-41dd-ab94-e9315c01dc92', 'lombari-hyperextension', 5, 3, 12, null, null, 45, 'Estensione controllata, evitare iperestensione lombare.', 'normal', null, 'RIR 2'),
  -- Upper B
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', 'dorso-pulley-basso', 1, 4, 10, 10, 10, 120, 'Trazione al pulley basso: scapole attive, tirare verso l''addome.', 'normal', null, 'RIR 2'),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', 'dc4339c1-8340-4dc2-8843-695e35356545', 2, 3, 10, 10, 10, 90, 'Presa stretta, tirare fino al petto controllando la fase eccentrica.', 'normal', null, 'RIR 2'),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', 'spalle-shoulder-press-macchina', 3, 3, 10, 10, 10, 90, 'Spinta verticale controllata, evitare inarcamento lombare.', 'normal', null, 'RIR 2'),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', '69406ca5-ead5-4c41-9843-2784c01551c8', 4, 3, 15, null, null, 45, 'Corda al petto, gomiti alti, tirare con le scapole.', 'normal', null, 'RIR 2'),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', 'e059a5e9-44a8-4286-98c2-871d1d371f1e', 5, 3, 12, null, null, 45, 'Gomiti fissi lungo il corpo, evitare slanci.', 'normal', null, 'RIR 2'),
  ('905c9d73-a8d4-4d01-bbce-df93432d6de0', '86c37f52-7230-4e81-b87f-cd6cd2be71a6', 6, 3, 12, null, null, 45, 'Gomiti fissi, estensione completa al cavo.', 'normal', null, 'RIR 2');

-- 2b. Nuovo template: Performance / Principiante / Palestra / 3 giorni
insert into public.workout_templates
  (id, coach_id, name, description, goal, level, folder_id, sort_order, duration_weeks,
   sessions_per_week, estimated_session_minutes, equipment, location, training_style,
   muscle_focus, intensity, progression_notes, deload_week, is_system, source_template_id,
   is_active, auto_eligible, auto_assignment_rules, auto_progression_rules, next_template_id, is_ymove)
values
  ('89f83ef1-8156-4281-9eea-fde16a0f39c1', null, 'Performance Base Principiante',
   'Full body a 3 giorni che unisce forza fondamentale su macchine/manubri e condizionamento cardio a fine seduta, per costruire le basi prima di un programma ibrido forza/resistenza piu strutturato.',
   'Performance', 'Principiante', null, 19, 8, 3, 55,
   'Manubri, macchine guidate, cavi, leg press, cardio (vogatore, tapis roulant, cyclette)',
   'Palestra', 'Total body forza fondamentale + condizionamento', 'Total body',
   'Media', 'Quando il condizionamento finale risulta agevole a fine seduta per 2 settimane consecutive, valutare il passaggio a Forza e Resistenza.',
   false, true, null, true, true, null, null, null, false);

insert into public.workout_template_days (id, template_id, name, focus, sort_order, estimated_duration_minutes)
values
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', '89f83ef1-8156-4281-9eea-fde16a0f39c1', 'Total Body A', 'Squat, push, pull + condizionamento', 0, 55),
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', '89f83ef1-8156-4281-9eea-fde16a0f39c1', 'Total Body B', 'Leg press, push verticale, pull + condizionamento', 1, 55),
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', '89f83ef1-8156-4281-9eea-fde16a0f39c1', 'Total Body C', 'Squat manubri, push, pull + condizionamento', 2, 55);

insert into public.workout_template_exercises
  (template_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max, rest_seconds, notes, technique_type, duration_seconds, rpe_rir)
values
  -- Total Body A
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', 'gambe-leg-press-45', 1, 3, 10, 10, 10, 90, 'Ginocchia allineate con le punte dei piedi, escursione completa controllata.', 'normal', null, 'RIR 2'),
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', 'petto-chest-press', 2, 3, 10, 10, 10, 90, 'Scapole retratte, movimento controllato in spinta.', 'normal', null, 'RIR 2'),
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', 'dorso-pulley-basso', 3, 3, 10, 10, 10, 90, 'Trazione al pulley basso: scapole attive, tirare verso l''addome.', 'normal', null, 'RIR 2'),
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', 'core-plank', 4, 3, 1, null, null, 30, 'Corpo allineato, bacino stabile.', 'normal', 30, 'RIR 3'),
  ('f2d5b4e0-9b44-41b7-815a-8c8d87bb6683', 'cardio-vogatore', 5, 1, 1, null, null, 0, 'Ritmo costante, intensita moderata (RPE 5-6), 8 minuti continui.', 'normal', 480, null),
  -- Total Body B
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', 'gambe-leg-press', 1, 3, 10, 10, 10, 90, 'Piedi centrati sulla pedana, ginocchia in linea con le punte.', 'normal', null, 'RIR 2'),
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', 'd24d94ea-6a02-41da-ad63-01d07008466a', 2, 3, 10, 10, 10, 90, 'Traiettoria verticale, core attivo, evitare inarcamento lombare.', 'normal', null, 'RIR 2'),
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', 'dc4339c1-8340-4dc2-8843-695e35356545', 3, 3, 10, 10, 10, 90, 'Presa stretta, tirare fino al petto controllando la fase eccentrica.', 'normal', null, 'RIR 2'),
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', 'lombari-hyperextension', 4, 3, 12, null, null, 45, 'Estensione controllata, evitare iperestensione lombare.', 'normal', null, 'RIR 2'),
  ('9f5a75d9-fe23-4524-8dda-0a0f645d9913', 'cardio-tapis-roulant', 5, 1, 1, null, null, 0, 'Camminata veloce o corsa leggera, intensita moderata, 10 minuti continui.', 'normal', 600, null),
  -- Total Body C
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', '228c0e6c-0145-4090-a01c-7d501a49ef01', 1, 3, 10, 10, 10, 90, 'Manubri lungo i fianchi, busto eretto, escursione completa.', 'normal', null, 'RIR 2'),
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', 'd25aad24-4e4f-4f02-b6c9-6edd7c398210', 2, 3, 10, 10, 10, 90, 'Inclinazione moderata, gomiti sotto i polsi.', 'normal', null, 'RIR 2'),
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', 'dorso-lat-machine-avanti', 3, 3, 10, 10, 10, 90, 'Tirare con le scapole, gomiti verso il basso.', 'normal', null, 'RIR 2'),
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', 'glutei-glute-bridge', 4, 3, 15, null, null, 45, 'Spinta dai talloni, contrazione glutei in alto.', 'normal', null, 'RIR 2'),
  ('6ef12ba1-c63b-4f4d-b6bb-d96c96de3550', 'cardio-cyclette', 5, 1, 1, null, null, 0, 'Ritmo costante, intensita moderata (RPE 5-6), 8 minuti continui.', 'normal', 480, null);

commit;
