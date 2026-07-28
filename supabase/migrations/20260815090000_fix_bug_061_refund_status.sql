-- fix: BUG-061 (parte 1/2) — estende additivamente user_subscriptions.status
-- per distinguere un abbonamento rimborsato da uno semplicemente scaduto/
-- disdetto. Nessuna riga esistente toccata (solo ALLARGAMENTO del CHECK,
-- stesso pattern additivo gia' usato in tutte le estensioni CHECK di questo
-- progetto — mai un restringimento, mai una riga reale modificata).
alter table public.user_subscriptions drop constraint user_subscriptions_status_check;
alter table public.user_subscriptions add constraint user_subscriptions_status_check
  check (status = any (array['pending','active','expired','canceled','refunded']::text[]));

comment on column public.user_subscriptions.status is
  'active = accesso valido; pending = in attesa (es. billing issue); expired = scaduto naturalmente; canceled = disdetto dall''utente (accesso valido fino a expires_at); refunded = rimborsato (accesso revocato immediatamente, indipendentemente da expires_at — vedi supabase/functions/revenuecat-webhook).';
