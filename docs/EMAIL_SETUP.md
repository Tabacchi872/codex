# Email Setup (Supabase Auth)

Questo documento spiega cosa configurare su Supabase perche' le email dell'app (coach e cliente) partano davvero, e come sono collegati nel codice i tre flussi email: conferma registrazione, password dimenticata, reset password. Il codice mobile non invia mai email autonomamente: usa esclusivamente `supabase.auth.signUp`, `supabase.auth.resetPasswordForEmail` e `supabase.auth.updateUser` (`mobile/src/lib/auth-service.ts`); e' Supabase (o l'SMTP che gli colleghi) a spedirle. Fino a quando `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` non sono impostate, **nessuna email reale parte**: l'app resta sul login/registrazione locale (vedi `docs/DECISIONS.md`).

## Flusso 1 — Conferma registrazione

- `signUpCoach`/`signUpClientWithCoachCode` (`mobile/src/lib/auth-service.ts`) chiamano `supabase.auth.signUp`, che invia l'email di conferma da solo se "Confirm email" e' attivo.
- Con "Confirm email" attivo, `data.session` torna `null` finche' l'utente non clicca il link: **la UI non finge piu' che l'utente sia attivo**.
  - Coach (`registration-screens.tsx`, `CoachRegistrationScreen`): se `session` e' `null`, la UI mostra comunque "Controlla la tua email" (non mostra il codice nella risposta di `signUp`, che non lo restituisce senza sessione) — ma il codice **esiste gia' su Supabase** a questo punto, creato dal trigger `handle_new_user` (vedi sotto) indipendentemente dalla conferma; comparira' in UI al primo login reale. Se `session` esiste gia' (Confirm email disattivato), il comportamento resta quello di sempre: codice mostrato subito.
  - Cliente (`ClientRegistrationScreen`): se `session` e' `null`, **non** fa piu' login automatico ne' scrive il mirror locale — mostra una schermata dedicata "Controlla la tua email" con pulsante "Torna al login". Il profilo cliente locale viene ricostruito al primo login reale (vedi `loadClientProfile`).
- Login (`login-screen.tsx`): se Supabase risponde con errore "email not confirmed", `auth-service.ts` lo mappa nel codice `email_not_confirmed` e la UI mostra un messaggio dedicato ("Email non ancora confermata...") invece di ricadere sui controlli locali/demo con un generico "Credenziali non valide".
- Dopo la conferma (click sul link), l'utente fa login normalmente con `signInWithEmail`, che ora completa anche l'onboarding rimasto in sospeso (vedi sezione dedicata sotto) prima di entrare nell'app.

## Onboarding coach/cliente: trigger DB definitivo (aggiornato, sostituisce il fix BUG-008)

Con "Confirm email" attivo, al momento di `signUp` non esiste ancora nessuna sessione autenticata lato client: se `profiles`/`coach_profiles`/`billing_profiles`/`registration_codes`/`client_profiles`/`coach_clients` dovessero essere scritti dal client mobile, le policy RLS (che richiedono `auth.uid()`, `null` senza sessione) li bloccherebbero. La soluzione definitiva non e' piu' lato app ma **lato database**: il trigger `public.handle_new_user()` (vedi `docs/SUPABASE_SCHEMA.sql`) e' `security definer` e scatta `after insert on auth.users`, cioe' **subito alla creazione dell'utente, prima ancora che l'email sia confermata** — non ha bisogno di nessuna sessione perche' bypassa la RLS. Legge tutto da `auth.users.raw_user_meta_data` (i campi passati da `mobile/src/lib/auth-service.ts` in `supabase.auth.signUp({ options: { data: {...} } })`) e crea in un colpo solo:

- **`profiles`** — sempre, per qualunque ruolo (`role`/`full_name`/`phone` da `raw_user_meta_data`).
- Se `role = 'coach'`: **`coach_profiles`** (`business_name`), **`billing_profiles`** (dall'oggetto `billing_profile` inviato da `signUpCoach`, chiavi camelCase: `subjectType`/`legalName`/`vatNumber`/`fiscalCode`/`address`/`postalCode`/`city`/`province`/`country`/`pec`/`sdiCode`/`billingEmail`), **`registration_codes`** (genera un codice `FC-XXXX-XXXX` univoco, stesso alfabeto/formato di `mobile/src/lib/coach-code.ts`).
- Se `role = 'cliente'`: **`client_profiles`** e **`coach_clients`** (da `coach_id`/`coach_code` inviati da `signUpClientWithCoachCode`), con incremento di `registration_codes.used_count` sul codice usato.

Ogni gruppo di insert e' isolato nel proprio blocco `begin/exception` nel trigger: un fallimento su un gruppo (es. `billing_profiles` che viola il check "Italia + P.IVA richiede PEC o SDI") non fa mai rollback di `profiles` gia' scritta ne' impedisce agli altri gruppi di essere tentati.

`mobile/src/lib/auth-service.ts` non e' stato toccato in questo aggiornamento e resta invariato come **rete di sicurezza**, non piu' come percorso primario:

- `signUpCoach`/`signUpClientWithCoachCode` continuano a salvare `billing_profile`/`business_name` e `coach_id`/`coach_code` in `user_metadata`, e a scrivere subito le tabelle se la sessione esiste gia' (comportamento invariato).
- `ensureCoachOnboarding`/`ensureClientOnboarding` (chiamate da `login-screen.tsx` dopo ogni login riuscito) restano e sono idempotenti: controllano se la riga esiste gia' (il trigger l'ha quasi certamente gia' creata) prima di inserirla, quindi non duplicano righe ne' incrementano due volte `used_count`. Servono solo come recupero per i pochi casi in cui il trigger non sia riuscito a scrivere un gruppo specifico (es. dati di fatturazione non validi al momento della registrazione).
- `profiles` ha comunque un secondo fallback: se manca ancora, `signInWithEmail`/`ensureProfileForCurrentUser` la ricreano dal client autenticato — richiede le policy `profiles_self_insert`/`profiles_self_update` (vedi snippet SQL sotto).
- **Limite noto**: account registrati PRIMA di questo trigger (senza `billing_profile`/`coach_id` in `user_metadata`, o con il vecchio trigger che creava solo `profiles`) non vengono riparati automaticamente — vanno sistemati a mano su Supabase o registrati di nuovo.

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
5. **SQL Editor — rieseguire questo snippet (trigger definitivo, sostituisce quello del fix BUG-008 del 2026-07-10)**, anche se lo schema era gia' stato eseguito in precedenza: e' pensato per essere rieseguibile senza errori (`create or replace` sulle funzioni, `drop-if-exists` su trigger/policy). Crea in un colpo solo `profiles` + (coach) `coach_profiles`/`billing_profiles`/`registration_codes` + (cliente) `client_profiles`/`coach_clients`, leggendo da `raw_user_meta_data` — vedi la sezione dedicata sopra e i commenti nel file sorgente `docs/SUPABASE_SCHEMA.sql` per il dettaglio di ogni blocco.

   ```sql
   create or replace function public.random_coach_code_segment()
   returns text
   language sql
   volatile
   as $$
     select string_agg(
       substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1),
       ''
     )
     from generate_series(1, 4);
   $$;

   create or replace function public.handle_new_user()
   returns trigger
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_role text;
     v_billing jsonb;
     v_coach_id uuid;
     v_coach_code text;
     v_candidate text;
     v_attempts int;
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

     v_role := coalesce(new.raw_user_meta_data->>'role', 'cliente');

     if v_role = 'coach' then
       begin
         insert into public.coach_profiles (user_id, business_name, billing_status)
         values (new.id, new.raw_user_meta_data->>'business_name', 'trial')
         on conflict (user_id) do nothing;
       exception
         when others then
           raise warning 'handle_new_user: coach_profiles fallito per user %: %', new.id, sqlerrm;
       end;

       begin
         v_billing := new.raw_user_meta_data->'billing_profile';
         if v_billing is not null and v_billing->>'legalName' is not null and v_billing->>'billingEmail' is not null then
           insert into public.billing_profiles (
             coach_id, subject_type, legal_name, vat_number, fiscal_code, address,
             postal_code, city, province, country, pec, sdi_code, billing_email
           )
           values (
             new.id,
             coalesce(v_billing->>'subjectType', 'private'),
             v_billing->>'legalName',
             nullif(v_billing->>'vatNumber', ''),
             nullif(v_billing->>'fiscalCode', ''),
             nullif(v_billing->>'address', ''),
             nullif(v_billing->>'postalCode', ''),
             nullif(v_billing->>'city', ''),
             nullif(v_billing->>'province', ''),
             coalesce(v_billing->>'country', 'Italia'),
             nullif(v_billing->>'pec', ''),
             nullif(v_billing->>'sdiCode', ''),
             v_billing->>'billingEmail'
           )
           on conflict (coach_id) do nothing;
         end if;
       exception
         when others then
           raise warning 'handle_new_user: billing_profiles fallito per user %: %', new.id, sqlerrm;
       end;

       begin
         if not exists (
           select 1 from public.registration_codes
           where coach_id = new.id and status = 'active'
         ) then
           v_attempts := 0;
           v_candidate := null;
           while v_candidate is null and v_attempts < 5 loop
             v_attempts := v_attempts + 1;
             begin
               insert into public.registration_codes (coach_id, code, status)
               values (
                 new.id,
                 'FC-' || public.random_coach_code_segment() || '-' || public.random_coach_code_segment(),
                 'active'
               )
               returning code into v_candidate;
             exception
               when unique_violation then
                 v_candidate := null;
             end;
           end loop;
         end if;
       exception
         when others then
           raise warning 'handle_new_user: registration_codes fallito per user %: %', new.id, sqlerrm;
       end;

     elsif v_role = 'cliente' then
       begin
         insert into public.client_profiles (user_id)
         values (new.id)
         on conflict (user_id) do nothing;
       exception
         when others then
           raise warning 'handle_new_user: client_profiles fallito per user %: %', new.id, sqlerrm;
       end;

       begin
         v_coach_id := nullif(new.raw_user_meta_data->>'coach_id', '')::uuid;
         v_coach_code := new.raw_user_meta_data->>'coach_code';
         if v_coach_id is not null then
           insert into public.coach_clients (coach_id, client_id, status, linked_by_code)
           values (v_coach_id, new.id, 'active', nullif(v_coach_code, ''))
           on conflict (coach_id, client_id) do nothing;

           if v_coach_code is not null then
             update public.registration_codes
             set used_count = used_count + 1
             where code = v_coach_code
               and coach_id = v_coach_id
               and status = 'active'
               and (max_uses is null or used_count < max_uses);
           end if;
         end if;
       exception
         when others then
           raise warning 'handle_new_user: coach_clients fallito per user %: %', new.id, sqlerrm;
       end;
     end if;

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

   Verifica dopo averlo eseguito: `select * from public.profiles order by created_at desc limit 5;` deve mostrare la riga per l'ultimo utente registrato, anche prima che confermi l'email. Per un coach appena registrato, verifica anche `select * from public.registration_codes where coach_id = '<user-id>';`: deve gia' mostrare un codice `FC-XXXX-XXXX` attivo, anche prima della conferma email.

## Come testare da web

1. `npx.cmd expo start --web`, apri `http://localhost:8081` (o la porta assegnata).
2. **Conferma registrazione**: registra un coach o un cliente con un'email reale che puoi controllare. Verifica che compaia il messaggio "Controlla la tua email" (cliente) o la stessa schermata al posto del codice (coach). **Prima ancora di cliccare il link**, apri Supabase (Table editor) e verifica che `profiles` esista gia' (e, per un coach, anche `coach_profiles`/`billing_profiles`/`registration_codes` con un codice `FC-XXXX-XXXX` attivo; per un cliente, `client_profiles`/`coach_clients`) — il trigger li crea subito, indipendentemente dalla conferma. Poi verifica che il login prima della conferma dia comunque "Email non ancora confermata...". Clicca il link ricevuto via email, poi rifai login: deve funzionare **e** deve comparire il codice coach in UI (se ti eri registrato come coach) — i dati in tabella devono restare gli stessi di prima (nessuna riga duplicata, `used_count` non incrementato una seconda volta per un cliente).
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
