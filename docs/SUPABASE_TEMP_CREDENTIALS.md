# Credenziali provvisorie via email — Edge Function `send-temporary-credentials`

Feature: il coach preme "Invia via email" sulla scheda di un cliente (`mobile/src/app/clienti/[id].tsx`) per fargli avere una nuova password provvisoria via email, senza che il coach la veda mai e senza che venga mai generata o gestita dal client mobile.

## Architettura

```
mobile (coach loggato)
  -> supabase.functions.invoke('send-temporary-credentials', { body: { userId, email, role } })
     (Authorization: Bearer <JWT del coach>, allegato automaticamente da supabase-js)
  -> Edge Function (Deno, service_role key SOLO qui, mai nel bundle mobile)
     1. verifica il JWT del chiamante (supabaseAdmin.auth.getUser)
     2. verifica che il chiamante sia il coach proprietario del cliente
        (coach_clients) oppure un superadmin
     3. rilegge email/ruolo del TARGET da public.profiles (mai dal body)
     4. genera una password random (crypto.getRandomValues, mai nel client)
     5. supabaseAdmin.auth.admin.updateUserById(target, { password })
     6. profiles.must_change_password = true per il target
     7. invia l'email con Brevo (https://api.brevo.com/v3/smtp/email)
  -> risponde solo { ok: true } o { ok: false, code, message } — MAI la password
```

Al primo login successivo, `signInWithEmail` (`mobile/src/lib/auth-service.ts`) rilegge `must_change_password` da `profiles` e lo salva in `useAuthStore.mustChangePasswordSupabase`; `auth-gate.tsx` blocca l'accesso normale e mostra `SupabaseChangePasswordScreen` finche' l'utente non imposta una password propria (`completePasswordChange`, che chiama `updatePassword` reale + azzera il flag).

Questo flag e' distinto dal `ClientAccount.mustChangePassword` locale (demo, AsyncStorage, usato da `ChangePasswordScreen`/"Genera credenziali di accesso"): quel meccanismo resta invariato e continua a funzionare solo per clienti aggiunti manualmente senza un vero account Supabase.

## SQL da eseguire

Gia' incluso in `docs/SUPABASE_SCHEMA.sql` (sezione "Credenziali provvisorie via email", vicino alla fine del file): aggiunge la colonna `must_change_password` a `public.profiles` in modo idempotente (`alter table ... add column if not exists`) e forza il reload dello schema PostgREST. Nessuna nuova policy: `profiles_self_update` (gia' esistente) copre gia' la scrittura di questo campo da parte dell'utente stesso a fine cambio password.

Esegui (o ri-esegui) l'intero `docs/SUPABASE_SCHEMA.sql` nel SQL editor del progetto Supabase, oppure isola ed esegui solo il blocco descritto sopra se il resto e' gia' aggiornato.

## Deploy della Edge Function

Codice: `supabase/functions/send-temporary-credentials/index.ts`.

Richiede il [Supabase CLI](https://supabase.com/docs/guides/cli) installato localmente (non presente in questo ambiente di sviluppo):

```bash
supabase login
supabase link --project-ref <il-tuo-project-ref>
supabase functions deploy send-temporary-credentials
```

### Variabili d'ambiente richieste

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **automatiche**, iniettate dal runtime delle Edge Function. Non vanno impostate a mano e NON devono mai comparire in `mobile/.env` o in qualsiasi file del bundle mobile.
- `BREVO_API_KEY` — **obbligatoria**, chiave API di [Brevo](https://app.brevo.com/settings/keys/api) (piano gratuito sufficiente per iniziare) usata per inviare l'email. Senza questa variabile la function risponde sempre `email_failed`.
- `BREVO_SENDER_EMAIL` — **obbligatoria**, indirizzo mittente verificato/autenticato sul tuo account Brevo (Impostazioni → Mittenti, Domini e Dediche): Brevo rifiuta l'invio se il mittente non è verificato. Senza questa variabile la function risponde sempre `email_failed`.
- `BREVO_SENDER_NAME` — opzionale. Nome mittente mostrato al destinatario. Se assente usa `FitCoach`.

```bash
supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxx
supabase secrets set BREVO_SENDER_EMAIL=credenziali@tuodominio.it
supabase secrets set BREVO_SENDER_NAME="FitCoach"
```

## Come testare con un cliente reale

1. Esegui `docs/SUPABASE_SCHEMA.sql` (o solo la sezione nuova) sul progetto Supabase reale.
2. Deploya la Edge Function e imposta `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` (vedi sopra) — il mittente deve essere verificato sull'account Brevo, altrimenti l'invio fallisce con `email_failed`.
3. Nell'app, come coach, apri un cliente che si e' **registrato davvero su Supabase** (via `/registrazione-cliente` con un codice coach — un cliente aggiunto solo localmente con "Nuovo cliente" non ha un account Supabase e la function rispondera' con un errore chiaro, non con un falso successo).
4. Genera le credenziali locali se non esistono ancora ("Genera credenziali di accesso"), poi premi "Invia via email".
5. Verifica: stato "Invio..." sul bottone, poi messaggio di successo o errore leggibile sotto il bottone.
6. Controlla che l'email sia arrivata all'indirizzo reale del cliente (oggetto "Le tue credenziali FitCoach"), con la password provvisoria in chiaro solo li'.
7. Fai logout, prova ad accedere con quel cliente usando la password provvisoria ricevuta via email: deve apparire subito la schermata "Cambia password" (`SupabaseChangePasswordScreen`), che blocca l'accesso alle tab.
8. Imposta una nuova password: l'accesso normale deve sbloccarsi.
9. Fai logout e login di nuovo con la nuova password: la schermata di cambio password non deve piu' ricomparire.
10. Verifica in `public.profiles` che `must_change_password` sia tornato `false` per quell'utente.

> Se l'app mostra `email_failed`: lo status HTTP e il corpo della risposta di Brevo vengono loggati (`console.error('BREVO_SEND_FAILED', status, body)`) — visibili in Dashboard Supabase → Edge Functions → `send-temporary-credentials` → Logs. Cause tipiche: mittente non verificato su Brevo, `BREVO_API_KEY` errata/scaduta, piano gratuito Brevo con limite giornaliero esaurito.

## Sicurezza — cosa e' garantito

- La `service_role` key non e' mai nel codice mobile: vive solo nell'ambiente della Edge Function.
- La password provvisoria e' generata solo lato server (Deno `crypto.getRandomValues`), mai nel client, mai loggata, mai restituita nella risposta HTTP (successo o errore).
- L'indirizzo email di destinazione e il ruolo del target vengono sempre riletti da `public.profiles` lato server: il body della richiesta (`email`/`role`) e' solo informativo, non e' la fonte di verita', per evitare che un chiamante autorizzato dirotti la password di un altro account verso un indirizzo a piacere.
- Solo il coach proprietario del cliente (verificato via `coach_clients`) o un superadmin possono richiedere il reset.

## Limiti noti / cosa NON e' stato fatto

- Nessuna UI per generare/inviare credenziali a un coach (solo il flusso lato cliente, l'unico bottone "Invia via email" esistente nel codice). La Edge Function accetta gia' `role: 'coach'` per un riuso futuro senza modifiche.
- Se l'invio email fallisce dopo che la password e' gia' stata cambiata sul server, non esiste un modo per recuperare quella specifica password (mai restituita al client per scelta di sicurezza): l'unica via e' premere di nuovo "Invia via email" per generarne e inviarne una nuova.
- Nessun rate limiting applicato lato Edge Function oltre ai controlli di autorizzazione: da valutare se il pulsante viene usato molto frequentemente.
