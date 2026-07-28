-- Fix immediato post-verifica della migrazione precedente
-- (20260810090000_block2_cycle_review_engine.sql): le nuove funzioni
-- create in quella migrazione risultano eseguibili anche dal ruolo `anon`,
-- nonostante ogni CREATE FUNCTION fosse seguito da
-- "revoke all ... from public" + "grant execute ... to authenticated".
--
-- Causa: in questo progetto esiste un default privilege a livello di schema
-- che concede EXECUTE su ogni NUOVA funzione sia ad `anon` che ad
-- `authenticated` al momento della creazione (confermato: le funzioni
-- pre-esistenti come assign_initial_auto_program, mai ricreate da zero in
-- questa sessione, non hanno mai avuto `anon` in ACL — solo le funzioni
-- CREATE ex-novo in 20260810090000 lo hanno). "revoke ... from public" non
-- rimuove un privilegio concesso esplicitamente ad `anon` via default
-- privilege: PUBLIC e `anon` sono entità distinte lato ACL.
--
-- Questa migrazione non cambia alcuna logica: revoca soltanto l'EXECUTE da
-- `anon` sulle funzioni introdotte dal sotto-blocco 2.3, riportandole allo
-- stesso schema di grant delle altre RPC del progetto (nessun EXECUTE ad
-- anon/PUBLIC, solo authenticated + service_role).
revoke all on function public._cycle_open_statuses() from anon;
revoke all on function public._cycle_terminal_statuses() from anon;
revoke all on function public._cycle_blocked_statuses() from anon;
revoke all on function public._exercise_level_ordinal(text) from anon;
revoke all on function public._match_auto_template(text,text,text,integer,integer,uuid) from anon;
revoke all on function public._active_review_config_version() from anon;
revoke all on function public._review_config_value(text, integer) from anon;
revoke all on function public._round_load_increment(numeric, numeric, text) from anon;
revoke all on function public._compute_cycle_progress_metrics(uuid) from anon;
revoke all on function public.check_cycle_review_eligibility(uuid) from anon;
revoke all on function public.submit_monthly_checkin(
  uuid, text, integer, boolean, text[], text, boolean, boolean, integer, text, text, text[], text[], text,
  text, text, text, integer, text, text, text[], text[], text, boolean
) from anon;
revoke all on function public.run_cycle_review(uuid) from anon;

notify pgrst, 'reload schema';
