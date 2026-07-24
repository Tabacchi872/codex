# Template email Supabase Auth — FitCoach

> **Questi file sono la fonte versionata dei template.**
> Nei progetti Supabase hosted devono essere **copiati manualmente** in
> Authentication → Emails → Templates. **La loro presenza nel repository non
> modifica automaticamente le email remote.** Nessuna modifica viene
> dichiarata "fatta" finché non è stata incollata a mano nella Dashboard e
> verificata con un invio di test.

Tutti i file condividono lo stesso sistema grafico FitCoach (header "FitCoach
— Il tuo percorso, ogni giorno.", contenitore bianco max 600px, tabelle HTML +
CSS inline, bottone verde `moss`, footer comune con Privacy/Termini) descritto
in `supabase/functions/_shared/email-template.ts` (per le email da codice) e
riprodotto qui in HTML statico (per le email Supabase Auth, che usano un
motore di template Go lato Supabase, non TypeScript).

## Stato di ciascun template

| File | Nome Supabase | Slot Dashboard reale | Usato da questo progetto oggi |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup | Sì | **Sì** — `signUpCoach`/`signUpClientWithCoachCode` |
| `invite-user.html` | Invite user | Sì | No (`inviteUserByEmail` mai chiamato) |
| `reset-password.html` | Reset Password | Sì | **Sì** — `resetPasswordForEmail` (Password dimenticata) |
| `magic-link.html` | Magic Link | Sì | No (`signInWithOtp` mai chiamato) |
| `change-email.html` | Change Email Address | Sì | No (`updateUser({email})` mai chiamato) |
| `reauthentication.html` | Reauthentication | Sì | No (`reauthenticate` mai chiamato) |
| `password-changed.html` | — | **No, nessuno slot Supabase** | No — nessun meccanismo di invio esiste oggi |
| `email-changed.html` | — | **No, nessuno slot Supabase** | No — nessun meccanismo di invio esiste oggi |
| `identity-linked.html` | — | **No, nessuno slot Supabase** | No — nessun meccanismo di invio esiste oggi (nessun provider OAuth in uso) |
| `identity-unlinked.html` | — | **No, nessuno slot Supabase** | No — nessun meccanismo di invio esiste oggi (nessun provider OAuth in uso) |

I primi 6 corrispondono a slot reali di Supabase Auth (Authentication →
Emails → Templates). Gli ultimi 4 **non hanno alcuno slot Dashboard**:
Supabase non invia nativamente notifiche di "password modificata"/"email
modificata"/"metodo di accesso collegato o rimosso" — sono preparati per un
eventuale invio custom futuro (es. un Database Webhook + una Edge Function +
Brevo, stesso pattern di `supabase/functions/send-temporary-credentials`),
non collegato a nulla oggi. Copiarli in una pagina Dashboard non avrebbe
alcun effetto: non esiste un campo dove incollarli.

## Come copiare un template (i 6 con slot reale)

1. Apri il progetto su `supabase.com/dashboard` → **Authentication → Emails
   → Templates**.
2. Seleziona il template corrispondente (vedi tabella sopra).
3. Imposta l'oggetto ("Subject heading") indicato in cima al file HTML.
4. Copia **tutto** il markup a partire da `<!doctype html>` (non il commento
   iniziale, che è solo documentazione per questo repository) e incollalo
   nel campo del corpo email.
5. Salva.
6. Esegui i test elencati in cima al file (sempre con un account di TEST,
   mai un account reale/di produzione).

## Cosa NON è stato toccato

- **Il funzionamento dei link di conferma Supabase non è stato modificato**:
  solo l'aspetto grafico. `{{ .ConfirmationURL }}`/`{{ .Token }}`/
  `{{ .TokenHash }}`/`{{ .NewEmail }}` sono usati esattamente come Supabase
  li genera, mai alterati o ricostruiti manualmente.
- Nessuna Dashboard Supabase è stata modificata da questo lavoro: questi
  file esistono solo nel repository finché qualcuno non li copia a mano.
- `PRIVACY_POLICY_URL`/`TERMS_OF_SERVICE_URL` usati nel footer sono
  **placeholder** (`https://example.com/...`), identici a quelli in
  `mobile/src/constants/app-info.ts` — non URL definitivi. Aggiornarli in
  entrambi i posti quando Luigi pubblicherà le pagine reali.

## Nota tecnica trovata durante l'audit (non corretta in questo lavoro)

`signUpClientWithCoachCode` (`mobile/src/lib/auth-service.ts`, il percorso di
registrazione cliente più usato dell'app) non passa `emailRedirectTo` a
differenza degli altri due flussi di registrazione (`signUpCoach`,
`signUpClient`) — l'email di conferma per un cliente registrato con codice
coach userà sempre la Site URL configurata su Supabase, mai la porta locale
corrente. Segnalato in `docs/BUGS.md`; non corretto qui per non modificare
il funzionamento dei link di conferma (vincolo esplicito di questo task).
