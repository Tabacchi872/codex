# TODO_NEXT.md

Prossimi passi prioritizzati per **FitCoach Pro** (nome definito in `mobile/src/constants/app-info.ts`; "CoachDesk" era il nome di lavoro superato) — app iPhone personal trainer, proprietario Luigi Marrano. Non è uno storico (per quello vedi `WORKLOG.md`).

## Priorità alta

- [x] **Login ufficiale, registrazione coach/cliente, fatturazione coach, superadmin, schema Supabase completo (2026-07-08):** pannello superadmin (dashboard/coach/piani/notifiche/eventi pagamento/supporto), login solo email/password senza esempi demo in UI, registrazione coach con dati fatturazione e codice coach univoco generato, registrazione cliente con validazione codice coach obbligatoria, schema `docs/SUPABASE_SCHEMA.{md,sql}` completo (incluse tutte le tabelle billing/fatturazione). Vedi `docs/WORKLOG.md`, `docs/DECISIONS.md`. **Non verificato con clic reali in un browser** — nessuno di questi flussi è mai stato cliccato in un browser reale, né in questa sessione né (a quanto risulta) in quella dei 9 commit precedenti non documentati. Vedi checklist dedicata sotto.
- [ ] **Verifica clic reali del blocco Superadmin/registrazione (priorità assoluta, mai fatta):**
  1. Da login, "Registrati come coach": compilare tutti i campi incluso "Conferma password" (nuova), provare password diverse tra loro (deve bloccare con errore), poi corrette → verificare comparsa schermata "Il tuo codice coach" con codice `FC-XXXX-XXXX` e che "Copia codice" copi davvero.
  2. Provare a registrare un coach con nazione "Italia" + Partita IVA compilata ma PEC e Codice SDI vuoti → deve bloccare con l'errore dedicato; compilando uno dei due deve passare.
  3. Da login, "Registrati come cliente": provare un codice coach inesistente (deve bloccare), poi il codice di un coach demo bloccato/scaduto se presente nei dati seed (deve bloccare con il motivo corretto), poi un codice valido → verificare login automatico su `/cliente-home` e che il cliente compaia nel dettaglio coach lato superadmin ("Clienti attivi").
  4. Da superadmin → Coach → dettaglio: "Rigenera codice" e "Attiva/Disattiva codice" → verificare che il nuovo stato si rifletta subito e che un vecchio codice disattivato blocchi davvero una nuova registrazione cliente (punto 3).
  5. Superadmin → dashboard, piani, notifiche, eventi pagamento, supporto: verificare che tutte le sezioni carichino dati reali (non vuote/rotte) e che i filtri stato coach (`/superadmin/coaches`) restino leggibili e a due righe su 360–430px.
- [x] **Step 0 — Setup progetto e preview:** progetto Expo in `mobile/`, navigazione a tab, preview web in cornice iPhone-style.
- [x] **Struttura dati allenamento reale + timer/storico + redesign rosso + superserie/circuito** (vedi `docs/WORKLOG.md` per le voci precedenti).
- [x] **Tema chiaro/scuro/sistema, gestione clienti reale, autenticazione demo coach/client (2026-07-05):** vedi sezione dedicata sotto e `docs/WORKLOG.md`.
- [x] **Rinomina in FitCoach Pro, sfondo grafico leggero, sezione Sviluppatore, rimozione scritte "demo" dalla UI (2026-07-05):** vedi `docs/WORKLOG.md`.
- [x] **Completamento lato Cliente: Workout live, Nutrizione, Questionario, Prenotazioni, Bacheca, Chat (2026-07-05):** vedi `docs/WORKLOG.md`.
- [x] **Tab bar cliente a 5 voci con icone, Home con icone su ogni card, Dettaglio esercizio come logger di sessione (2026-07-05):** vedi `docs/WORKLOG.md`.
- [x] **Fix navigazione cliente — BUG-002, tab bar web sostituita con `Slot` (2026-07-05):** vedi `docs/WORKLOG.md` e `docs/BUGS.md`. **Non verificato con clic reali in un browser** (nessun tool di automazione browser disponibile): la correzione è validata da lettura del sorgente della libreria + `curl`/bundle, ma va confermata di persona (vedi prossimo step sotto). Tab bar nativa non ancora corretta (stesso rischio, non testabile in questo ambiente).
- [x] **Abbonamento cliente reale (`SubscriptionPackage`), sessioni multiple con data/ora, agenda coach reale con anti-sovrapposizione (2026-07-06):** vedi `docs/WORKLOG.md`, `docs/DECISIONS.md`. **Non verificato con clic reali in un browser** (stesso limite delle voci precedenti) — vedi "Prossimo step operativo immediato" sotto per la checklist completa da eseguire di persona.
- [x] **Ultimo aggiornamento Coach/Admin (2026-07-06, parte 2) — fix status abbonamento, fix stato saltato, modelli allenamento predefiniti, icone tab coach, suono Sirena:** vedi `docs/WORKLOG.md`, `docs/BUGS.md` (BUG-004, BUG-005), `docs/DECISIONS.md`. **Non verificato con clic reali in un browser** — vedi checklist aggiornata sotto. **Prossimo passo dichiarato dall'utente: lato cliente**, non toccato in questa sessione.
- [ ] **Lato coach per Nutrizione e Bacheca personale:** oggi nessuna schermata coach per assegnare un piano nutrizionale a un cliente o scrivere un annuncio personale — le sezioni corrispondenti lato cliente restano vuote finché non viene costruita.
- [ ] **Caricare i video/immagini reali degli esercizi** in `mobile/assets/videos/` e `mobile/assets/images/exercises/`, registrandoli nei rispettivi registri (oggi tutto "mancante" per onestà).
- [ ] **Step 1 — Backend reale:** migrare da AsyncStorage locale a Supabase (Postgres + Auth + RLS). Sostituirebbe `auth-store.ts`/`client-store.ts` (confronto password in chiaro) con Supabase Auth reale, permetterebbe upload reale delle foto del questionario (oggi `blob:` locali), prenotazioni/abbonamenti/appuntamenti davvero condivisi tra dispositivi — vedi `docs/DECISIONS.md`. Ora più urgente: con abbonamenti, agenda e registrazione multi-coach reali, il limite "solo locale" è più visibile. Schema pronto in `docs/SUPABASE_SCHEMA.{md,sql}`: creare il progetto Supabase, eseguire il SQL, collegare `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`, installare `@supabase/supabase-js` solo dopo conferma.
- [ ] **Email reali (conferma registrazione, reset password, invito cliente, conferma cambio email):** dipende dallo Step 1 (Supabase Auth). Oggi zero email inviate; "Password dimenticata" in login è visibile ma disabilitato. Vedi sezione "Email future" in `docs/SUPABASE_SCHEMA.md`.
- [ ] **Fatturazione automatica reale:** oggi solo lo schema (`invoices`/`invoice_items`) e i dati fiscali coach (`billing_profiles`) esistono; nessuna fattura viene generata. Servirebbe, dopo lo Step 1: motore di calcolo IVA/numerazione, generazione PDF/XML (SdI per soggetti italiani), collegamento pagamenti reali (Stripe web, Apple/Google in-app) con riconciliazione — vedi note fiscali in `docs/SUPABASE_SCHEMA.md`. Nessuna di queste integrazioni è stata collegata finora, per scelta esplicita dell'utente.
- [ ] **Modifica anagrafica cliente esistente** (oggi solo creazione + cambio stato; nome/cognome/email/telefono/obiettivo/nota non sono più modificabili dopo la creazione).
- [ ] **Expo Go / development build:** Expo Go su telefono non funziona correttamente al momento (Expo Web sì). Nessuna diagnosi definitiva possibile in questa sessione (nessun device fisico/log disponibile). Prossimo passo consigliato: provare un development build EAS (`eas build --profile development`) invece di Expo Go, che risolve strutturalmente i problemi di compatibilità nativa con librerie come `expo-audio`/`expo-video`/`react-native-reanimated` 4.x/`react-native-worklets` — vedi `docs/BUGS.md` (nota dedicata) e il report tecnico della sessione 2026-07-06.

## Priorità media

- [ ] **Step 6 — Vista calendario appuntamenti:** oggi solo lista cronologica; aggiungere vista mensile/settimanale.
- [ ] **Riordino esercizi via drag-and-drop** nell'editor scheda (oggi frecce su/giù, funzionale ma meno comodo).
- [ ] **Selettore data con calendario nativo** per le date (oggi testo libero formato AAAA-MM-GG).
- [ ] **Unicità username** negli account cliente generati (oggi due clienti omonimi genererebbero lo stesso username — accettabile solo in demo).
- [ ] **Invio email reale delle credenziali** (oggi "Invia via email" è disabilitato, solo copia/condivisione testo).

## Priorità bassa / backlog

- [x] **Redesign visivo v1 + v2 (2026-07-05):** vedi `docs/WORKLOG.md`.
- [x] **Tema, clienti reali, auth demo (2026-07-05):** vedi `docs/WORKLOG.md`. **Non verificato visivamente in un browser reale** — `web.output: "single"` impedisce la verifica del contenuto per-rotta via `curl`: serve aprire `http://localhost:8081` di persona, soprattutto per i flussi interattivi (login, generazione credenziali, cambio tema).
- [ ] **Documentare il nuovo sistema visivo (rosso) in un `DESIGN.md` dedicato a FitCoach Pro** (quello in root resta del progetto B2B precedente).
- [ ] **Test end-to-end su iPhone/Android reali** via Expo Go: timer/suono/vibrazione, video player, superserie/circuito, login/cambio password, tab bar nativa cliente vs coach, condivisione credenziali (Share API nativa) — mai testati su device fisico, solo su preview web.
- [ ] Preparazione futura EAS Build / TestFlight / App Store — non ora.
- [ ] Decisione rimandata dall'utente: se e come aggiornare `PRODUCT.md`/`DESIGN.md`, attualmente ancora relativi a un progetto diverso (webapp B2B gestione progetti/task).

## Prossimo step operativo immediato

**Priorità assoluta**: aprire `http://localhost:8081` e cliccare davvero (nessun tool di automazione browser era disponibile per verificarlo in questa sessione). Checklist abbonamenti/sessioni/agenda (2026-07-06, non ancora verificata con clic reali):
1. Da coach, aprire un cliente (`/clienti/[id]`) → premere "Crea abbonamento", compilare pacchetto (es. 12 allenamenti) e salvare → verificare che la card Abbonamento mostri "0/12" e lo stato Attivo.
2. Premere "Aggiorna abbonamento" → cambiare totale/completati/stato → salvare → verificare che il dettaglio cliente rifletta i nuovi valori.
3. Dallo stesso cliente, premere "+ Nuova scheda" più volte per creare 2-3 sessioni diverse (es. "Petto+Tricipiti", "Dorso+Bicipiti") con data/ora diverse e collegarle all'abbonamento creato → verificare che tutte compaiano nella lista "Schede assegnate" del cliente, ciascuna con la propria data/ora.
4. Premere "+ Nuovo appuntamento" per lo stesso cliente, impostare data/ora, salvare → poi crearne un secondo con **stessa data e orario sovrapposto**: verificare che compaia "Orario non disponibile. Scegli un altro orario." e che il secondo appuntamento NON venga salvato.
5. Verificare che l'agenda (`/appuntamenti`) mostri l'appuntamento creato, ordinato cronologicamente, e che la Dashboard coach (`/`) mostri lo stesso come "Prossimo appuntamento".
6. Da cliente (login `marco.bianchi`/`Forza4821!` o il cliente usato sopra), verificare in Home il contatore aggiornato (es. "0/12"), il prossimo allenamento con data/ora corrette; in tab Workout verificare che tutte le sessioni create compaiano con data/ora; aprire una sessione, premere "Inizia allenamento" → "Fine allenamento" → tornare in Home e verificare che il contatore sia salito a "1/12".
7. Ripetere il punto 6 una seconda volta su un'altra sessione per confermare che il contatore sale a "2/12" (non si blocca, non salta numeri).
8. Verificare che nessuna delle nuove schermate mostri scritte "demo"/"provvisorio" e che tutte le tab coach (Dashboard/Clienti/Esercizi/Schede/Agenda/Impostazioni) restino cliccabili come prima (nessuna regressione da BUG-002-style sulla tab bar coach).

Checklist fix/nuove funzioni Coach/Admin (2026-07-06, parte 2), non ancora verificata con clic reali:
9. Aprire un cliente con abbonamento esistente → "Aggiorna abbonamento" → cambiare stato in "In pausa" → salvare → tornare al dettaglio cliente: la card Abbonamento deve mostrare il pacchetto con stato "In pausa" (NON "Nessun abbonamento"). Ripetere cambiando in "Completato", "Scaduto", "Annullato": la card deve sempre riflettere lo stato corrente.
10. Impostare una sessione su "Saltato" (chip di stato in vista) → aprire "Modifica scheda" → cambiare data o ora → salvare: lo stato deve tornare "Da fare"/Programmato. Poi ripetere ma cambiando solo il nome (non data/ora): lo stato deve restare "Saltato".
11. Aprire "Schede" → "Modelli allenamento" → aprire un modello (es. "Massa muscolare 3 giorni") → "Usa per cliente" → selezionare un cliente (+ abbonamento se disponibile) → confermare: verificare che vengano create le schede nel dettaglio cliente, con nome "Titolo modello — Titolo sessione", poi aprire una di queste e verificare che sia modificabile (esercizi/serie/ripetizioni/recuperi/data/ora) senza che il modello originale in "Modelli allenamento" cambi.
12. Verificare che la tab bar coach in basso mostri un'icona per ogni voce (Dashboard/Clienti/Esercizi/Schede/Agenda/Impostazioni), colorata di rosso sulla tab attiva, e che tutte restino cliccabili.
13. In Impostazioni → Suono selezionato, verificare che compaia "Sirena" tra le opzioni e che il bottone "Prova" la riproduca davvero (non solo silenzio/errore).
14. Aprire "Crea appuntamento" e confermare che non c'è alcun campo "Data fine" (solo Data, Ora inizio, Ora fine).

Poi, checklist ereditata dalla sessione precedente (2026-07-05), ancora da verificare:
15. Login cliente → cliccare tutte e 5 le tab in basso (Home/Workout/Nutrizione/Chat/Altro): ognuna deve cambiare schermata e aggiornare il colore (rosso attivo/grigio inattivo).
16. Da Home, cliccare ogni card e il link "Chat con il coach"; da Altro, cliccare tutte e 8 le voci del menu. Se qualcosa non naviga, vedi `docs/BUGS.md` BUG-002 per il meccanismo di debug già usato.
17. Aprire un esercizio dalla scheda → verificare la sezione "Serie" precompilata, bottone "Rec.", sezione "Allegati" con upload foto, barra "◄ N/M ►".
18. Da cliente, provare a raggiungere `/clienti` o `/schede` via URL: deve comparire "Sezione riservata al coach".
19. Provare un development build EAS al posto di Expo Go per il test su device reale (vedi nota Expo Go sopra e in `docs/BUGS.md`).

**Prossimo intervento dichiarato dall'utente: lato cliente** (non toccato in questa sessione né nella precedente per la parte abbonamenti/agenda). In alternativa: Step 1 (Supabase Auth reale, ora più urgente), lato coach per Nutrizione/Bacheca personale, o caricamento video/immagini reali.
