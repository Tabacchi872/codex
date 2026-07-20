-- BUG-036: la lista clienti del coach (mobile/src/lib/coach-clients-service.ts)
-- interroga coach_clients (RLS coach_clients_coach_scope, che gia' include
-- 'active' e 'suspended') per ottenere i client_id, poi interroga
-- public.profiles/public.client_profiles per quegli id. La RLS SELECT su
-- profiles/client_profiles per il coach (profiles_coach_reads_own_clients,
-- client_profiles_coach_for_client) usa pero' is_coach_for_client(), che
-- autorizza SOLO se coach_clients.status = 'active'. Per un cliente sospeso
-- questo fa tornare silenziosamente 0 righe (nessun errore RLS visibile) e
-- il servizio mobile lo scarta perche' privo di profilo — il cliente sospeso
-- risulta quindi assente da TUTTE le tab (Tutti/Attivi/Sospesi), non solo da
-- "Sospesi". Stesso pattern gia' corretto per l'avatar in
-- 20260720084323_fix_suspended_client_avatar_access.sql.
--
-- is_coach_for_client() resta INVARIATA (solo 'active'): e' usata anche per
-- l'assegnazione/scrittura di workout_plans (workout_plans_coach_scope,
-- save_workout_plan) e deve restare limitata ai clienti attivi — "Assegna
-- scheda" non va toccato. Nuova funzione dedicata solo per la VISIBILITA'
-- (lettura profilo/dati anagrafici) del coach sui propri clienti attivi+sospesi.
create or replace function public.is_coach_for_client_visible(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_clients
    where coach_clients.coach_id = auth.uid()
      and coach_clients.client_id = target_client_id
      and coach_clients.status in ('active', 'suspended')
  );
$$;

revoke all on function public.is_coach_for_client_visible(uuid) from public, anon;
grant execute on function public.is_coach_for_client_visible(uuid) to authenticated;

drop policy if exists profiles_coach_reads_own_clients on public.profiles;
create policy profiles_coach_reads_own_clients on public.profiles
  for select using (public.is_coach_for_client_visible(id));

drop policy if exists client_profiles_coach_for_client on public.client_profiles;
create policy client_profiles_coach_for_client on public.client_profiles
  for all using (public.is_coach_for_client_visible(user_id)) with check (public.is_coach_for_client_visible(user_id));

notify pgrst, 'reload schema';
