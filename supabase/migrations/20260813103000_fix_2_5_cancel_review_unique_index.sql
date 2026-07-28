-- Fix isolato trovato eseguendo per la prima volta il ciclo completo
-- force_cycle_decision -> cancel_pending_review -> nuovo tentativo con un
-- account sintetico (dopo i due fix precedenti sullo stesso ciclo di test):
-- anche riconoscendo correttamente "questa review e' stata annullata" (fix
-- 20260813100000/101500), un secondo tentativo su un ciclo il cui indice
-- `client_cycle_reviews_one_definitive_per_cycle_idx` e' univoco su
-- `cycle_id` (per qualunque decision <> 'insufficient_data') falliva
-- comunque: quell'indice vieta DUE righe definitive per lo stesso
-- cycle_id, indipendentemente dal fatto che la prima sia stata annullata.
-- Lasciare la vecchia review al suo posto e sperare di poterne inserire
-- una seconda sullo stesso ciclo era strutturalmente incompatibile con
-- questo vincolo (che riflette l'invariante reale del sistema: un ciclo,
-- una volta deciso, resta deciso -- lo stesso modello event-sourced usato
-- da run_cycle_review, dove "riprovare" produce sempre un ciclo N+1 nuovo,
-- mai una seconda review sul ciclo N).
--
-- Corretto allineando superadmin_cancel_pending_review a questo invariante:
-- un annullamento "non ancora applicato" (per definizione, sezione 14.1)
-- tratta la review come se non fosse mai realmente accaduta -- quindi la
-- riga viene ELIMINATA (non lasciata a fianco di una nuova), non solo il
-- ciclo successivo. Nulla dello storico va perso nonostante l'eliminazione:
-- - i dati della review (decisione, motivazione, id ciclo successivo) e
--   TUTTE le sue transizioni per-esercizio (client_cycle_exercise_transitions,
--   che ha ON DELETE CASCADE su review_id: verificato con una query ai
--   vincoli prima di scrivere questo fix, non assunto) vengono prima
--   catturate integralmente in superadmin_program_overrides.previous_value
--   -- l'unica riga che DEVE restare per sempre secondo le regole del
--   compito, e qui resta;
-- - superadmin_program_overrides.review_id ha ON DELETE SET NULL (anche
--   questo verificato, non assunto): l'override stesso non viene mai perso,
--   solo il collegamento diretto alla riga ormai cancellata si azzera.
create or replace function public.superadmin_cancel_pending_review(
  p_review_id uuid, p_notes text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_review public.client_cycle_reviews%rowtype;
  v_next_cycle public.client_program_cycles%rowtype;
  v_prev_cycle public.client_program_cycles%rowtype;
  v_transitions jsonb;
  v_override_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN: solo un superadmin puo'' annullare una review';
  end if;
  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'NOTES_REQUIRED: motivo obbligatorio';
  end if;

  select * into v_review from public.client_cycle_reviews where id = p_review_id;
  if not found then
    raise exception 'NOT_FOUND: review non trovata';
  end if;
  if v_review.next_cycle_id is null then
    raise exception 'NOTHING_TO_CANCEL: questa review non ha generato un nuovo ciclo';
  end if;

  select * into v_next_cycle from public.client_program_cycles where id = v_review.next_cycle_id for update;
  if not found then
    raise exception 'NOT_FOUND: ciclo successivo non trovato';
  end if;
  if v_next_cycle.status <> 'active' then
    raise exception 'ALREADY_PROGRESSED: il ciclo successivo non e'' piu'' nello stato iniziale (%), usare superadmin_force_cycle_decision per correggere in avanti', v_next_cycle.status;
  end if;
  if exists (select 1 from public.client_monthly_checkins where cycle_id = v_next_cycle.id) then
    raise exception 'ALREADY_PROGRESSED: esiste gia'' un check-in sul nuovo ciclo, usare superadmin_force_cycle_decision per correggere in avanti';
  end if;
  if exists (select 1 from public.client_cycle_reviews where cycle_id = v_next_cycle.id) then
    raise exception 'ALREADY_PROGRESSED: il nuovo ciclo ha gia'' una revisione propria, usare superadmin_force_cycle_decision per correggere in avanti';
  end if;

  select * into v_prev_cycle from public.client_program_cycles where id = v_review.cycle_id for update;
  if not found then
    raise exception 'NOT_FOUND: ciclo precedente non trovato';
  end if;

  -- FIX (questa migration): snapshot completo di review + transizioni
  -- PRIMA di eliminare (mai perdere lo storico, solo consolidarlo).
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_transitions
  from public.client_cycle_exercise_transitions t
  where t.review_id = p_review_id;

  update public.client_program_cycles set status = 'cancelled' where id = v_next_cycle.id;

  update public.client_program_cycles
  set status = 'review_pending', replaced_at = null, completed_at = null
  where id = v_prev_cycle.id;

  update public.client_monthly_checkins
  set status = 'submitted', locked_at = null
  where cycle_id = v_prev_cycle.id;

  insert into public.superadmin_program_overrides(
    superadmin_id, client_id, cycle_id, action, notes, payload, entity_type, entity_id, previous_value, new_value, review_id, status
  ) values (
    auth.uid(), v_prev_cycle.client_id, v_prev_cycle.id, 'cancel_pending_review', p_notes,
    jsonb_build_object('review_id', p_review_id, 'cancelled_cycle_id', v_next_cycle.id),
    'review', p_review_id,
    jsonb_build_object(
      'decision', v_review.decision, 'decision_reason', v_review.decision_reason,
      'next_cycle_id', v_review.next_cycle_id, 'next_template_id', v_review.next_template_id,
      'reviewed_at', v_review.reviewed_at, 'origin', v_review.origin,
      'exercise_transitions', v_transitions
    ),
    jsonb_build_object('cancelled', true),
    p_review_id, 'applied'
  ) returning id into v_override_id;

  -- FIX (questa migration): la review annullata viene eliminata (non
  -- lasciata accanto a una futura nuova review sullo stesso cycle_id), per
  -- rispettare `client_cycle_reviews_one_definitive_per_cycle_idx` -- vedi
  -- commento in testa al file. Le transizioni collegate seguono in cascata
  -- (ON DELETE CASCADE, gia' catturate sopra in v_transitions).
  delete from public.client_cycle_reviews where id = p_review_id;

  insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
  values (
    v_prev_cycle.client_id, 'cliente', 'auto_program_override_applied', 'La revisione del tuo programma e'' stata annullata',
    'Il Superadmin ha annullato l''ultima decisione: il tuo programma tornera'' in revisione.',
    jsonb_build_object('cycle_id', v_prev_cycle.id, 'cancelled_review_id', p_review_id),
    'auto_program_override_applied:cancel:' || p_review_id::text
  )
  on conflict do nothing;
end;
$function$;
