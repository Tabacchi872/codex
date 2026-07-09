# BUGS.md

Registro dei bug noti. Aggiornare ad ogni intervento (skill `project-memory`, `webapp-testing`).

Formato per ogni voce:

```
## [ID] — [titolo]
- **Stato:** aperto / in corso / risolto
- **Severità:** bloccante / alta / media / bassa
- **Data apertura:**
- **Data chiusura:**
- **Descrizione:**
- **Passi di riproduzione:**
- **Fix applicato:**
```

---

## BUG-001 — ReferenceError "Audio is not defined" sulle schermate con timer di recupero
- **Stato:** risolto
- **Severità:** alta (rendering rotto su ogni schermata Dettaglio esercizio con una scheda assegnata)
- **Data apertura:** introdotto quando è stato aggiunto `RestTimer`/`SoundSettings` (sessione precedente), scoperto il 2026-07-05
- **Data chiusura:** 2026-07-05
- **Descrizione:** `expo-audio` (`useAudioPlayer`) referenzia l'API `Audio` del browser. Con `expo.web.output: "static"`, Expo Router pre-renderizza ogni rotta anche lato server (Node), dove `Audio` non esiste: il render falliva con `ReferenceError: Audio is not defined` su ogni pagina che monta `RestTimer`/`SoundSettings`. Il bug esisteva silenziosamente da quando questi componenti sono stati introdotti: le verifiche precedenti via `curl` controllavano la presenza di testo atteso ma non uno scan esplicito di "ReferenceError" su queste rotte specifiche.
- **Passi di riproduzione:** `curl http://localhost:8081/esercizi/gambe-squat` (o qualsiasi esercizio assegnato a un cliente) con `output: "static"` → risposta HTTP 200 contenente `ReferenceError: Audio is not defined`.
- **Fix applicato:** `mobile/app.json` → `expo.web.output` cambiato da `"static"` a `"single"` (SPA, nessun pre-render server-side). Vedi `docs/DECISIONS.md` per il ragionamento e la conseguenza sul metodo di verifica (non più possibile controllare il contenuto per-rotta via `curl`, serve un browser reale).

## BUG-002 — Tab bar cliente e card Home non navigano (solo Nutrizione raggiungibile)
- **Stato:** risolto (lato web); rischio residuo lato nativo non verificato
- **Severità:** bloccante (l'intero lato cliente, tranne una schermata, era irraggiungibile)
- **Data apertura:** introdotto insieme alla tab bar a 5 voci (sessione precedente, 2026-07-05), segnalato dall'utente il 2026-07-05
- **Data chiusura:** 2026-07-05
- **Descrizione:** `client-tabs.web.tsx` usava le Tabs "headless" di `expo-router/ui` (`<Tabs><TabSlot/><TabList><TabTrigger .../></TabList></Tabs>`). Leggendo il sorgente installato (`node_modules/expo-router/build/ui/common.js`, funzione `triggersToScreens`), questo componente costruisce un navigator React Navigation che conosce **solo** gli schermi elencati esplicitamente come `<TabTrigger>` (e i loro discendenti nel filesystem). Le 5 tab dichiarate (`cliente-home`, `workout`, `nutrizione`, `chat`, `altro`) erano tutte foglie senza figli: qualunque altra rotta cliente — `prenotazioni`, `bacheca`, `questionario`, `cliente-profilo`, `progressi`, e persino `schede/[id]`/`esercizi/[id]` aperti dalla card "Allenamenti" — non era un discendente di nessuna delle 5 e restava quindi **invisibile a quel navigator**: `router.push()` verso quelle rotte non aveva alcuno schermo registrato a cui approdare. "Nutrizione" sembrava funzionare proprio perché, a differenza delle altre, era una delle 5 rotte effettivamente registrate.
- **Passi di riproduzione:** da cliente, toccare una card Home diversa da "Nutrizione" (es. "Allenamenti", "Questionari", "Prenotazioni", "Bacheca") o le voci del menu "Altro": nessuna navigazione avviene.
- **Fix applicato:** `client-tabs.web.tsx` riscritto usando `Slot` (primitivo standard di `expo-router`, non `expo-router/ui`) come contenuto, invece delle Tabs headless. Verificato nel sorgente (`node_modules/expo-router/build/views/Navigator.js`, `SlotNavigator`) che `Slot` costruisce i suoi schermi da `useSortedScreens` sull'**intero albero di file** della rotta corrente, non da una lista chiusa dichiarata a mano: qualunque rotta esistente è quindi raggiungibile. La tab bar in basso resta identica nell'aspetto (stesse icone/colori/layout) ma ora è costruita con `Pressable` + `router.push()` + `usePathname()` per lo stato attivo, senza alcun meccanismo di navigazione "nascosto". Aggiunto `screenOptions={{ headerShown: false }}` allo `Slot` per evitare che lo Stack sottostante mostri un header nativo di default non previsto dal design. Nessuna modifica alla grafica, alle card, alla struttura dati o al lato coach (che usa file separati e non è stato toccato).
- **Rischio residuo:** la tab bar cliente **nativa** (`client-tabs.tsx`, iOS/Android via `NativeTabs`) usa lo stesso meccanismo a "trigger dichiarati" e molto probabilmente ha lo stesso limite strutturale, ma non è stato possibile verificarlo né corregerlo in questa sessione (ambiente Windows senza simulatore, test solo via Expo Web). Va rivisto prima di un test reale su device.

## BUG-003 — WorkoutPlanForm azzerava lo stato di avanzamento sessione in modifica
- **Stato:** risolto
- **Severità:** alta (perdita silenziosa di dati: sessione completata poteva tornare "da fare" salvando una modifica minima)
- **Data apertura:** introdotto quando `WorkoutPlan.sessionStatus`/`startedAt`/`completedExerciseIds`/`durationSeconds` furono aggiunti (sessione 2026-07-05), scoperto il 2026-07-06
- **Data chiusura:** 2026-07-06
- **Descrizione:** `WorkoutPlanForm.handleSave` costruiva l'oggetto `WorkoutPlan` da salvare includendo solo i campi gestiti dal form (nome, cliente, date, esercizi). In modalità "modifica scheda esistente" (`schede/[id].tsx`, mode='edit'), questo significava che `sessionStatus`, `startedAt`, `completedExerciseIds`, `durationSeconds` — tutti presenti su `initialPlan` ma non ripassati a `onSave` — venivano scritti come `undefined` nello store, azzerando silenziosamente lo stato di avanzamento di una sessione già in corso o completata. Mai notato prima perché non era mai stato verificato un giro "completa sessione → poi modifica scheda → controlla se lo stato è ancora completato".
- **Passi di riproduzione:** completare una sessione (sessionStatus='completed'), poi da coach premere "Modifica scheda", cambiare un campo qualsiasi (es. il nome) e salvare: lo stato tornava a "Da fare" e `completedExerciseIds`/`durationSeconds` sparivano.
- **Fix applicato:** `components/workout-plan-form.tsx`, `handleSave` ora ripassa esplicitamente `sessionStatus`, `startedAt`, `completedExerciseIds`, `durationSeconds`, `completedAt` da `initialPlan` (oltre ai nuovi campi `coachId`/`subscriptionId`/`scheduledTime`/`dayLabel`/`weekLabel`), invece di ometterli.
- **Verifica:** corretto per lettura del codice e tramite typecheck; **non verificato con un clic reale in browser** in questa sessione (nessun tool di automazione browser disponibile) — da confermare aprendo l'app di persona: completare una sessione, modificarne il nome, controllare che resti "Completato".

## BUG-004 — Card Abbonamento spariva cambiando lo status (sembrava che il salvataggio non funzionasse)
- **Stato:** risolto
- **Severità:** alta (il coach non riusciva più a vedere/gestire l'abbonamento dopo un cambio di stato, sembrando un salvataggio fallito)
- **Data apertura:** introdotta con `SubscriptionPackage`/`clienti/[id].tsx` (2026-07-06, parte 1), scoperta e segnalata dall'utente il 2026-07-06
- **Data chiusura:** 2026-07-06
- **Descrizione:** la card "Abbonamento" nel dettaglio cliente calcolava `activeSubscription = subscriptions.find(s => s.status === 'active')` e mostrava i dettagli SOLO se questo esisteva; in caso contrario mostrava "Nessun abbonamento attivo". Cambiare lo stato di un abbonamento esistente (es. da Attivo a In pausa/Completato/Scaduto) tramite "Aggiorna abbonamento" salvava correttamente il nuovo stato nello store (`updateSubscription` sostituisce l'intero oggetto), ma la UI smetteva immediatamente di mostrare QUALSIASI informazione su quell'abbonamento — dando l'impressione, dal punto di vista del coach, che la modifica non fosse stata salvata o fosse stata "persa".
- **Passi di riproduzione:** creare un abbonamento (status Attivo), aprire "Aggiorna abbonamento", cambiare lo stato in "In pausa" e salvare: tornati al dettaglio cliente, la card mostrava "Nessun abbonamento attivo" invece del pacchetto con stato "In pausa".
- **Fix applicato:** `app/clienti/[id].tsx` introduce `displaySubscription` = l'abbonamento attivo se esiste, altrimenti il più recente per data di inizio tra tutti quelli del cliente — sempre mostrato con `SUBSCRIPTION_STATUS_LABEL[displaySubscription.status]` esplicito. "Nessun abbonamento" (testo aggiornato, non più "attivo") compare solo se il cliente non ha mai avuto nessun abbonamento. Aggiunto anche il valore `'cancelled'`, mancante da `SubscriptionStatus`.
- **Verifica:** corretto per lettura del codice (la logica di salvataggio nello store è stata riverificata ed è sempre stata corretta) e tramite typecheck; **non verificato con un clic reale in browser** — da confermare: cambiare stato di un abbonamento più volte e controllare che la card rifletta ogni volta il valore corretto.

## BUG-005 — Stato "Saltato" restava bloccato dopo qualunque modifica alla scheda
- **Stato:** risolto
- **Severità:** media (una sessione saltata non poteva più essere riprogrammata modificandola, serviva un giro manuale con i chip di stato)
- **Data apertura:** effetto collaterale del fix di BUG-003 (2026-07-06, parte 1), scoperto e segnalato dall'utente il 2026-07-06
- **Data chiusura:** 2026-07-06
- **Descrizione:** dopo il fix di BUG-003 (che ha reso `WorkoutPlanForm.handleSave` corretto nel preservare `sessionStatus` invece di azzerarlo), modificare una scheda con stato "Saltato" tramite "Modifica scheda" la lasciava bloccata su "Saltato" per sempre, anche cambiando data/ora — prima del fix di BUG-003 questo non si notava perché lo stato veniva azzerato a "Da fare" ad ogni modifica (comportamento sbagliato ma che nascondeva questo problema).
- **Passi di riproduzione:** impostare una sessione su "Saltato" (chip di stato), poi da "Modifica scheda" cambiare data/ora e salvare: lo stato restava "Saltato" invece di tornare "Da fare"/Programmato.
- **Fix applicato:** `app/schede/[id].tsx`, `handleSave`: se la sessione era `'skipped'` e la data (`startDate`) o l'ora (`scheduledTime`) sono cambiate rispetto al valore precedente, lo stato torna automaticamente a `'todo'`. Se non cambiano data/ora, "Saltato" resta invariato (comportamento corretto: cambiare solo il nome non deve riprogrammare la sessione). Il coach può comunque sempre impostare manualmente lo stato tramite i chip in modalità vista, indipendentemente da questo automatismo.
- **Verifica:** corretto per lettura del codice e tramite typecheck; **non verificato con un clic reale in browser** — da confermare: impostare "Saltato", cambiare data, controllare che torni "Da fare"; impostare "Saltato", cambiare solo il nome, controllare che resti "Saltato".

## BUG-006 — Dettaglio Esercizio cliente: input "Ripetizioni" tagliato e Allegati coperto dalla tab bar su schermi stretti (360px)
- **Stato:** risolto
- **Severità:** alta (schermata centrale del logging allenamento illeggibile/inutilizzabile su schermi stretti, es. 360px)
- **Data apertura:** introdotta con `ExerciseSetLogger` (sessione 2026-07-05, "Tab bar cliente a 5 voci... Dettaglio esercizio come logger di sessione"), segnalata dall'utente il 2026-07-06
- **Data chiusura:** 2026-07-06
- **Descrizione:** due problemi distinti. (1) `exercise-set-logger.tsx`: ogni riga "Serie" era `flexDirection: 'row'` con un'etichetta a larghezza fissa (`width: 60`) seguita da due `ThemedTextInput` con `flex: 1` ma senza `minWidth: 0`. Su RN Web, un flex item senza `minWidth: 0` non si restringe sotto la dimensione "di contenuto" del suo elemento nativo (l'input HTML): con card/schermo stretti (360px) lo spazio disponibile per i due input scendeva sotto quella soglia, e il secondo input ("Ripetizioni") veniva letteralmente tagliato dal bordo della cornice `WebPhoneFrame`, che ha `overflow: 'hidden'` (necessario per gli angoli arrotondati del mockup telefono) — quindi il contenuto in eccesso spariva invece di andare in scroll orizzontale visibile. (2) `app/esercizi/[id].tsx`: il `ScrollView` aveva `paddingBottom: Spacing.six` (64, fisso), a differenza delle altre schermate cliente (`cliente-home.tsx`, `workout.tsx`) che usano `insets.bottom + BottomTabInset + Spacing.four`: mancava il margine di respiro extra e, su nativo, l'inset di sicurezza reale del dispositivo — la sezione "Allegati" (ultimo blocco visibile) restava quindi troppo vicina/sotto la tab bar fissa.
- **Passi di riproduzione:** aprire Dettaglio Esercizio lato cliente (es. "Squat") con l'anteprima Expo Web impostata a 360px: l'input "Ripetizioni" di ogni riga Serie appariva tagliato a destra; scorrendo fino in fondo, "Allegati" risultava troppo vicino alla tab bar in basso.
- **Fix applicato:** `components/exercise-set-logger.tsx` — ogni riga Serie ora mostra l'etichetta "Serie N" su una riga propria e Peso/Ripetizioni in una riga sottostante dedicata (`setInputsRow`, `flexDirection: 'row'`, due figli `flex: 1` con `minWidth: 0` come sicurezza aggiuntiva): ciascun input ha sempre a disposizione metà della larghezza della card, indipendentemente dalla larghezza dello schermo, senza fare affidamento sullo shrink dei flex item. Aggiunto anche `width: '100%'`/`maxWidth: '100%'` al contenitore per escludere overflow dal lato della card. `app/esercizi/[id].tsx` — `paddingBottom` del `ScrollView` allineato al pattern già usato nelle altre schermate cliente: `insets.bottom + BottomTabInset + Spacing.five` (margine leggermente più generoso, dato il contenuto lungo di questa schermata).
- **Verifica:** corretto per lettura del codice (calcolo esplicito della larghezza disponibile nella cornice a 360px, che ha bordo `borderWidth: 6` incluso nel `width` — RN usa box-sizing border-box) e tramite typecheck (0 errori) + smoke test HTTP; **non verificato con uno screenshot/clic reale in browser** (nessun tool di automazione/screenshot disponibile in questo ambiente) — da confermare aprendo la preview a 360/390/430px e controllando visivamente Dettaglio Esercizio.

## BUG-007 — Registrazione cliente Supabase faceva login automatico anche con email non confermata
- **Stato:** risolto
- **Severità:** alta (con "Confirm email" attivo su Supabase, un cliente entrava subito nell'app senza aver mai confermato l'indirizzo, e un secondo bypass permetteva login locale con password in chiaro anche a email non confermata)
- **Data apertura:** introdotta con il collegamento Supabase Fase 1 (2026-07-08), scoperta durante l'implementazione della Fase 2 email vere (2026-07-09) — mai innescata prima perché "Confirm email" non era ancora stato provato attivo con un progetto reale
- **Descrizione:** due problemi collegati. (1) `ClientRegistrationScreen.handleRegister` (`registration-screens.tsx`), dopo `signUpClientWithCoachCode`, ignorava `result.data.session`: se Supabase aveva "Confirm email" attivo, `session` tornava `null` (utente non ancora confermato), ma l'app creava comunque il mirror locale e chiamava `loginAsClient` + redirect a `/cliente-home`, facendo finta che l'utente fosse attivo. (2) Anche lato login, se poi l'utente tentava un accesso reale prima della conferma, `signInWithEmail` falliva con "Email not confirmed", ma `login-screen.tsx` non distingueva questo errore dagli altri e ricadeva sui controlli locali (`coachAccounts`/`accounts` con password in chiaro) — record locali scritti in fase di registrazione (sia coach sia cliente) permettevano quindi un secondo bypass di login anche a email non confermata.
- **Passi di riproduzione:** con "Confirm email" attivo su un progetto Supabase reale, registrare un cliente (o un coach) e osservare l'ingresso immediato nell'app senza mai aver cliccato il link di conferma ricevuto via email.
- **Fix applicato:** `registration-screens.tsx` — `ClientRegistrationScreen` ora controlla `result.data.session`: se `null`, mostra una schermata dedicata "Controlla la tua email" (nessun mirror locale scritto, nessun `loginAsClient`, nessun redirect); `CoachRegistrationScreen` mostra un avviso equivalente sulla schermata "Il tuo codice coach" (non faceva comunque login automatico, ma prima non segnalava la conferma email richiesta). `login-screen.tsx` — aggiunto un controllo esplicito sul nuovo codice errore `email_not_confirmed` (`auth-service.ts`, `mapAuthErrorCode`): se presente, mostra un messaggio dedicato e interrompe subito, senza più ricadere sui controlli locali che avrebbero permesso il bypass.
- **Verifica:** `npx tsc --noEmit` pulito, `npx expo-doctor` 20/20, bundle Metro compilato senza errori con le nuove schermate incluse (smoke test HTTP su porta locale di test). **Non ancora verificato end-to-end con un progetto Supabase reale e "Confirm email" attivo** (serve un'inbox email reale, non disponibile in questo ambiente) — da fare dall'utente, vedi `docs/EMAIL_SETUP.md` sezione "Come testare da web".

## Nota — Expo Go su telefono non funziona correttamente
- **Stato:** aperto, non bloccante (Expo Web resta l'ambiente di sviluppo principale, come da indicazione esplicita dell'utente)
- **Severità:** media (blocca solo il test su device fisico, non lo sviluppo)
- **Descrizione:** l'utente segnala che Expo Web funziona ma Expo Go su telefono no. Non è stato possibile riprodurre/diagnosticare il problema in questa sessione (nessun accesso a un device fisico, nessun log di Expo Go disponibile): non è quindi classificabile come un bug puntuale con causa nota, a differenza di BUG-001/002/003. Ipotesi più probabile, da verificare quando sarà possibile testare su device: le dipendenze native del progetto (`expo-audio`, `expo-video`, `react-native-reanimated` 4.x, `react-native-worklets`, `react-native-gesture-handler`) richiedono spesso una build nativa allineata esattamente alla versione installata; Expo Go pubblica un binario generico che può non contenere i moduli nativi giusti o le versioni giuste per queste librerie, soprattutto per `react-native-worklets`/reanimated 4 (più recenti e con requisiti nativi più stringenti). Vedi `docs/TODO_NEXT.md` per il prossimo passo consigliato (development build EAS).
