-- ============================================================================
-- Sotto-blocco 2.4 — Passaggio cliente self-guided a cliente con coach
-- ============================================================================
-- Design: docs/BLOCK_2_DESIGN.md sezione 13. Quando un cliente self-guided
-- riceve un coach (nuovo collegamento coach_clients con status='active',
-- sia da INSERT diretto sia da riattivazione UPDATE di un collegamento
-- 'removed'), ogni ciclo automatico non-terminale del cliente deve essere
-- interrotto (status -> 'replaced'), mai cancellato: schede, review,
-- check-in e storico esercizi restano leggibili e invariati, la provenienza
-- 'auto_system' delle vecchie schede non viene toccata.
--
-- Idempotenza naturale: il trigger cerca solo cicli con status in
-- _cycle_open_statuses() (draft/active/checkin_due/review_pending/
-- pending_subscription/paused_subscription/pending_safety_review/
-- pending_template -- tutti gli stati non terminali, inclusi quindi i casi
-- "review in corso", "pending_template" e "revisione sicurezza" richiesti
-- dal task). Una volta che il ciclo e' 'replaced' (terminale), invocazioni
-- successive del trigger (assegnazioni duplicate, riattivazioni ripetute,
-- tentativi concorrenti che perdono la corsa sul lock) non trovano piu'
-- nulla da fare: nessuna azione, nessun errore.
--
-- Coerenza con run_cycle_review: la funzione usa lo stesso
-- pg_advisory_xact_lock(hashtext(client_id)) di submit_monthly_checkin e
-- run_cycle_review, cosi' un'assegnazione coach concorrente con una review
-- in corso si serializza sullo stesso lock (mai una corsa silenziosa).
-- Inoltre, run_cycle_review verifica gia' client_has_no_active_coach() alla
-- STEP 5 (prima di qualunque scrittura) per il caso in cui vinca la corsa:
-- se il coach viene assegnato PRIMA che run_cycle_review acquisisca il
-- lock, la STEP 5 lo rileva e restituisce 'manual_review' senza applicare
-- alcuna decisione automatica. Questo trigger copre il caso complementare
-- (coach assegnato mentre il ciclo e' semplicemente aperto, nessuna review
-- in corso in quel momento): senza di esso il ciclo self-guided resterebbe
-- aperto per sempre nonostante il cliente abbia ora un coach.
--
-- Scrive anche una riga in client_cycle_reviews (decision='manual_review',
-- stesso codice e stessa motivazione gia' usati dalla STEP 5 di
-- run_cycle_review per lo stesso evento): senza questa riga, un'eventuale
-- chiamata a run_cycle_review su un ciclo gia' portato a 'replaced' da
-- questo trigger violerebbe l'invariante della sua STEP 4
-- ("ogni ciclo in stato terminale ha una review definitiva"), sollevando
-- un'eccezione INTERNAL_INCONSISTENCY invece di un no-op pulito.
--
-- Nessuna notifica: il coach ha gia' i propri strumenti per vedere lo
-- storico cliente; l'evento "nuovo cliente collegato" e' gia' coperto da
-- altre notifiche esistenti del Blocco 1, non duplicate qui (decisione di
-- design, sezione 13.1 punto 3).
create or replace function public._handle_client_coach_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cycle public.client_program_cycles%rowtype;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.client_id::text));

  select * into v_cycle from public.client_program_cycles
  where client_id = new.client_id and status = any(public._cycle_open_statuses())
  order by started_at desc limit 1
  for update;

  if not found then
    return new;
  end if;

  update public.client_program_cycles
  set status = 'replaced', replaced_at = now()
  where id = v_cycle.id;

  insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
  values (
    v_cycle.id, 'manual_review',
    'Al cliente e'' stato assegnato un coach: la revisione automatica si interrompe qui (la gestione del programma passa al coach).',
    'coach_assigned', 'automatic', now()
  );

  return new;
end;
$function$;

revoke all on function public._handle_client_coach_assignment() from public;

drop trigger if exists coach_clients_handle_assignment on public.coach_clients;
create trigger coach_clients_handle_assignment
  after insert or update of status on public.coach_clients
  for each row
  execute function public._handle_client_coach_assignment();
