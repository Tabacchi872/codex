-- ROLLBACK PREPARATO, NON ESEGUITO.
-- Annulla esclusivamente i dati inseriti da
-- supabase/migrations/20260816150000_workout_templates_ymove_catalog.sql
-- (gli 8 modelli "Allenamenti YMove"). Non tocca la colonna is_ymove ne'
-- il constraint aggiunti dalla stessa migration: possono restare nello
-- schema anche dopo un rollback dei soli dati.
--
-- Identificazione: 8 ID ESATTI, fissi (assegnati esplicitamente nella
-- migration con "v_tpl uuid := '...'::uuid", non generati con
-- gen_random_uuid()) — non un criterio come "is_system=true AND
-- is_ymove=true", che in futuro potrebbe includere altri modelli YMove
-- aggiunti da migration successive a questa. Questo script tocca SOLO
-- questi 8 workout_templates.id, mai un modello YMove futuro con un id
-- diverso.
--
-- Cosa elimina:
--   - le 8 righe public.workout_templates elencate sotto;
--   - a cascata (on delete cascade, invariato): le loro
--     workout_template_days e workout_template_exercises.
--
-- Cosa NON elimina (verificato prima di scrivere questo script):
--   - qualunque futuro modello YMove con un id diverso da questi 8;
--   - public.exercises (i 360 esercizi YMove): mai referenziati da questo
--     DELETE, nessuna riga di quella tabella viene toccata;
--   - modelli professionali/personali: id diversi da questi 8, il filtro
--     non li seleziona mai;
--   - schede reali dei clienti (public.workout_plans e derivate): il
--     vincolo workout_plans.template_id -> workout_templates(id) e'
--     "ON DELETE SET NULL" (verificato sul database reale con
--     pg_get_constraintdef), MAI cascade — un cliente con una scheda gia'
--     assegnata da uno di questi modelli perde solo il riferimento al
--     modello sorgente (template_id diventa null), non i propri dati
--     (workout_days/workout_day_exercises, storico, progressi restano
--     intatti).
--
-- Guard esplicita in due parti:
--   1. Verifica che TUTTI e SOLI questi 8 ID esistano davvero come
--      workout_templates con is_system=true AND is_ymove=true (non righe
--      generiche): se anche uno solo manca, o non ha piu' quei due flag
--      (es. modificato a mano), la transazione si interrompe con
--      ROLLBACK_GUARD_FAILED, SENZA cancellare nulla.
--   2. Il DELETE finale filtra comunque per id = ANY(...) esplicito, mai
--      per is_ymove/is_system da soli: anche se la guard venisse rimossa
--      per errore, il DELETE non potrebbe comunque espandersi a righe non
--      elencate qui.

begin;

do $$
declare
  v_expected_ids uuid[] := array[
    'a1000000-0000-4000-8000-000000000001'::uuid, -- Upper/Lower YMove
    'a1000000-0000-4000-8000-000000000002'::uuid, -- Push Pull Legs YMove
    'a1000000-0000-4000-8000-000000000003'::uuid, -- Full Body Ipertrofia YMove
    'a1000000-0000-4000-8000-000000000004'::uuid, -- Full Body Metabolico YMove
    'a1000000-0000-4000-8000-000000000005'::uuid, -- Pesi + Cardio YMove
    'a1000000-0000-4000-8000-000000000006'::uuid, -- Forza Base YMove
    'a1000000-0000-4000-8000-000000000007'::uuid, -- Powerbuilding YMove
    'a1000000-0000-4000-8000-000000000008'::uuid  -- Full Body Principiante YMove
  ];
  v_valid_count integer;
begin
  select count(*) into v_valid_count
  from public.workout_templates
  where id = any(v_expected_ids)
    and is_system = true
    and is_ymove = true;

  if v_valid_count <> array_length(v_expected_ids, 1) then
    raise exception 'ROLLBACK_GUARD_FAILED: attesi % modelli YMove con questi id esatti (is_system=true, is_ymove=true), trovati %. Nessuna riga cancellata. Verificare manualmente prima di procedere.',
      array_length(v_expected_ids, 1), v_valid_count;
  end if;
end
$$;

delete from public.workout_templates
where id = any(array[
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'a1000000-0000-4000-8000-000000000002'::uuid,
  'a1000000-0000-4000-8000-000000000003'::uuid,
  'a1000000-0000-4000-8000-000000000004'::uuid,
  'a1000000-0000-4000-8000-000000000005'::uuid,
  'a1000000-0000-4000-8000-000000000006'::uuid,
  'a1000000-0000-4000-8000-000000000007'::uuid,
  'a1000000-0000-4000-8000-000000000008'::uuid
]);

commit;
