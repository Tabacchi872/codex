# Roadmap migrazione Supabase

Fase 1 prepara schema, tipi, helper e route superadmin senza modificare login demo, store AsyncStorage o UI coach/cliente.

1. Auth Supabase: aggiungere `@supabase/supabase-js`, configurare env Expo, creare session handling parallelo al login demo.
2. Profili e ruoli: collegare `auth.users` a `profiles`, introdurre `superadmin`, `coach`, `cliente` con RLS minima.
3. Clienti: migrare `client-store` verso `profiles`, `coach_clients` e `client_profiles`, mantenendo import/export demo durante transizione.
4. Abbonamenti cliente: migrare gli abbonamenti gestiti dal coach nella tabella `subscriptions`.
5. Schede: portare template, piani, giorni, esercizi e assegnazioni su `workout_*` ed `exercises`.
6. Appuntamenti: spostare agenda su `appointments` con policy coach/cliente.
7. Messaggi realtime: usare `conversations` e `messages` con Supabase Realtime.
8. Push notifications: salvare `push_tokens` e aggiungere funzioni backend per invio notifiche.
9. Billing coach: integrare RevenueCat per mobile, Stripe per web/admin e webhook normalizzati in `payment_events` e `coach_billing`.

Regole di migrazione:

- Non sostituire gli store locali finche ogni area non ha test manuali e rollback.
- Non aggiungere RevenueCat, Stripe o push notification finche auth e ruoli non sono stabili.
- Non bloccare funzioni coach nella demo: il gating resta helper progettuale finche il backend non ritorna entitlements reali.
- Ogni passaggio deve aggiornare RLS, tipi TypeScript e documentazione schema.
