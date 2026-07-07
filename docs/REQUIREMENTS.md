# REQUIREMENTS.md

Requisiti funzionali e non funzionali per **FitCoach Pro** (nome definito in `mobile/src/constants/app-info.ts`; compariva come "CoachDesk" nelle fasi iniziali, vedi `docs/DECISIONS.md`) — app iPhone (Expo + React Native) per istruttore/personal trainer, proprietà di Luigi Marrano. Fase corrente: MVP con lato istruttore completo e lato cliente essenziale (home, profilo, login).

> Nota di contesto: il contenuto precedente di questo file era vuoto/placeholder legato a un progetto webapp B2B diverso (gestione progetti/task). Sostituito integralmente con i requisiti della app mobile per personal trainer, su richiesta esplicita dell'utente. `PRODUCT.md`/`DESIGN.md` restano invariati in attesa di decisione dell'utente.

## Tipo di progetto

App mobile nativa per iPhone, sviluppata con **Expo + React Native**. Non è una webapp, non è una PWA. Testabile su iPhone reale via Expo Go durante lo sviluppo; percorso futuro verso build iOS reale con EAS Build → TestFlight → App Store.

## Requisiti funzionali — MVP (lato istruttore)

- **ID:** F1
  **Descrizione:** Dashboard istruttore con riepilogo operativo (clienti in scadenza, clienti scaduti, prossimi appuntamenti).
  **Criteri di accettazione:** all'apertura dell'app, l'istruttore vede numeri reali (non finti) calcolati dai dati esistenti; toccando una sezione si arriva alla lista filtrata corrispondente.
  **Priorità:** must

- **ID:** F2
  **Descrizione:** Lista clienti con scheda assegnata e stato (derivato dalla scadenza della scheda).
  **Criteri di accettazione:** la lista riflette i clienti reali salvati nello store persistito; lo stato è calcolato automaticamente (non inserito manualmente).
  **Priorità:** must — **fatto** (persistenza locale, non backend)

- **ID:** F3
  **Descrizione:** Creazione cliente (anagrafica): nome, cognome, email, telefono opzionale, data nascita opzionale, obiettivo, note interne, stato cliente (attivo/in pausa/scaduto).
  **Criteri di accettazione:** un nuovo cliente creato compare subito nella lista; nome/cognome/email sono obbligatori e validati; dopo il salvataggio si apre il dettaglio del cliente appena creato.
  **Priorità:** must — **fatto**. **Non incluso:** modifica dei campi anagrafici di un cliente esistente (solo lo stato è modificabile dal dettaglio).

- **ID:** F4
  **Descrizione:** Dettaglio cliente: anagrafica, stato (modificabile), scheda assegnata e scadenza, storico appuntamenti, note interne, credenziali di accesso.
  **Criteri di accettazione:** ogni dato mostrato proviene dallo store reale; da qui si può creare/aprire la scheda assegnata, cambiare lo stato cliente, generare le credenziali di accesso.
  **Priorità:** must — **fatto**

- **ID:** F5
  **Descrizione:** Libreria esercizi base (`Exercise`), 44 esercizi precaricati su 8 gruppi muscolari (Petto, Dorso, Gambe, Spalle, Bicipiti, Tricipiti, Addominali/Core, Cardio/Funzionale).
  **Criteri di accettazione:** ogni esercizio ha nome, gruppo muscolare, descrizione, note tecniche, difficoltà, attrezzatura, riferimento video locale; **nessun parametro di allenamento (serie/ripetizioni/peso/recupero) vive su `Exercise`** — vedi F7 e `docs/DECISIONS.md`.
  **Priorità:** must — **fatto**

- **ID:** F6
  **Descrizione:** Video guida esercizi **solo locali**, mai YouTube/WebView/embed esterni.
  **Criteri di accettazione:** ogni esercizio punta a un file in `mobile/assets/videos/` tramite un registro esplicito (`video-registry.ts`, richiesto da Metro); se il file non è presente, l'app mostra "Video locale mancante" e non tenta nessuna riproduzione; un file presente ma non riproducibile mostra un messaggio di errore dedicato, non uno stato finto di successo.
  **Priorità:** must — **fatto** (nessun video reale ancora caricato: tutti gli esercizi risultano "missing" finché non si aggiungono i file)

- **ID:** F7
  **Descrizione:** Parametri di allenamento (`WorkoutExercise`) per ogni esercizio dentro una scheda: serie, ripetizioni (con eventuale range min/max), peso target, recupero in secondi, tempo, note, ordine.
  **Criteri di accettazione:** lo stesso esercizio può avere parametri diversi in schede/clienti diversi, perché questi dati vivono su `WorkoutExercise` e mai su `Exercise`; l'ordine è modificabile e persistito.
  **Priorità:** must — **fatto**

- **ID:** F7b
  **Descrizione:** Creazione/modifica scheda allenamento (`WorkoutPlan`) componendola da esercizi della libreria.
  **Criteri di accettazione:** una scheda ha nome, cliente assegnato, data inizio, data scadenza, elenco `WorkoutExercise`; si possono aggiungere/rimuovere/riordinare esercizi e modificarne i parametri prima di salvare.
  **Priorità:** must — **fatto**

- **ID:** F8
  **Descrizione:** Ogni scheda (`WorkoutPlan`) appartiene direttamente a un cliente (`clientId`), non è un template condiviso tra più clienti.
  **Criteri di accettazione:** la scheda compare nel dettaglio del cliente assegnato; lo stato del cliente (F11) è derivato dalla scadenza della sua scheda più recente.
  **Priorità:** must — **fatto**

- **ID:** F9
  **Descrizione:** Scadenza della scheda assegnata (data).
  **Criteri di accettazione:** la data di scadenza è obbligatoria all'assegnazione e determina lo stato del cliente (F11).
  **Priorità:** must

- **ID:** F10
  **Descrizione:** Appuntamenti/calendario per cliente.
  **Criteri di accettazione:** un appuntamento creato compare sia nel calendario generale sia nel dettaglio del cliente collegato; è possibile modificarlo/cancellarlo.
  **Priorità:** must

- **ID:** F11
  **Descrizione:** Stato cliente automatico: attivo / in scadenza / scaduto.
  **Criteri di accettazione:** lo stato è **calcolato**, non inserito manualmente, a partire dalla data di scadenza dell'assegnazione attiva (vedi `DECISIONS.md`); cambia automaticamente al passare del tempo, senza intervento dell'istruttore.
  **Priorità:** must

- **ID:** F12
  **Descrizione:** Note interne istruttore per cliente (testo libero, non visibile al cliente).
  **Criteri di accettazione:** la nota è salvata alla creazione del cliente ed è visibile solo lato coach (un account cliente non la vede mai).
  **Priorità:** must — **fatto alla creazione**; modifica successiva della nota ancora "solo UI, backend/logica mancante" (`DisabledAction`)

- **ID:** F13
  **Descrizione:** Timer di recupero (`RestTimer`) usabile durante l'allenamento.
  **Criteri di accettazione:** Start/Pausa/Reset funzionanti; durata iniziale presa da `WorkoutExercise.restSeconds`; a fine recupero riproduce un suono reale (non placeholder) se abilitato; emette un tick negli ultimi 3 secondi se il countdown è abilitato; vibra su iOS/Android se abilitato (su web dichiara esplicitamente che la vibrazione non è disponibile).
  **Priorità:** must — **fatto**

- **ID:** F14
  **Descrizione:** Impostazioni suono/vibrazione (`SoundSettings`), persistite.
  **Criteri di accettazione:** attiva/disattiva suono recupero, volume regolabile, attiva/disattiva suono countdown, attiva/disattiva suono fine recupero, attiva/disattiva vibrazione, scelta tra 3 suoni reali con anteprima ascoltabile; le impostazioni sopravvivono al refresh/riavvio (AsyncStorage).
  **Priorità:** must — **fatto**

- **ID:** F15
  **Descrizione:** Storico pesi per esercizio e cliente (`ExerciseProgressHistory`), separato da `WorkoutExercise`.
  **Criteri di accettazione:** mostra data/peso/serie/ripetizioni/note di ogni sessione registrata, l'ultimo peso usato e il miglior peso recente; permette di aggiungere un record manuale (demo) che viene realmente salvato nello store, non solo mostrato in UI.
  **Priorità:** must — **fatto**

- **ID:** F16
  **Descrizione:** Tema chiaro/scuro/sistema, applicato globalmente (sfondo, card, testi, tab bar, header, pulsanti, input).
  **Criteri di accettazione:** cambiare l'impostazione in Impostazioni (o Profilo cliente) cambia immediatamente i colori in tutta l'app; la scelta sopravvive al riavvio; "Sistema" segue il tema del sistema operativo/browser.
  **Priorità:** must — **fatto**. **Persistenza locale demo**: la preferenza è salvata solo su questo dispositivo/browser.

- **ID:** F17
  **Descrizione:** Generazione credenziali di accesso cliente (username, password temporanea) dal dettaglio cliente.
  **Criteri di accettazione:** il coach genera un account con un tocco; vengono mostrati username/email/password temporanea; il cliente deve cambiare la password al primo accesso (`mustChangePassword`).
  **Priorità:** must — **fatto, DEMO LOCALE**: nessun invio reale, nessuna sicurezza reale (vedi `docs/DECISIONS.md`).

- **ID:** F18
  **Descrizione:** Copia/condivisione del testo con le credenziali generate.
  **Criteri di accettazione:** "Copia credenziali" mette il testo pronto negli appunti; "Condividi credenziali" apre la condivisione nativa su iOS/Android, e su web copia negli appunti dichiarando che la condivisione nativa non è disponibile; "Invia via email" è visibilmente disabilitato con nota "solo UI, backend email mancante".
  **Priorità:** must — **fatto**

- **ID:** F19
  **Descrizione:** Login demo con ruoli coach/client.
  **Criteri di accettazione:** un cliente può accedere con username/email + password generata dal coach; un pulsante separato permette di entrare come coach senza password (demo); dopo il login si arriva alla dashboard coach o alla home cliente a seconda del ruolo.
  **Priorità:** must — **fatto, AUTENTICAZIONE DEMO LOCALE**: confronto password in chiaro solo su questo dispositivo, nessun server coinvolto.

- **ID:** F20
  **Descrizione:** Cambio password obbligatorio al primo accesso cliente.
  **Criteri di accettazione:** se l'account ha `mustChangePassword: true`, il cliente non può usare l'app finché non imposta una nuova password (minimo 6 caratteri, confermata due volte).
  **Priorità:** must — **fatto** (demo: la nuova password sostituisce quella temporanea nello store locale, nessun hashing)

- **ID:** F21
  **Descrizione:** Home cliente e profilo cliente, scoped al proprio `clientId`.
  **Criteri di accettazione:** un account cliente vede solo le proprie schede assegnate (tramite le schermate esistenti di dettaglio scheda/esercizio, senza pulsanti di modifica) e il proprio profilo; non vede la lista clienti, note interne di altri, o schermate amministrative (mostrano "Sezione riservata al coach" se raggiunte).
  **Priorità:** must — **fatto**. La separazione è una barriera di contenuto lato UI, non un vero controllo di accesso lato server (dettaglio tecnico in `docs/DECISIONS.md`, non in UI).

- **ID:** F22
  **Descrizione:** Sfondo grafico leggero su tutte le schermate principali, coerente in light e dark mode.
  **Criteri di accettazione:** un unico componente riutilizzabile (`ScreenBackground`) applica lo stesso pattern (non un'immagine) con opacità 6% in chiaro e 3.5% in scuro; il testo resta leggibile, nessuna card/pulsante viene coperto.
  **Priorità:** must — **fatto**

- **ID:** F23
  **Descrizione:** Sezione "Sviluppatore" nelle Impostazioni (coach) e nel Profilo (cliente): nome sviluppatore, ringraziamenti, copyright, versione, nome app, anno.
  **Criteri di accettazione:** stesso componente (`DeveloperInfoSection`) in entrambi i punti; nessun riferimento a "demo"/"sviluppo provvisorio" nel testo mostrato.
  **Priorità:** must — **fatto**

- **ID:** F24
  **Descrizione:** Nome e proprietà app centralizzati.
  **Criteri di accettazione:** `APP_NAME` ("FitCoach Pro"), `APP_OWNER` ("Luigi Marrano"), `APP_YEAR`, `APP_COPYRIGHT`, `APP_VERSION` definiti in un solo file (`mobile/src/constants/app-info.ts`); usati da login e sezione Sviluppatore invece di stringhe ripetute.
  **Priorità:** must — **fatto**

- **ID:** F25
  **Descrizione:** Home cliente con statistiche abbonamento e navigazione alle nuove aree.
  **Criteri di accettazione:** card "N/M workout completati" (mai "rimanenti"), card prossimo allenamento assegnato, card Nutrizione/Questionario/Prenotazioni/Bacheca con anteprima reale del contenuto, link alla Chat.
  **Priorità:** must — **fatto**

- **ID:** F26
  **Descrizione:** Schermata Workout Cliente dedicata (tab Da fare/Passati), scoped al proprio `clientId`.
  **Criteri di accettazione:** lista distinta dalla vista coach (`schede/index.tsx`, che resta bloccata al cliente); ogni riga mostra nome sessione, giorno, settimana (derivata), data, numero esercizi, stato.
  **Priorità:** must — **fatto**

- **ID:** F27
  **Descrizione:** Sessione di allenamento live nel dettaglio scheda (lato cliente).
  **Criteri di accettazione:** bottone "Cardio da fare"/"Cardio completato" (solo se la scheda contiene un esercizio cardio), contatore esercizi completati "N/M", checkbox per esercizio, "Inizia allenamento" → timer di durata → "Fine allenamento" salva la durata reale e aggiorna il contatore workout completati in Home.
  **Priorità:** must — **fatto**

- **ID:** F28
  **Descrizione:** Nutrizione cliente (piano, pasti, macronutrienti, consigli, integrazioni, lista della spesa).
  **Criteri di accettazione:** se il coach non ha assegnato nulla, ogni sezione mostra uno stato vuoto professionale dichiarato ("Nessun piano nutrizionale assegnato dal tuo coach"), mai un dato finto né la parola "demo".
  **Priorità:** must — **fatto** (lato coach per assegnare i piani non esiste ancora, fuori scope di questo intervento)

- **ID:** F29
  **Descrizione:** Questionario/check-in settimanale cliente.
  **Criteri di accettazione:** peso di oggi, 3 foto (frontale/laterale/di spalle) tramite libreria immagini del dispositivo, problemi con gli esercizi, intensità percepita (4 livelli), note libere, Invia/Annulla; il check-in inviato è salvato realmente nello store locale.
  **Priorità:** must — **fatto, persistenza locale**: le foto su web sono `blob:` URL che non sopravvivono al refresh (nessun backend di upload ancora).

- **ID:** F30
  **Descrizione:** Prenotazioni sedute extra.
  **Criteri di accettazione:** il cliente vede le proprie prenotazioni confermate, può prenotare uno slot libero tra i prossimi 14 giorni, uno slot già confermato (da qualunque cliente) non è più selezionabile.
  **Priorità:** must — **fatto, logica locale**: il blocco funziona tra clienti che condividono lo stesso dispositivo/browser, non tra dispositivi diversi (serve backend per l'esclusività reale multi-dispositivo).

- **ID:** F31
  **Descrizione:** Bacheca cliente (annunci globali e personali).
  **Criteri di accettazione:** sezione "Per te" (annunci con `clientId` corrispondente) e "Annunci generali" (globali), ciascuna con titolo/testo/data/priorità; stato vuoto onesto se non ci sono annunci.
  **Priorità:** must — **fatto**

- **ID:** F32
  **Descrizione:** Chat cliente-coach.
  **Criteri di accettazione:** conversazione a bolle (cliente/coach), campo di testo e invio; il messaggio inviato dal cliente è salvato realmente nello store locale.
  **Priorità:** must — **fatto, invio locale**: nessun backend/realtime, il coach non riceve il messaggio su un altro dispositivo.

- **ID:** F33
  **Descrizione:** Tab bar cliente a 5 voci con icone.
  **Criteri di accettazione:** Home/Workout/Nutrizione/Chat/Altro, ciascuna con icona + etichetta, colore rosso se attiva/grigio se inattiva, tutte cliccabili verso la schermata corretta; le altre schermate cliente restano raggiungibili dal menu "Altro".
  **Priorità:** must — **fatto**

- **ID:** F34
  **Descrizione:** Icone su tutte le card della Home cliente.
  **Criteri di accettazione:** ogni card (Statistiche, Allenamenti, Nutrizione, Questionari, Prenotazioni, Bacheca) ha un'icona accanto al titolo; le card cliccabili portano alla schermata corretta.
  **Priorità:** must — **fatto**

- **ID:** F35
  **Descrizione:** Dettaglio esercizio come logger di sessione (lato cliente).
  **Criteri di accettazione:** una riga peso/ripetizioni per ogni serie assegnata (non un campo libero), pulsante per aggiungerne altre, pulsante di recupero collegato al timer esistente, sezione allegati con upload foto, indicatore di posizione e navigazione avanti/indietro tra gli esercizi della stessa scheda.
  **Priorità:** must — **fatto**. Segna esercizio come completato a livello di singolo esercizio: ora esiste (checkbox nel dettaglio scheda, contatore N/M), non più fuori scope.

- **ID:** F36
  **Descrizione:** Gestione abbonamento cliente (pacchetto allenamenti).
  **Criteri di accettazione:** il coach crea/aggiorna un abbonamento (nome pacchetto, totale allenamenti acquistati, completati, date inizio/fine, stato attivo/completato/scaduto/in pausa, note); il cliente vede il contatore "completati/totale" (mai "rimanenti"); completare un allenamento incrementa il contatore di 1, senza doppio conteggio.
  **Priorità:** must — **fatto, 2026-07-06**, non verificato con clic reali (vedi `docs/TODO_NEXT.md`).

- **ID:** F37
  **Descrizione:** Sessioni/schede multiple per cliente con data e ora pianificate.
  **Criteri di accettazione:** il coach può creare più schede per lo stesso cliente (es. "Petto+Tricipiti", "Dorso+Bicipiti"), ciascuna con data e ora proprie, opzionalmente collegata a un abbonamento; il cliente vede tutte le sue schede in "Da fare"/"Passati" con data/ora.
  **Priorità:** must — **fatto, 2026-07-06**, non verificato con clic reali.

- **ID:** F38
  **Descrizione:** Agenda coach reale con creazione appuntamenti e blocco sovrapposizioni.
  **Criteri di accettazione:** il coach crea un appuntamento (cliente, titolo, data, ora inizio/fine, tipo, note, scheda collegata opzionale); se lo slot (stesso coach, stessa data, orari sovrapposti, non annullato) è già occupato, il salvataggio è impedito con il messaggio "Orario non disponibile. Scegli un altro orario."
  **Priorità:** must — **fatto, 2026-07-06**, non verificato con clic reali. Vista solo lista cronologica (vista calendario mensile/settimanale resta fuori scope per ora).

- **ID:** F39
  **Descrizione:** Dettaglio cliente coach con lista schede, abbonamento e appuntamenti.
  **Criteri di accettazione:** il dettaglio cliente mostra tutte le schede assegnate (non solo l'ultima), l'abbonamento (attivo o più recente) con contatore e stato sempre visibili qualunque sia lo stato, gli appuntamenti reali, e i pulsanti "Nuova scheda"/"Nuovo appuntamento"/"Aggiorna abbonamento".
  **Priorità:** must — **fatto, 2026-07-06**, corretto un bug di visualizzazione lo stesso giorno (BUG-004: la card spariva se lo stato non era "Attivo"), non verificato con clic reali.

- **ID:** F40
  **Descrizione:** Modelli di allenamento predefiniti, copiabili e personalizzabili per cliente.
  **Criteri di accettazione:** almeno 7 modelli pronti (obiettivo, livello, giorni/settimana, durata, sessioni con esercizi reali); "Usa per cliente" crea copie reali assegnate a un cliente (e opzionalmente a un abbonamento) SENZA modificare il modello originale; le copie sono poi modificabili (esercizi, serie, ripetizioni, recuperi, cardio, data/ora) con l'editor scheda esistente.
  **Priorità:** must — **fatto, 2026-07-06**, non verificato con clic reali.

- **ID:** F41
  **Descrizione:** Icone nella tab bar coach (oltre a quella cliente, già presente).
  **Criteri di accettazione:** ogni voce della tab bar coach ha un'icona oltre all'etichetta, colore rosso se attiva/grigio se inattiva, stile coerente con la tab bar cliente.
  **Priorità:** must — **fatto, 2026-07-06** (solo lato web: il tab bar nativo iOS/Android aveva già le icone SF Symbols/Material).

- **ID:** F42
  **Descrizione:** Suono "Sirena" tra le opzioni di suono/notifica del timer di recupero.
  **Criteri di accettazione:** "Sirena" selezionabile tra i suoni in Impostazioni, riproducibile davvero con "Prova" (non un placeholder silenzioso), senza errori.
  **Priorità:** must — **fatto, 2026-07-06**: asset audio reale generato proceduralmente (non solo predisposizione/fallback).

## Fuori scope (esplicitamente non nella prima versione)

- Riproduzione video guida lato cliente (il player esiste ed è condiviso col coach, ma nessun video reale è ancora caricato)
- Notifiche push / promemoria
- **Pagamenti reali in-app** (elaborazione carte/incassi): la *gestione* dell'abbonamento (pacchetto, contatore, stato) è invece **dentro** lo scope ed è stata implementata (F36) — nessuna transazione di pagamento è coinvolta, solo tracciamento.
- Vista calendario mensile/settimanale dell'agenda (oggi solo lista cronologica, F38)
- Multi-istruttore / gestione team/palestra
- Sincronizzazione con calendari esterni (Google/Apple Calendar)
- Backend/sincronizzazione multi-dispositivo per schede/storico/impostazioni/clienti/account (persistenza locale parziale via AsyncStorage, vedi `docs/ARCHITECTURE.md`)
- Riordino esercizi via drag-and-drop (per ora frecce su/giù)
- Modifica dell'anagrafica di un cliente esistente e della nota interna (solo creazione e cambio stato)
- Autenticazione/sicurezza reale (hashing password, sessioni server, invio email reale) — vedi `docs/DECISIONS.md`
- Build App Store/TestFlight (rimandata a fase successiva, vedi `docs/TODO_NEXT.md`)

## Requisiti non funzionali

- **Performance:** liste clienti/esercizi fluide fino a qualche centinaio di record (dimensione realistica per un singolo istruttore); nessuna paginazione complessa richiesta in MVP.
- **Sicurezza:** dati clienti (anagrafica, contatti) sono dati personali — accesso isolato per istruttore (Row Level Security lato backend), nessun dato in chiaro nei log, nessuna chiave segreta nel client. Vedi skill `auth-security` quando si implementa l'autenticazione.
- **Scalabilità:** architettura dati pensata fin da subito per supportare in futuro l'accesso cliente (account separato) senza migrazione strutturale — vedi `docs/ARCHITECTURE.md` e `docs/DECISIONS.md`.
- **Compatibilità:** iOS via Expo Go per sviluppo (richiede iPhone reale o simulatore); nessun target Android richiesto esplicitamente ma il codice Expo resta cross-platform per default.
- **Accessibilità:** dimensioni testo leggibili, contrasto adeguato, target di tocco ≥44pt (linee guida iOS HIG); non è richiesto WCAG AA formale (non è web) ma si seguono le buone pratiche equivalenti di iOS.
- **Privacy/GDPR:** trattandosi di dati personali di clienti reali, va prevista un'informativa privacy minima prima di raccogliere dati reali in produzione (fuori MVP tecnico, ma da non dimenticare prima del lancio).
