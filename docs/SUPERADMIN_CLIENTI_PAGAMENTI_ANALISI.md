# Analisi Superadmin clienti e pagamenti

## Cause identificate

- Il Superadmin vedeva solo coach perche' dashboard, navigazione e schermata principale usavano `useSuperadminCoaches()` e dati demo locali; non esisteva una route primaria `Clienti`.
- La schermata `Piani` mostrava piani commerciali coach interni, ma il nome poteva essere confuso con Client Pro e con i pacchetti acquistabili.
- `Pagamenti` leggeva `paymentEvents` dallo store demo Superadmin, quindi mescolava eventi amministrativi coach e non mostrava pagamenti Client Pro RevenueCat.
- Client Pro viene letto da `subscription_packages` con `target_role='client'`, `user_subscriptions` e `revenuecat_webhook_events`; il prezzo store corrente non e' disponibile dal backend se RevenueCat/Google Play non lo inviano e non viene salvato.

## Architettura dati locale

- `profiles.role='cliente'` identifica i clienti registrati.
- `coach_clients.status='active'` identifica il coach attivo del cliente; assenza di riga attiva = cliente self-guided/senza coach.
- `subscription_packages.target_role='coach'` descrive pacchetti acquistabili dai coach; i piani coach interni della UI restano nello store Superadmin esistente.
- `subscription_packages.target_role='client'` descrive i pacchetti Client Pro configurati per RevenueCat/store.
- `user_subscriptions` conserva stato corrente e storico dell'abbonamento, ma non importo, valuta, store o ambiente in forma strutturata.
- `revenuecat_webhook_events` conserva il payload RevenueCat e, con la nuova migration proposta, colonne normalizzate per product, store, ambiente, transaction id, prezzo, valuta e date evento.
- I programmi automatici sono in `client_fitness_profile`, `client_program_cycles`, `client_program_cycle_plans`, `workout_plans`, `client_monthly_checkins`, `client_cycle_reviews` e `superadmin_program_overrides`.

## RPC aggiunte

- `superadmin_list_clients()`
- `superadmin_get_client_detail(uuid)`
- `superadmin_get_client_pro_summary()`
- `superadmin_get_payments()`
- `superadmin_get_dashboard()`

Tutte sono `SECURITY DEFINER`, `search_path='public'`, controllano `public.is_superadmin()`, revocano `PUBLIC`/`anon` e concedono esecuzione solo a `authenticated`.

## Dati economici RevenueCat

Disponibili oggi:

- `event_id`
- `event_type`
- `app_user_id`
- `product_id`
- `entitlement_id`
- payload JSON completo
- `processed`, `processing_error`, `received_at`, `processed_at`

Normalizzati dalla migration proposta, se presenti nel payload:

- `store`
- `environment`
- `transaction_id`
- `original_transaction_id`
- `price`
- `currency`
- `purchased_at`
- `expiration_at`

Non vanno inventati:

- prezzo corrente Google Play/App Store se non restituito allo store mobile o al webhook;
- incassi coach reali se l'evento di pagamento coach non memorizza importo e valuta;
- incassi Client Pro reali quando l'evento e' sandbox/test o non contiene prezzo/valuta.
