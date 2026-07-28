-- feat: 2 trigger che mantengono il ledger di effective_active_days in
-- tempo reale, senza toccare NESSUNA funzione decisionale esistente
-- (run_cycle_review, assign_initial_auto_program, le RPC Superadmin, il
-- trigger di coach handoff del 2.4): ogni transizione di stato di un ciclo,
-- da QUALUNQUE funzione provenga, passa sempre da un INSERT o un UPDATE su
-- client_program_cycles — un solo trigger su quella tabella intercetta tutte
-- le transizioni automaticamente. L'unico evento che NON passa da un
-- cambio di stato del ciclo e' la variazione dell'abbonamento stesso
-- (il webhook RevenueCat scrive solo user_subscriptions, il ciclo resta
-- 'active' nel DB finche' run_cycle_review non viene richiamato) — per
-- quello serve un secondo trigger dedicato.

create or replace function public._client_program_cycles_sync_active_period()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public._sync_cycle_active_period(new.id);
  return new;
end;
$$;

create trigger client_program_cycles_sync_active_period
  after insert or update of status on public.client_program_cycles
  for each row execute function public._client_program_cycles_sync_active_period();

-- Il webhook RevenueCat aggiorna solo user_subscriptions: nessun cambio di
-- stato su client_program_cycles avviene automaticamente in quel momento
-- (il ciclo resta 'active' nel DB anche dopo una scadenza, finche' non
-- viene richiamato run_cycle_review). Questo trigger sincronizza subito
-- il ciclo APERTO corrente del cliente (se esiste) ogni volta che
-- user_subscriptions cambia stato o scadenza — cosi' effective_active_days
-- riflette la scadenza/il rinnovo/la revoca dal momento esatto in cui i
-- dati RevenueCat gia' sincronizzati cambiano, non solo alla successiva
-- chiamata di run_cycle_review.
create or replace function public._handle_subscription_change_for_cycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cycle_id uuid;
begin
  select id into v_cycle_id from public.client_program_cycles
  where client_id = new.user_id and status = any(public._cycle_open_statuses())
  order by started_at desc limit 1;

  if v_cycle_id is not null then
    perform public._sync_cycle_active_period(v_cycle_id);
  end if;

  return new;
end;
$$;

create trigger user_subscriptions_sync_cycle_active_period
  after insert or update of status, expires_at on public.user_subscriptions
  for each row execute function public._handle_subscription_change_for_cycle();

revoke all on function public._client_program_cycles_sync_active_period() from public, authenticated, anon;
revoke all on function public._handle_subscription_change_for_cycle() from public, authenticated, anon;
