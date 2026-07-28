-- feat: implementa effective_active_days (gap noto dal 2.1, mai colmato,
-- segnalato esplicitamente in docs/DECISIONS.md "review_due_at come proxy").
--
-- PROBLEMA: _compute_cycle_progress_metrics calcolava le sessioni attese
-- (sessions_expected) sui giorni di CALENDARIO trascorsi da started_at,
-- indipendentemente da quanto il ciclo fosse davvero utilizzabile — un
-- cliente con l'abbonamento scaduto per 10 giorni a metà ciclo veniva
-- penalizzato come se in quei 10 giorni avesse dovuto allenarsi e non
-- l'avesse fatto (aderenza artificialmente bassa), quando in realtà non
-- aveva alcun accesso al programma.
--
-- SOLUZIONE: un registro (ledger) di intervalli "effettivamente utilizzabili"
-- per ciclo (client_program_cycle_active_periods), sincronizzato in tempo
-- reale da 2 trigger (vedi migration successiva) ogni volta che cambia lo
-- stato del ciclo O l'abbonamento del cliente. "Effettivamente utilizzabile"
-- = stato del ciclo in (active, checkin_due, review_pending) AND abbonamento
-- Client Pro valido (_has_active_client_pro_entitlement, gia' esistente,
-- dati RevenueCat gia' sincronizzati — NESSUNA seconda fonte di verita'
-- creata) AND nessun coach attivo (client_has_no_active_coach, gia'
-- esistente).
--
-- LIMITE ESPLICITO (nessuna data inventata): user_subscriptions ha 7 righe
-- per 2 utenti (storico parziale per cambio pacchetto), ma non e' possibile
-- ricostruire con certezza tutti gli intervalli PASSATI di idoneita' per
-- ogni ciclo gia' esistente (sovrapposizioni abbonamento/coach/stato ciclo
-- non tracciate finora). Comportamento prudente adottato: il ledger parte
-- da OGGI per ogni ciclo attualmente aperto ed effettivamente utilizzabile
-- (nessun backfill retroattivo); il calcolo e' garantito corretto da questa
-- migration in avanti, non per il passato. Documentato anche in
-- docs/DECISIONS.md.
--
-- SCOPERTA COLLATERALE (non corretta qui, fuori scope — vedi docs/BUGS.md):
-- supabase/functions/revenuecat-webhook/index.ts non gestisce alcun evento
-- di revoca immediata (REFUND): VALID_TYPES include REFUND_REVERSED (il
-- contrario, riammissione dopo una revoca annullata) ma non REFUND stesso.
-- Una vera revoca immediata da parte di Apple/Google non aggiorna oggi
-- user_subscriptions finche' non arriva un evento diverso (es. EXPIRATION
-- alla scadenza naturale) — il ledger qui costruito reagisce correttamente
-- a qualunque valore _has_active_client_pro_entitlement legga, ma dipende
-- dal webhook per riceverlo in tempo reale. Non modificato in questa
-- migration (rischio di introdurre una logica di sincronizzazione
-- duplicata/non richiesta su un sistema esterno gia' funzionante per gli
-- altri 13 tipi di evento).

-- === 1. Tabella ledger ======================================================

create table public.client_program_cycle_active_periods (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.client_program_cycles(id) on delete cascade,
  started_at date not null,
  ended_at date,
  created_at timestamptz not null default now(),
  constraint client_program_cycle_active_periods_range_check check (ended_at is null or ended_at >= started_at)
);

create index client_program_cycle_active_periods_cycle_idx
  on public.client_program_cycle_active_periods(cycle_id);

-- Al massimo un intervallo aperto per ciclo: garantisce che _sync_cycle_active_period
-- sia idempotente (chiamabile piu' volte senza mai aprire un secondo intervallo).
create unique index client_program_cycle_active_periods_one_open_idx
  on public.client_program_cycle_active_periods(cycle_id) where ended_at is null;

comment on table public.client_program_cycle_active_periods is
  'Registro (ledger) degli intervalli in cui un ciclo automatico e'' stato effettivamente utilizzabile (abbonamento valido, nessun coach attivo, stato ciclo aperto/non bloccato). Base per client_program_cycles.effective_active_days. Nessun backfill storico: parte da quando questa migration e'' stata applicata.';

alter table public.client_program_cycle_active_periods enable row level security;

-- Solo Superadmin: registro interno di audit, mai esposto direttamente al
-- cliente (il cliente vede solo il derivato client_program_cycles.effective_active_days
-- tramite le RPC gia' esistenti). Nessun grant a authenticated/anon.
create policy client_program_cycle_active_periods_superadmin_all
  on public.client_program_cycle_active_periods for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select on public.client_program_cycle_active_periods to authenticated;
revoke insert, update, delete on public.client_program_cycle_active_periods from authenticated;

-- === 2. Funzioni helper ======================================================

create or replace function public._client_program_cycle_is_effectively_usable(p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce(c.status in ('active', 'checkin_due', 'review_pending'), false)
    and public._has_active_client_pro_entitlement(c.client_id)
    and public.client_has_no_active_coach(c.client_id)
  from public.client_program_cycles c
  where c.id = p_cycle_id;
$$;

comment on function public._client_program_cycle_is_effectively_usable(uuid) is
  'Vero solo se il ciclo e'' in uno stato aperto E il cliente ha un abbonamento Client Pro valido ORA E nessun coach attivo. Usata da _sync_cycle_active_period per aprire/chiudere gli intervalli del ledger.';

create or replace function public._compute_effective_active_days(p_cycle_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(coalesce(ended_at, current_date) - started_at), 0)::integer
  from public.client_program_cycle_active_periods
  where cycle_id = p_cycle_id;
$$;

comment on function public._compute_effective_active_days(uuid) is
  'Somma dei giorni effettivamente utilizzabili per un ciclo: intervalli chiusi (ended_at - started_at) + eventuale intervallo aperto fino a oggi. Nessun giorno di abbonamento scaduto/sospeso/con coach attivo viene mai contato.';

create or replace function public._sync_cycle_active_period(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_usable boolean;
  v_open_id uuid;
  v_open_started date;
begin
  if p_cycle_id is null then
    return;
  end if;

  select public._client_program_cycle_is_effectively_usable(p_cycle_id) into v_usable;

  select id, started_at into v_open_id, v_open_started
  from public.client_program_cycle_active_periods
  where cycle_id = p_cycle_id and ended_at is null;

  if v_usable then
    if v_open_id is null then
      insert into public.client_program_cycle_active_periods(cycle_id, started_at)
      values (p_cycle_id, current_date);
    end if;
  else
    if v_open_id is not null then
      update public.client_program_cycle_active_periods
      set ended_at = greatest(v_open_started, current_date)
      where id = v_open_id;
    end if;
  end if;

  update public.client_program_cycles
  set effective_active_days = public._compute_effective_active_days(p_cycle_id)
  where id = p_cycle_id;
end;
$$;

comment on function public._sync_cycle_active_period(uuid) is
  'Idempotente: apre un nuovo intervallo se il ciclo e'' ora utilizzabile e non ne esiste gia'' uno aperto; chiude l''intervallo aperto se non lo e'' piu''. Aggiorna anche la cache client_program_cycles.effective_active_days. Va richiamata ad ogni evento che puo'' cambiare l''idoneita'' (vedi trigger nella migration successiva).';

revoke all on function public._client_program_cycle_is_effectively_usable(uuid) from public, authenticated, anon;
revoke all on function public._compute_effective_active_days(uuid) from public, authenticated, anon;
revoke all on function public._sync_cycle_active_period(uuid) from public, authenticated, anon;

-- === 3. Seed di partenza (nessun backfill storico, solo da oggi) ===========
-- Per ogni ciclo attualmente in uno stato aperto (_cycle_open_statuses()),
-- sincronizza subito: se effettivamente utilizzabile ORA, apre un intervallo
-- con started_at = oggi (mai una data passata inventata); se non lo e'',
-- non apre nulla (effective_active_days resta 0 finche' non lo diventa).
do $$
declare
  v_cycle record;
begin
  for v_cycle in
    select id from public.client_program_cycles
    where status = any(public._cycle_open_statuses())
  loop
    perform public._sync_cycle_active_period(v_cycle.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
