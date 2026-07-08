# Email Setup (Supabase Auth)

Questo documento spiega cosa configurare su Supabase perche' le email dell'app (coach e cliente) partano davvero. Il codice mobile non invia email autonomamente: usa esclusivamente `supabase.auth.signUp` / `supabase.auth.resetPasswordForEmail`, ed e' Supabase (o l'SMTP che gli colleghi) a spedirle. Fino a quando `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` non sono impostate, **nessuna email reale parte**: l'app resta sul login/registrazione locale (vedi `docs/DECISIONS.md`).

## Email che Supabase Auth invia gia' con questo collegamento

1. **Conferma registrazione** — inviata automaticamente da `supabase.auth.signUp` sia per `signUpCoach` sia per `signUpClientWithCoachCode` (`mobile/src/lib/auth-service.ts`). Con "Confirm email" attivo, l'utente deve cliccare il link prima di poter accedere.
2. **Reset password** — la UI del link "Password dimenticata" in `login-screen.tsx` e' oggi disabilitata (`disabled`, nessun comportamento nascosto). Il collegamento a `supabase.auth.resetPasswordForEmail(email)` non e' stato ancora fatto in questa fase: quando verra' attivato, questa email partira' allo stesso modo.
3. **Invito/registrazione cliente** — oggi il cliente si registra da solo con codice coach (nessun invito email dal coach). Se in futuro il coach dovesse invitare un cliente per email, andrebbe usato `supabase.auth.admin.inviteUserByEmail` (richiede service role, quindi un Edge Function/backend, non il client anon key) — non implementato in questa fase.
4. **Conferma cambio email** — se un domani si aggiunge un flusso "cambia email" con `supabase.auth.updateUser({ email })`, Supabase invia in automatico l'email di conferma sul nuovo indirizzo.

## Cosa configurare su Supabase (dashboard del progetto)

1. **Authentication → URL Configuration**: impostare `Site URL` e i redirect consentiti (per Expo Go/dev in genere lo scheme dell'app, es. `mobile://`, oppure `http://localhost:8081` per il preview web). Senza questo i link nelle email non tornano nell'app.
2. **Authentication → Providers → Email**:
   - Decidere se tenere `Confirm email` attivo (consigliato) o disattivarlo (l'utente entra subito senza verificare l'indirizzo — piu' comodo in test, meno sicuro in produzione).
   - Verificare i rate limit di invio email di default (bassi sul piano free Supabase): utili solo per test, non per produzione con molti utenti.
3. **Authentication → Email Templates**: personalizzare (facoltativo in questa fase, non richiesto ora) i template "Confirm signup", "Reset password", "Magic Link", "Change email address". Di default usano il dominio email di Supabase.
4. **SMTP personalizzato (consigliato prima di andare in produzione)**: Authentication → Settings → SMTP Settings, collegando un provider reale (es. Resend, Postmark, SendGrid) con dominio verificato (SPF/DKIM). Il default di Supabase ha limiti di invio e non e' pensato per produzione.
5. **Confermare i redirect per ruolo**: dopo il click sul link di conferma o reset, l'utente rientra in app; la logica di redirect per ruolo (coach `/`, cliente `/cliente-home`, superadmin `/superadmin`) e' gia' gestita da `AuthGate` (`mobile/src/components/auth-gate.tsx`) lato stato locale — il collegamento diretto tra redirect email e deep link nativo va verificato quando si attiva `resetPasswordForEmail`/conferma reale su device.

## Cosa NON e' ancora fatto (onesto, non implementato)

- Nessun template email personalizzato per FitCoach Pro (restano quelli default Supabase).
- "Password dimenticata" resta disabilitato in UI: non e' collegato a `resetPasswordForEmail`.
- Nessun invito email lato coach verso cliente (solo registrazione cliente con codice).
- Nessun SMTP esterno collegato: dipende dal dominio/provider scelto dall'utente su un progetto Supabase reale.
