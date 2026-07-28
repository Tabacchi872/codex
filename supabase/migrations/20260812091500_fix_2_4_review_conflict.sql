-- Fix isolato trovato per lettura del codice PRIMA di eseguire il trigger
-- del sotto-blocco 2.4 con un account sintetico (nessuna esecuzione reale
-- lo aveva ancora esercitato): se il ciclo del cliente e' gia' in
-- 'pending_template'/'pending_safety_review' CON una review definitiva gia'
-- scritta da run_cycle_review (non il caso "impostato direttamente da
-- assign_initial_auto_program senza mai passare da una review"), l'INSERT
-- incondizionato di una seconda riga 'manual_review' in
-- client_cycle_reviews per lo stesso cycle_id avrebbe violato l'indice
-- unico parziale "una sola review definitiva per ciclo" (che esenta solo
-- decision='insufficient_data'). Corretto: la riga viene scritta solo se
-- non esiste gia' una review definitiva per quel ciclo -- stesso identico
-- pattern "if not found" gia' usato da run_cycle_review per i rami
-- pending_safety_review/pending_template (righe 149-185 della migration
-- 20260810100000). Nessun'altra modifica.
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

  -- FIX (questa migration): solo se il ciclo non ha gia' una review
  -- definitiva (es. gia' 'pending_template'/'blocked_safety' scritta da
  -- run_cycle_review), altrimenti violerebbe l'indice unico parziale.
  if not exists (
    select 1 from public.client_cycle_reviews
    where cycle_id = v_cycle.id and decision <> 'insufficient_data'
  ) then
    insert into public.client_cycle_reviews(cycle_id, decision, decision_reason, eligibility_result, origin, reviewed_at)
    values (
      v_cycle.id, 'manual_review',
      'Al cliente e'' stato assegnato un coach: la revisione automatica si interrompe qui (la gestione del programma passa al coach).',
      'coach_assigned', 'automatic', now()
    );
  end if;

  return new;
end;
$function$;
