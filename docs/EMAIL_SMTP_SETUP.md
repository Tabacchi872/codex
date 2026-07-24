# Configurazione SMTP e produzione — email FitCoach

Audit dell'invio email attuale e checklist per Luigi prima di considerare le
email FitCoach pronte per la produzione. Nessuna credenziale reale è scritta
in questo file. Nessuna modifica a DNS o Dashboard esterne è stata eseguita
da questo lavoro: solo audit e documentazione.

## Audit dell'invio attuale

| Aspetto | Stato attuale |
|---|---|
| Provider | **Brevo** (`https://api.brevo.com/v3/smtp/email`), usato solo da `supabase/functions/send-temporary-credentials`. Migrato da Resend il 2026-07-12 (vedi `docs/WORKLOG.md`) |
| Mittente | Nome: `BREVO_SENDER_NAME` (default `FitCoach` se assente) — indirizzo: `BREVO_SENDER_EMAIL`, deve essere verificato sull'account Brevo |
| Dominio verificato | Non noto da questo repository (dipende dall'account Brevo configurato da Luigi) |
| Reply-To | **Non impostato** oggi — le risposte a queste email non hanno una destinazione dedicata |
| Secret richieste | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (opzionale) — vedi `docs/SUPABASE_TEMP_CREDENTIALS.md` |
| Piano/limiti | Documentato in `SUPABASE_TEMP_CREDENTIALS.md`: piano gratuito Brevo con limite giornaliero di invii — se esaurito, l'invio fallisce con un errore leggibile (`BREVO_SEND_FAILED`, loggato solo con status/body, mai con dati sensibili) |
| Gestione errori | Presente: risposta non-2xx da Brevo → errore restituito al chiamante, nessun falso successo, nessuna password/link esposto nei log |
| Retry | **Non implementato** — un fallimento richiede che il coach/superadmin ripeta manualmente l'azione "Invia via email" |
| Gestione bounce | Non gestita da questo repository (dipende dalla configurazione Brevo, es. webhook di bounce non collegati) |
| SPF/DKIM/DMARC | Dipende interamente dal dominio mittente configurato su Brevo — non verificabile/impostabile da questo repository (DNS esterno) |
| Email Supabase Auth (Confirm signup, Reset Password) | Inviate dal mailer di default Supabase, **non** da Brevo — nessun SMTP personalizzato collegato oggi (dichiarato esplicitamente in `docs/EMAIL_SETUP.md`) |

## Checklist per Luigi (nessuna azione eseguita da questo lavoro)

### Identità mittente
- [ ] Nome mittente consigliato: **FitCoach** (coerente con il brand usato
      nei template — vedi `docs/email-templates/`).
- [ ] Indirizzo mittente professionale (es. `no-reply@ilTuoDominio.it`),
      non un indirizzo gratuito generico.
- [ ] Dominio verificato su Brevo (Settings → Senders & IP → Domains).
- [ ] Impostare un `Reply-To` dedicato (es. `assistenza@ilTuoDominio.it`)
      se si vuole permettere risposte reali — oggi assente.

### SMTP personalizzato Supabase Auth
- [ ] Valutare di collegare un SMTP personalizzato (Authentication →
      Emails → SMTP Settings) così anche Confirm signup/Reset Password
      partono dal dominio verificato invece del mailer di default Supabase
      (rate limit più bassi, meno affidabile per produzione — già segnalato
      in `docs/EMAIL_SETUP.md`).

### DNS (nessuna modifica eseguita qui — solo checklist)
- [ ] **SPF**: record TXT che autorizza il dominio del provider (Brevo/SMTP
      Supabase) a inviare per conto del dominio mittente.
- [ ] **DKIM**: chiave pubblica pubblicata come record DNS, firma privata
      configurata lato provider.
- [ ] **DMARC**: policy pubblicata (almeno `p=none` per monitorare, poi
      `p=quarantine`/`p=reject` una volta verificato che i legittimi invii
      passino SPF/DKIM).

### Tracking link
- [ ] Disattivare il **click-tracking**/**open-tracking** del provider SMTP
      sui link di autenticazione (Supabase Confirm/Reset) e su qualunque
      link generato da `auth.admin.generateLink` (l'email credenziali
      cliente): un link riscritto dal tracking del provider non è più lo
      stesso URL firmato da Supabase e può invalidare il flusso o esporre
      il link reale in log di terze parti. Verificare questa impostazione
      sia sull'account Brevo sia su un eventuale SMTP personalizzato
      Supabase.

### Test manuali da eseguire (con account di TEST, mai reali)
- [ ] **Gmail**: verificare rendering, nessun clipping, pulsanti cliccabili.
- [ ] **Outlook** (desktop, motore Word): verificare che il layout a
      tabelle non si rompa, bottone comunque cliccabile anche se gli angoli
      arrotondati non renderizzano.
- [ ] **iCloud/Apple Mail** (desktop e iOS): verificare dark mode (nessun
      testo invisibile, grazie al `color-scheme: light` forzato).
- [ ] **Test spam**: verificare che le email non finiscano in spam (dipende
      da SPF/DKIM/DMARC configurati correttamente, reputazione del dominio).
- [ ] **Test link scaduto**: aprire un link di conferma/reset già usato o
      scaduto e verificare il comportamento (esistente, non modificato da
      questo lavoro) invece di un errore criptico.

## Cosa NON fare

- Non modificare DNS o Dashboard esterne da questo repository/agente.
- Non inserire credenziali reali (API key, password SMTP) in nessun file
  versionato — solo nomi delle variabili d'ambiente/secret.
- Non disattivare "Confirm email" su Supabase per aggirare i test.
