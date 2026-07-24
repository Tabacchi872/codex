# Accesso cliente via link monouso — Edge Function `send-temporary-credentials`

**Aggiornamento 2026-07-24**: questa feature non genera più una password
provvisoria in chiaro. Il coach preme "Invia via email" sulla scheda di un
cliente (`mobile/src/app/clienti/[id].tsx`) per fargli avere un **link
monouso reale** via email: il cliente imposta da sé la propria password
aprendo il link, con lo stesso meccanismo già usato da "Password
dimenticata" (`forgot-password-screen.tsx` + `reset-password-screen.tsx`).
Nessuna password transita mai per questa funzione né viene generata sul
client mobile. Il nome della Edge Function (`send-temporary-credentials`,
sia la cartella sia la stringa invocata da `supabase.functions.invoke`) resta
invariato per non dover ricollegare/ridocumentare ogni riferimento esistente:
è cambiato solo il comportamento interno.

## Architettura

```
mobile (coach loggato)
  -> supabase.functions.invoke('send-temporary-credentials', {
       body: { userId, email, role, redirectTo }
     })
     (Authorization: Bearer <JWT del coach>, allegato automaticamente da supabase-js;
      redirectTo = getWebRedirectUrl('/reimposta-password'), dinamico per porta/ambiente su web)
  -> Edge Function (Deno, service_role key SOLO qui, mai nel bundle mobile)
     1. verifica il JWT del chiamante (supabaseAdmin.auth.getUser)
     2. verifica che il chiamante sia il coach proprietario del cliente
        (coach_clients) oppure un superadmin
     3. rilegge email/ruolo del TARGET da public.profiles (mai dal body)
     4. supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
        — nessuna password generata/impostata, il target resta l'utente GIA' esistente
     5. invia l'email (design system FitCoach, supabase/functions/_shared/email-template.ts)
        con Brevo (https://api.brevo.com/v3/smtp/email), bottone "Imposta la tua password"
        verso l'action_link generato al punto 4
  -> risponde solo { ok: true } o { ok: false, code, message }
```

Il cliente clicca il link, arriva su `/reimposta-password` (schermata già
esistente, gestisce sia il formato `#access_token=...&type=recovery` sia
`?token_hash=...&type=recovery`, invariata da questo lavoro), imposta la sua
password reale. Da quel momento in poi il login è normale: **non viene
impostato `profiles.must_change_password`** per questo flusso (non esiste
più una password insicura da forzare a cambiare — il cliente ha scelto la
propria password direttamente).

> Questo flag resta comunque letto/rispettato per account che avessero
> ricevuto in passato l'email col vecchio comportamento (password in
> chiaro): `auth-gate.tsx` continua a bloccare l'accesso con
> `SupabaseChangePasswordScreen` se `must_change_password=true` è già
> presente su un profilo, indipendentemente da questa modifica.

Questo flusso è distinto dal `ClientAccount.temporaryPassword` locale (demo,
AsyncStorage, mostrato nella stessa schermata sotto "Copia
credenziali"/"Condividi credenziali"): quel meccanismo resta invariato,
continua a mostrare una password locale per clienti aggiunti manualmente
senza un vero account Supabase, **non è collegato in alcun modo** a questa
Edge Function.

## Nessun SQL nuovo da eseguire

A differenza della versione precedente di questa feature, non serve alcuna
colonna aggiuntiva: `profiles.must_change_password` (già esistente) non
viene più scritta da questa funzione. Nessuna migration nuova, nessuna
modifica allo schema.

## Deploy della Edge Function

Codice: `supabase/functions/send-temporary-credentials/index.ts` (importa
`supabase/functions/_shared/email-template.ts`, deployare entrambi i file —
`supabase functions deploy` include automaticamente `_shared/` se referenziato
con un import relativo, comportamento standard Supabase).

Richiede il [Supabase CLI](https://supabase.com/docs/guides/cli) installato
localmente (non presente in questo ambiente di sviluppo):

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

### Importante — Redirect URLs

`generateLink` con `redirectTo` funziona solo se l'origin/porta usata rientra
tra le **Redirect URLs** configurate su Supabase (Authentication → URL
Configuration) — esattamente lo stesso requisito già documentato per
"Password dimenticata" in `docs/EMAIL_SETUP.md`. Se l'origin non è in lista,
Supabase ignora silenziosamente `redirectTo` e il link userà la Site URL di
default.

## Come testare con un cliente reale

1. Deploya la Edge Function (con `_shared/email-template.ts`) e imposta `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` (vedi sopra) — il mittente deve essere verificato sull'account Brevo, altrimenti l'invio fallisce con `email_failed`.
2. Nell'app, come coach, apri un cliente che si è **registrato davvero su Supabase** (via `/registrazione-cliente` con un codice coach — un cliente aggiunto solo localmente con "Nuovo cliente" non ha un account Supabase e la function risponderà con un errore chiaro, non con un falso successo).
3. Premi "Invia via email".
4. Verifica: stato "Invio..." sul bottone, poi messaggio "Email inviata: il cliente potrà impostare la password dal link ricevuto..." o errore leggibile.
5. Controlla che l'email sia arrivata all'indirizzo reale del cliente (oggetto "Il tuo account FitCoach è pronto", layout FitCoach) — **nessuna password visibile nell'email**.
6. Clicca il bottone "Imposta la tua password": deve arrivare su `/reimposta-password` con il form attivo (comportamento identico a "Password dimenticata").
7. Imposta una nuova password, verifica il messaggio di conferma, poi fai login con quella password: deve funzionare normalmente, **senza** passare dalla schermata "Cambia password" obbligata (comportamento nuovo, corretto: non esiste più una password insicura da forzare a cambiare).
8. Ripeti il test su web con una porta diversa da quella di default, per confermare che il redirect dinamico funzioni su qualunque porta locale in "Redirect URLs".

> Se l'app mostra `email_failed`: lo status HTTP e il corpo della risposta di Brevo vengono loggati (`console.error('BREVO_SEND_FAILED', status, body)`) — visibili in Dashboard Supabase → Edge Functions → `send-temporary-credentials` → Logs. Cause tipiche: mittente non verificato su Brevo, `BREVO_API_KEY` errata/scaduta, piano gratuito Brevo con limite giornaliero esaurito.
> Se l'app mostra `generate_link_failed`: verifica che l'email del cliente corrisponda esattamente a un utente Supabase Auth esistente (rilettura sempre da `public.profiles`, mai dal body).

## Sicurezza — cosa è garantito

- La `service_role` key non è mai nel codice mobile: vive solo nell'ambiente della Edge Function.
- **Nessuna password è mai generata, impostata o vista da questa funzione** — sostituisce la password provvisoria in chiaro con un link monouso reale di Supabase.
- L'indirizzo email di destinazione e il ruolo del target vengono sempre riletti da `public.profiles` lato server: il body della richiesta (`email`/`role`) è solo informativo, non è la fonte di verità, per evitare che un chiamante autorizzato dirotti il link di accesso di un altro account verso un indirizzo a piacere.
- Solo il coach proprietario del cliente (verificato via `coach_clients`) o un superadmin possono richiedere l'invio.
- Tutti i valori dinamici nell'email (nome cliente/coach) passano da `escapeHtml` (`supabase/functions/_shared/email-template.ts`), l'URL del bottone passa da `safeUrl` (solo `https://`).

## Limiti noti / cosa NON è stato fatto

- Nessuna UI per generare/inviare il link a un coach (solo il flusso lato cliente, l'unico bottone "Invia via email" esistente nel codice). La Edge Function accetta già `role: 'coach'` per un riuso futuro senza modifiche.
- Nessun rate limiting applicato lato Edge Function oltre ai controlli di autorizzazione: da valutare se il pulsante viene usato molto frequentemente.
- **Non verificato con un invio email reale in questo ambiente** (nessun tool di invio/browser disponibile) — vedi checklist di test in `docs/TODO_NEXT.md`.
