# Email Setup (Supabase Auth)

Questo documento spiega cosa configurare su Supabase perche' le email dell'app (coach e cliente) partano davvero, e come sono collegati nel codice i tre flussi email: conferma registrazione, password dimenticata, reset password. Il codice mobile non invia mai email autonomamente: usa esclusivamente `supabase.auth.signUp`, `supabase.auth.resetPasswordForEmail` e `supabase.auth.updateUser` (`mobile/src/lib/auth-service.ts`); e' Supabase (o l'SMTP che gli colleghi) a spedirle. Fino a quando `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` non sono impostate, **nessuna email reale parte**: l'app resta sul login/registrazione locale (vedi `docs/DECISIONS.md`).

## Flusso 1 — Conferma registrazione

- `signUpCoach`/`signUpClientWithCoachCode` (`mobile/src/lib/auth-service.ts`) chiamano `supabase.auth.signUp`, che invia l'email di conferma da solo se "Confirm email" e' attivo.
- Con "Confirm email" attivo, `data.session` torna `null` finche' l'utente non clicca il link: **la UI non finge piu' che l'utente sia attivo**.
  - Coach (`registration-screens.tsx`, `CoachRegistrationScreen`): se `session` e' `null`, il codice coach **non esiste ancora** (nessuna sessione per scriverlo, vedi sotto) — la schermata mostra "Controlla la tua email", il codice comparira' al primo login reale, dopo la conferma. Se `session` esiste gia' (Confirm email disattivato), il comportamento resta quello di sempre: codice mostrato subito.
  - Cliente (`ClientRegistrationScreen`): se `session` e' `null`, **non** fa piu' login automatico ne' scrive il mirror locale — mostra una schermata dedicata "Controlla la tua email" con pulsante "Torna al login". Il profilo cliente locale viene ricostruito al primo login reale (vedi `loadClientProfile`).
- Login (`login-screen.tsx`): se Supabase risponde con errore "email not confirmed", `auth-service.ts` lo mappa nel codice `email_not_confirmed` e la UI mostra un messaggio dedicato ("Email non ancora confermata...") invece di ricadere sui controlli locali/demo con un generico "Credenziali non valide".
- Dopo la conferma (click sul link), l'utente fa login normalmente con `signInWithEmail`, che ora completa anche l'onboarding rimasto in sospeso (vedi sezione dedicata sotto) prima di entrare nell'app.

## Onboarding coach/cliente al primo login reale (fix 2026-07-10, BUG-008)

Con "Confirm email" attivo, al momento di `signUp` non esiste ancora nessuna sessione autenticata: `coach_profiles`/`billing_profiles`/`registration_codes` (coach) e `client_profiles`/`coach_clients` (cliente) non possono essere scritti subito (le policy RLS richiedono `auth.uid()`, che senza sessione e' `null` — l'insert viene rifiutato). Per non perdere i dati che l'utente ha gia' inserito nella form:

- `signUpCoach` salva `business_name`/`billing_profile` (l'intero form di fatturazione) in `user_metadata` al momento di `signUp`. Se la sessione esiste gia', scrive subito le tabelle come prima; altrimenti si ferma li'.
- `signUpClientWithCoachCode` salva `coach_id`/`coach_code` in `user_metadata`. Stesso comportamento condizionale.
- `signInWithEmail` (`login-screen.tsx`, dopo un login riuscito) chiama `ensureCoachOnboarding`/`ensureClientOnboarding` (`auth-service.ts`), che rileggono quei dati da `user_metadata` e completano gli insert mancanti — **senza richiedere di nuovo nulla all'utente**. Sono idempotenti: se le righe esistono gia' non fanno nulla.
- `profiles` (creata dal trigger `handle_new_user`, indipendente dalla sessione) ha in piu' un fallback: se manca ancora, `signInWithEmail`/`ensureProfileForCurrentUser` la ricreano dal client autenticato usando `role`/`full_name` da `user_metadata` — richiede le policy `profiles_self_insert`/`profiles_self_update` (vedi snippet SQL sotto).
- **Limite noto**: account registrati PRIMA di questo fix (senza `billing_profile`/`coach_id` in `user_metadata`) non vengono riparati automaticamente — vanno sistemati a mano su Supabase o registrati di nuovo.

## Flusso 2 — Password dimenticata

- Login → "Password dimenticata?" ora e' collegato (non piu' disabilitato) e porta a `/password-dimenticata` (`mobile/src/components/forgot-password-screen.tsx`).
- L'utente inserisce l'email → l'app chiama `requestPasswordReset(email, redirectTo)` (`auth-service.ts`), che chiama `supabase.auth.resetPasswordForEmail`.
- Il messaggio mostrato ("Ti abbiamo inviato un'email per reimpostare la password.") e' sempre lo stesso, che l'email esista o meno: e' il comportamento di default di Supabase, per non rivelare quali email sono registrate.
- Nessuna email manuale dall'app, nessuna secret key nel client: solo la anon key, gia' usata ovunque.
- Se Supabase non e' configurato, non c'e' un fallback locale (non e' mai esistita una funzione di reset password demo): viene mostrato l'errore "Supabase non e' configurato..." restituito da `auth-service.ts`, senza crash.

## Flusso 3 — Reset password

- Il link nell'email di Supabase riporta l'utente su `redirectTo` (vedi sotto) con un frammento `#access_token=...&type=recovery` nell'URL.
- `mobile/src/lib/supabase.ts`: `detectSessionInUrl` e' ora attivo solo su web (`Platform.OS === 'web'`) — legge quel frammento e stabilisce automaticamente una sessione di recovery prima che la UI monti. Su nativo resta disattivato (deep link nativo non gestito in questa fase, vedi sotto).
- Route `/reimposta-password` (`mobile/src/components/reset-password-screen.tsx`): aspetta che compaia la sessione di recovery (evento `PASSWORD_RECOVERY` o `getSession()`), poi mostra il form nuova password + conferma. Se non arriva nessuna sessione entro ~1.5s, mostra "Link non valido o scaduto" con pulsante per richiederne uno nuovo.
- Conferma la nuova password chiamando `updatePassword(newPassword)` → `supabase.auth.updateUser({ password })`.
- Dopo il salvataggio mostra "Password aggiornata", poi il pulsante "Torna al login" fa `signOut()` e riporta a `/` — l'utente rientra facendo login esplicito con la nuova password (nessuna sessione residua lasciata attiva silenziosamente).

## Redirect URL (Expo Web)

- `mobile/src/lib/redirect-url.ts` (`getWebRedirectUrl(path)`) costruisce il redirect con `window.location.origin` **solo su web**, quindi funziona su qualunque porta locale (`http://localhost:8081`, `8082`, `8084`, ecc.) senza hardcodarne una.
- Su nativo (Expo Go) la funzione ritorna `undefined`: Supabase usa allora la `Site URL` configurata nel progetto. Il deep link nativo (scheme `mobile://`, vedi `app.json`) per riportare l'utente dentro l'app da un link email non e' stato implementato in questa fase — resta un limite noto (vedi `docs/BUGS.md`/`docs/TODO_NEXT.md`).

## Cosa configurare su Supabase (dashboard del progetto)

1. **Authentication → URL Configuration**:
   - `Site URL`: l'URL principale di sviluppo, es. `http://localhost:8081` (o la porta che usi piu' spesso).
   - `Redirect URLs`: aggiungi **tutte** le porte locali che usi per `expo start --web`, una per riga, con wildcard sul path per coprire `/reimposta-password`:
     - `http://localhost:8081/**`
     - `http://localhost:8082/**`
     - `http://localhost:8084/**`
   - Senza questo, Supabase rifiuta il `redirectTo` passato da `resetPasswordForEmail` e i link nelle email non tornano nell'app.
2. **Authentication → Providers → Email**:
   - Tenere `Confirm email` **attivo** (comportamento gestito onestamente ora sia in registrazione sia in login, vedi Flusso 1).
   - Verificare i rate limit di invio email di default (bassi sul piano free Supabase): utili solo per test, non per produzione con molti utenti.
3. **Authentication → Email Templates** — modificare questi due template (gli altri non servono in questa fase):
   - **Confirm signup**: template per la conferma registrazione (Flusso 1). Deve contenere il link con `{{ .ConfirmationURL }}`.
   - **Reset password**: template per il reset password (Flussi 2-3). Deve contenere il link con `{{ .ConfirmationURL }}`.
   - `{{ .ConfirmationURL }}` e' la variabile obbligatoria in entrambi i template: e' il link che, se rimosso o rinominato, rompe il flusso (l'utente non ha modo di confermare l'account o reimpostare la password).
4. **SMTP personalizzato (consigliato prima di andare in produzione, non fatto ora)**: Authentication → Settings → SMTP Settings, collegando un provider reale (es. Resend, Postmark, SendGrid) con dominio verificato (SPF/DKIM). Il default di Supabase ha limiti di invio e non e' pensato per produzione. **Non collegato in questa fase, per scelta esplicita.**
5. **SQL Editor — rieseguire questo snippet dopo l'aggiornamento del 2026-07-10** (fix BUG-008, `docs/SUPABASE_SCHEMA.sql`), anche se lo schema era gia' stato eseguito in precedenza: e' pensato per essere rieseguibile senza errori (drop-if-exists sulle policy nuove, `create or replace` sulla funzione).

   ```sql
   create or replace function public.handle_new_user()
   returns trigger
   language plpgsql
   security definer
   set search_path = public
   as $$
   begin
     insert into public.profiles (id, role, full_name, email, phone, is_active)
     values (
       new.id,
       coalesce(new.raw_user_meta_data->>'role', 'cliente'),
       new.raw_user_meta_data->>'full_name',
       new.email,
       new.raw_user_meta_data->>'phone',
       true
     )
     on conflict (id) do update set
       email = excluded.email,
       full_name = coalesce(excluded.full_name, public.profiles.full_name);
     return new;
   exception
     when others then
       raise warning 'handle_new_user fallito per user %: %', new.id, sqlerrm;
       return new;
   end;
   $$;

   drop trigger if exists on_auth_user_created on auth.users;
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute function public.handle_new_user();

   drop policy if exists profiles_self_insert on public.profiles;
   create policy profiles_self_insert on public.profiles
     for insert with check (id = auth.uid());
   drop policy if exists profiles_self_update on public.profiles;
   create policy profiles_self_update on public.profiles
     for update using (id = auth.uid()) with check (id = auth.uid());
   ```

   Verifica dopo averlo eseguito: `select * from public.profiles order by created_at desc limit 5;` deve mostrare la riga per l'ultimo utente registrato, anche prima che confermi l'email.

## Come testare da web

1. `npx.cmd expo start --web`, apri `http://localhost:8081` (o la porta assegnata).
2. **Conferma registrazione**: registra un coach o un cliente con un'email reale che puoi controllare. Verifica che compaia il messaggio "Controlla la tua email" (cliente) o la stessa schermata al posto del codice (coach), e che il login prima della conferma dia "Email non ancora confermata...". Clicca il link ricevuto via email, poi rifai login: deve funzionare **e** deve comparire il codice coach (se ti eri registrato come coach). Controlla in Supabase (Table editor) che dopo questo primo login esistano davvero `profiles`, e (coach) `coach_profiles`/`billing_profiles`/`registration_codes`, oppure (cliente) `client_profiles`/`coach_clients`.
3. **Password dimenticata**: da login, "Password dimenticata?" → inserisci l'email di un account gia' confermato → verifica il messaggio di invio e l'arrivo dell'email.
4. **Reset password**: apri il link ricevuto → deve arrivare su `/reimposta-password` con il form attivo (non su "Link non valido"). Imposta una nuova password, salva, verifica il messaggio di conferma, poi fai login con la nuova password.

## Come testare da Expo Go

- Il flusso email dipende da `detectSessionInUrl`, attivo solo su web: **su Expo Go il link di reset password non riporta automaticamente l'app in una sessione di recovery** (nessun deep link nativo configurato in questa fase). Aprire il link dall'email su un dispositivo con Expo Go non fara' funzionare `/reimposta-password` allo stesso modo del web.
- Registrazione/login/conferma via email restano invece testabili: l'email arriva comunque, e dopo aver cliccato il link di conferma (anche da un browser qualsiasi, non serve aprirlo in Expo Go) il login su Expo Go funzionera' normalmente.
- Vedi anche il limite noto di Expo Go su questo progetto in `docs/BUGS.md` (indipendente da questa fase).

## Cosa NON e' ancora fatto (onesto, non implementato)

- Nessun template email personalizzato per FitCoach Pro (restano quelli default Supabase, a parte l'obbligo di avere `{{ .ConfirmationURL }}`).
- Nessun deep link nativo (`mobile://reimposta-password`) per far funzionare il reset password anche da Expo Go/app nativa.
- Nessun invito email lato coach verso cliente (solo registrazione cliente con codice).
- Nessun SMTP esterno collegato: dipende dal dominio/provider scelto dall'utente su un progetto Supabase reale.
- Nessun dominio ufficiale collegato in questa fase (per scelta esplicita).
