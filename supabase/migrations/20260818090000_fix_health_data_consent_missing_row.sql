-- Fix: record_health_data_consent() falliva sempre con LEGAL_ACCEPTANCE_REQUIRED
-- per qualunque cliente registrato dopo 20260816124000 ("Hotfix: Privacy Policy
-- e Termini... non bloccano piu' registrazione/login"), che ha rimosso l'unico
-- meccanismo che creava una riga user_legal_acceptances (l'INSERT automatico
-- in handle_new_user()) e ha revocato EXECUTE su record_current_legal_acceptance()
-- per authenticated. record_health_data_consent() restava pero' UPDATE-only:
-- senza una riga preesistente non aveva nulla da aggiornare.
--
-- Verificato in produzione (7 clienti su 8 privi di qualunque riga
-- user_legal_acceptances) che il bug non e' isolato a un singolo account.
--
-- Fix minimo, coerente con la decisione di 20260816124000 (termini/privacy
-- non bloccano piu' nulla): NON si inventano terms_accepted_at/
-- privacy_acknowledged_at con timestamp falsi. Questi due campi diventano
-- nullable e restano NULL finche' l'utente non presta un vero consenso
-- specifico (tramite record_current_legal_acceptance(), non toccata qui).
-- Il consenso salute resta un fatto separato e indipendente.
--
-- record_current_legal_acceptance() NON viene riabilitata ad authenticated:
-- nessuna necessita' dimostrata, nessun chiamante nell'app mobile oggi
-- (verificato via grep, zero riferimenti). _has_current_legal_acceptance()/
-- _assert_legal_signup_metadata() sono codice morto (zero chiamanti in tutto
-- il repository, confermato) — lasciate invariate, restano sicure anche con
-- le colonne nullable (IS NOT NULL su un valore NULL restituisce
-- semplicemente false, mai un errore).

alter table public.user_legal_acceptances
  alter column terms_accepted_at drop not null,
  alter column privacy_acknowledged_at drop not null;

create or replace function public.record_health_data_consent()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_user_id := auth.uid();

  insert into public.user_legal_acceptances (
    user_id, terms_version, privacy_version, terms_accepted_at, privacy_acknowledged_at,
    health_data_consent_at, health_data_consent_withdrawn_at
  ) values (
    v_user_id, '1.0', '1.0', null, null, now(), null
  )
  on conflict (user_id, terms_version, privacy_version) do update set
    health_data_consent_at = now(),
    health_data_consent_withdrawn_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- withdraw_health_data_consent() e record_current_legal_acceptance() restano
-- IDENTICHE (nessuna modifica): la prima continua a funzionare invariata non
-- appena una riga con health_data_consent_at non nullo esiste (ora sempre
-- garantito da record_health_data_consent()); la seconda non e' toccata,
-- coerente con la decisione esplicita di non riabilitarla.

do $$
declare
  v_still_not_null_terms boolean;
  v_still_not_null_privacy boolean;
begin
  select (is_nullable = 'NO') into v_still_not_null_terms
  from information_schema.columns
  where table_schema='public' and table_name='user_legal_acceptances' and column_name='terms_accepted_at';

  select (is_nullable = 'NO') into v_still_not_null_privacy
  from information_schema.columns
  where table_schema='public' and table_name='user_legal_acceptances' and column_name='privacy_version';

  if v_still_not_null_terms then
    raise exception 'HEALTH_CONSENT_FIX_GUARD_FAILED: terms_accepted_at ancora NOT NULL dopo ALTER';
  end if;

  -- privacy_version deve restare NOT NULL (parte della chiave/versionamento,
  -- non toccata da questa migration) — la guardia verifica che non sia stata
  -- accidentalmente rilassata insieme alle altre due colonne.
  if not v_still_not_null_privacy then
    raise exception 'HEALTH_CONSENT_FIX_GUARD_FAILED: privacy_version e'' diventata nullable per errore';
  end if;
end $$;

notify pgrst, 'reload schema';
