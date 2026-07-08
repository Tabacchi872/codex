# PROJECT_STATE.md

Snapshot dello stato attuale del progetto. Questo file va **sovrascritto** ad ogni aggiornamento (non è un log): riflette sempre lo stato presente, non la storia. Per la storia vedi `WORKLOG.md`.

**Ultimo aggiornamento:** 2026-07-08

## Fase del progetto
Sviluppo MVP. Dopo il lato Coach/Admin e il lato Cliente (sessioni precedenti), il 2026-07-08 è stato costruito un intero pannello **Superadmin** (piattaforma multi-coach: piani, billing, notifiche, supporto) più i flussi di **login/registrazione ufficiali** (coach e cliente, con codice coach e dati di fatturazione) e lo **schema Supabase completo** (non ancora collegato). Questo aggiornamento non era stato documentato nei file di memoria fino ad ora: i doc erano fermi al 2026-07-06 mentre 9 commit del 07-08 avevano già introdotto tutto quanto sotto — il codice era la fonte di verità reale, non questo file. Backend reale resta il pezzo mancante principale: tutto è ancora persistito solo localmente (AsyncStorage), nessun progetto Supabase collegato.

## Tipo di progetto
App mobile iPhone — **FitCoach Pro** (nome definito in `mobile/src/constants/app-info.ts`; "CoachDesk" nome di lavoro superato — vedi `docs/DECISIONS.md`), Expo + React Native + TypeScript. Non è una webapp/PWA. Proprietario/sviluppatore: Luigi Marrano.

> Nota: `PRODUCT.md`/`DESIGN.md` nella root del repo descrivono ancora un progetto precedente (webapp B2B gestione progetti/task) e non sono stati aggiornati — decisione rimandata dall'utente. Non usarli come fonte di verità per FitCoach Pro.

## Stack tecnologico
Expo SDK 57 (managed) + React Native 0.86 + TypeScript + Expo Router (file-based, cartella `mobile/src/app`). Stato applicativo Zustand con persistenza locale su AsyncStorage (persistenza locale parziale, no backend). Video locali via `expo-video`, audio via `expo-audio`. Backend Supabase pianificato e con schema completo pronto (`docs/SUPABASE_SCHEMA.md`/`.sql`) ma non ancora integrato (nessun URL/anon key/pacchetto `@supabase/supabase-js` nel progetto). Preview di sviluppo su web via `expo start --web`, layout incorniciato in stile iPhone (`WebPhoneFrame`, solo su web). Dettagli completi in `docs/ARCHITECTURE.md` (da verificare se aggiornato con la parte superadmin).

## Ambienti
- Sviluppo: preview web locale (`http://localhost:8081`, Chrome su PC) via `npx.cmd expo start --web`. Typecheck (`npx.cmd tsc --noEmit`) e `npx.cmd expo-doctor` puliti al termine di questa sessione (2026-07-08).
- Expo Go su iPhone/Android reale: non affrontato in questa sessione, stato invariato rispetto a prima (vedi `docs/BUGS.md`).
- Staging/Produzione: non previste in questa fase.

## Funzionalità completate (verificate solo via typecheck/expo-doctor, NON con clic reali in browser — nessun tool di automazione browser disponibile in questo ambiente)

### Login ufficiale, registrazione coach/cliente, fatturazione coach, superadmin (2026-07-08)
- **Login** (`mobile/src/components/login-screen.tsx`): solo email/password/Accedi, nessun esempio demo mostrato in UI (gli account demo interni restano solo come credenziali di fallback, non visibili). Link "Registrati come coach", "Registrati come cliente", "Password dimenticata" (quest'ultimo disabilitato, non finto: nessun comportamento nascosto).
- **Registrazione coach** (`mobile/src/components/registration-screens.tsx`, `CoachRegistrationScreen`, montata da `AuthGate` sul pathname `/registrazione-coach` — il file route `mobile/src/app/registrazione-coach.tsx` è uno stub `return null` intenzionale, mai renderizzato): nome/cognome, email, password, **conferma password** (aggiunta in questa sessione, mancava), telefono opzionale, nome attività opzionale, più sezione "Dati attività e fatturazione" (tipo soggetto, ragione sociale, P.IVA, codice fiscale, indirizzo, CAP, comune, provincia, nazione, PEC, codice SDI con placeholder `0000000`, email fatturazione). Validazione: ragione sociale/nazione/email fatturazione obbligatori; se nazione Italia e P.IVA presente, richiede PEC o SDI. Genera codice coach univoco `FC-XXXX-XXXX` (`lib/coach-code.ts`), lo salva nel profilo (`useSuperadminStore.createCoach`) e crea l'account di login (`useAuthStore.addCoachAccount`). Schermata finale "Il tuo codice coach" con pulsante "Copia codice" (rinominata da "Codice coach" in questa sessione per matchare il testo richiesto).
- **Registrazione cliente** (`ClientRegistrationScreen` nello stesso file, pathname `/registrazione-cliente`): codice coach obbligatorio, nome/cognome, email, password, conferma password. Verifica codice via `findCoachByCode`; blocca la registrazione se codice non valido o se `canCoachAcceptClients` (`lib/coach-code.ts`) risulta negativo (codice disattivato, coach bloccato/pagamento scaduto/annullato, piano non attivo, o limite clienti del piano raggiunto). Se valido: crea `Client` (collegato a `coachId`/`linkedByCode`), crea `ClientAccount` con la password scelta dall'utente (non temporanea, `mustChangePassword: false`), registra la relazione in `useSuperadminStore.addCoachClient` (incrementa anche `clientsUsed` del coach) e fa login automatico verso `/cliente-home`.
- **Superadmin** (`mobile/src/app/superadmin/*`): dashboard (`index.tsx`), lista/dettaglio/nuovo coach (`coaches/{index,[id],new}.tsx`), piani (`plans/{index,[id]}.tsx`), notifiche (`notifications.tsx`), eventi di pagamento (`payment-events.tsx`), supporto (`support/{index,[coachId]}.tsx`). Il dettaglio coach (`coaches/[id].tsx`) mostra codice coach, stato codice, dati fatturazione completi, pulsanti "Rigenera codice" e "Attiva/Disattiva codice", oltre a modifica manuale piano/stato pagamento/limite clienti e blocco/sblocco. Store dedicato `store/superadmin-store.ts` (persistito, dati demo seed per 4 coach di esempio) con notifiche automatiche generate sugli eventi principali (nuovo coach, piano cambiato, coach bloccato/sbloccato, pagamento scaduto).
- **Filtri stato coach** (`superadmin/coaches/index.tsx`): chip Tutti/Attivi/In prova/Scaduti/Bloccati/Annullati, compatti (minHeight 32, padding ridotto), ordinati su due righe su schermi 360–430px, colore rosso per il filtro attivo (fix di sessione precedente, verificato di nuovo in questa continuazione).
- **Schema Supabase** (`docs/SUPABASE_SCHEMA.md`, `docs/SUPABASE_SCHEMA.sql`): schema SQL completo con tutte le tabelle previste (`profiles`, `coach_profiles`, `client_profiles`, `coach_clients`, `registration_codes`, `billing_profiles`, `plans`, `coach_billing`, `payment_events`, `invoices` — ora con `xml_url` oltre a `pdf_url`, aggiunto in questa sessione —, `invoice_items`, `subscriptions`, `appointments`, `messages`, `admin_notifications`, `push_tokens`), check constraint SQL reale per "Italia + P.IVA → PEC o SDI obbligatori", policy RLS iniziali descritte (da validare su un progetto reale), e nuova sezione "Email future (Supabase Auth)" (aggiunta in questa sessione: conferma registrazione, reset password, invito cliente, conferma cambio email — nessuna email reale parte oggi).

### Preesistenti (2026-07-05/06, invariate salvo dove indicato)
- Navigazione base, libreria 44 esercizi, struttura dati allenamento, timer/suoni/storico, tema chiaro/scuro, gestione clienti reale, lato cliente completo (Nutrizione/Questionario/Prenotazioni/Bacheca/Chat), abbonamenti/sessioni multiple/agenda coach — vedi `docs/WORKLOG.md` per i dettagli.

## Funzionalità in corso / non ancora verificate visivamente
- **Tutto il blocco Superadmin + login ufficiale + registrazione coach/cliente + fatturazione (2026-07-08) non è mai stato cliccato in un browser reale**: verificato solo con `tsc --noEmit` e `expo-doctor` (entrambi puliti). Nessun clic reale su: creazione coach da superadmin, rigenerazione/attivazione codice, registrazione coach end-to-end (form → codice mostrato → copia), registrazione cliente end-to-end (codice valido/non valido/coach bloccato → messaggi d'errore corretti), filtri stato coach su schermo stretto reale, dashboard superadmin/piani/notifiche/supporto/eventi pagamento.
- Nessuna connessione Supabase reale: schema pronto ma non eseguito su un progetto reale, nessuna chiave nel progetto.
- Nessuna fattura reale generata, nessuna email reale inviata (entrambe dichiarate esplicitamente come non implementate, per scelta esplicita dell'utente in questa sessione).
- Verifiche ereditate dalle sessioni precedenti (workout/abbonamenti/agenda/lato cliente, vedi `docs/TODO_NEXT.md`): ancora da fare con clic reali.
- Test su iPhone/Android reale via Expo Go: non eseguibile al momento (vedi Rischi).

## Rischi/blocchi attivi
- **Debito di documentazione riconosciuto in questa sessione**: 9 commit del 2026-07-08 (prima di questa sessione) hanno introdotto tutto il sistema superadmin/registrazione/fatturazione senza mai aggiornare `PROJECT_STATE.md`/`WORKLOG.md`/`TODO_NEXT.md`/`DECISIONS.md`. Questo file è stato riallineato ora al codice reale; se emergono altri dettagli non documentati in quei commit, verificare sempre il codice sorgente, non solo questi doc.
- **Expo Go su telefono non funziona correttamente** (invariato, vedi `docs/BUGS.md`). Expo Web resta l'ambiente principale.
- `PRODUCT.md`/`DESIGN.md` non allineati al progetto.
- Persistenza locale parziale: nessuna sincronizzazione multi-dispositivo; migrazione a Supabase resta il prossimo passo architetturale importante (schema già pronto).
- **Nessuna scritta "demo"/limite tecnico è visibile in UI**: non distribuire a clienti reali finché non c'è un'autenticazione vera (Supabase Auth) e i flussi email (conferma/reset) non sono collegati.
- Ambiente Windows senza Mac/iOS Simulator.
- Il blocco Superadmin/registrazione (2026-07-08) è il più grande blocco di funzionalità mai aggiunto senza verifica visiva in questo progetto: priorità alta per il prossimo giro di test manuali (vedi `docs/TODO_NEXT.md`).
