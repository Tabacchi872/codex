# ARCHITECTURE.md

Architettura tecnica di **FitCoach Pro** (nome definito in `mobile/src/constants/app-info.ts`; in questo file compariva prima come "CoachDesk", nome di lavoro superato — vedi `docs/DECISIONS.md`) — app iPhone Expo/React Native per personal trainer, proprietario Luigi Marrano.

## Stack attuale (implementato)

- **Frontend/App:** Expo SDK 57 (managed workflow) + React Native 0.86 + TypeScript + Expo Router (file-based: tab bar in basso + stack per schermata)
- **Stato applicativo:** Zustand, con middleware `persist` per la persistenza locale (vedi sotto)
- **Persistenza dati (provvisoria, no backend):** `@react-native-async-storage/async-storage` (supporta Android/iOS/Web), dietro `zustand/middleware persist` — vedi "Persistenza locale" sotto
- **Video guida esercizi:** **solo file locali** in `mobile/assets/videos/`, mai URL YouTube/embed esterni — riprodotti con `expo-video` (`useVideoPlayer` + `VideoView`)
- **Audio (timer di recupero):** `expo-audio` (`useAudioPlayer`), 3 toni generati proceduralmente in `mobile/assets/sounds/*.wav` (nessuna libreria audio esterna scaricata)
- **Vibrazione:** API nativa `Vibration` di React Native (no-op su web, dichiarato esplicitamente in UI)
- **Backend/dati reali:** non ancora presente — pianificato Supabase, vedi "Percorso futuro"

## Perché Zustand + AsyncStorage e non Supabase fin da subito (revisione della decisione originale)

La decisione iniziale (vedi `docs/DECISIONS.md`, voce storica) prevedeva Supabase fin dal Day 1. In pratica, prima di introdurre un backend serve una UI/logica di dominio stabile (parametri di allenamento, timer, storico) da collegare — costruirla su Supabase da subito avrebbe voluto dire progettare schema+RLS+auth prima di aver validato i flussi. Si è quindi scelto uno store locale (Zustand + AsyncStorage) come **passo intermedio esplicito**, così da poter iterare rapidamente su struttura dati e UI. Il passaggio a Supabase (Step 1 in `docs/TODO_NEXT.md`) resta il prossimo passo previsto e non richiede di riscrivere la UI, solo di sostituire lo storage layer.

## Persistenza locale (dichiarazione esplicita dei limiti)

**Persistenza locale parziale.** Quattro store Zustand, ciascuno con `persist` su AsyncStorage, chiavi separate:
- `training-store.ts` (`coachdesk-training-store`) — `workoutPlans`, `progressHistory`, `soundSettings`
- `client-store.ts` (`coachdesk-client-store`) — `clients`, `accounts` (credenziali cliente)
- `auth-store.ts` (`coachdesk-auth-store`) — sessione demo (`isAuthenticated`, `currentRole`, `currentClientId`)
- `theme-store.ts` (`coachdesk-theme-store`) — preferenza tema (`mode`)

Per tutti vale:
- I dati sopravvivono al refresh della preview web e alla chiusura/riapertura dell'app.
- I dati **non sono sincronizzati** tra dispositivi diversi (né tra browser diversi in preview web): vivono solo sul dispositivo/browser che li ha scritti.
- Non c'è backup, non c'è multi-utente reale, non c'è risoluzione dei conflitti.
- `client-store.ts` salva `ClientAccount.temporaryPassword` **in chiaro**: accettabile solo perché l'intero sistema di login è dichiarato ovunque come demo locale — vedi `docs/DECISIONS.md`.

L'anagrafica clienti (`Client`, `mobile/src/types/client.ts`) è ora nello store persistito (non più statica): "Aggiungi cliente" scrive dati reali che sopravvivono al refresh, non un mock.

## Regola architetturale: Exercise vs WorkoutExercise vs ExerciseProgressHistory

Tre livelli distinti, mai fusi in un solo tipo (vedi `docs/DECISIONS.md`):
1. **`Exercise`** (`mobile/src/data/exercise-library.ts`) — il movimento in sé (nome, gruppo muscolare, descrizione, note tecniche, difficoltà, attrezzatura, video). Nessun dato di allenamento.
2. **`WorkoutExercise`** — l'esercizio dentro una scheda di un cliente specifico: serie, ripetizioni, peso target, recupero, tempo, note, ordine. Lo stesso `Exercise` può comparire in più `WorkoutExercise` con parametri diversi.
3. **`ExerciseProgressHistory`** — cosa è successo realmente in una sessione (peso usato, serie/ripetizioni completate, note, sforzo percepito), collegato a cliente + esercizio + scheda. È la fonte per "ultimo peso" e "miglior peso recente", non `WorkoutExercise` (che descrive l'assegnazione, non lo storico).

## Struttura moduli principali (attuale)

- `mobile/src/app/` — Expo Router: route/schermate coach (tabs, stack per `clienti/`, `esercizi/`, `schede/`) + route cliente flat (`cliente-home.tsx`, `cliente-profilo.tsx`)
- `mobile/src/types/training.ts` — tipi di dominio allenamento (`Exercise`, `WorkoutExercise` con `techniqueType`/`supersetGroupId`, `WorkoutPlan` con `sessionStatus`, `ExerciseProgressHistory`, `SoundSettings`)
- `mobile/src/types/client.ts` — `Client`, `ClientStatus`, `ClientAccount` (credenziali demo)
- `mobile/src/types/auth.ts` — `UserRole` (`coach` | `client`)
- `mobile/src/data/exercise-library.ts` — libreria dei 44 esercizi seed, raggruppati per `MuscleGroup`
- `mobile/src/data/video-registry.ts` / `sound-registry.ts` / `image-registry.ts` — registri espliciti `require()` per asset locali (Metro non supporta require dinamici per stringa)
- `mobile/src/data/seed-workout-plans.ts` / `seed-clients.ts` — dati iniziali usati solo al primissimo avvio
- `mobile/src/store/training-store.ts` / `client-store.ts` / `auth-store.ts` / `theme-store.ts` — store Zustand persistiti (vedi sopra)
- `mobile/src/lib/client-status.ts` — stato **scheda** cliente derivato dalla scadenza (mai salvato come campo)
- `mobile/src/lib/client-helpers.ts` — helper puri su `Client[]` (`getClientById`, `clientFullName`)
- `mobile/src/lib/credentials.ts` — generazione username/password demo e testo credenziali
- `mobile/src/hooks/use-effective-color-scheme.ts` — combina preferenza tema salvata + schema di sistema; unico punto letto da `useTheme()`, tab bar nativa e `ThemeProvider`
- `mobile/src/components/auth-gate.tsx` — decide cosa mostrare in base allo stato di autenticazione demo (login → cambio password → tab cliente/coach)
- `mobile/src/components/` — oltre ai componenti allenamento già esistenti: `login-screen.tsx`, `change-password-screen.tsx`, `theme-settings.tsx`, `client-tabs.tsx`/`.web.tsx`, `coach-only-notice.tsx`
- `mobile/src/constants/app-info.ts` — unico punto con `APP_NAME`/`APP_OWNER`/`APP_YEAR`/`APP_COPYRIGHT`/`APP_VERSION` (versione letta da `expo-constants`, non duplicata a mano)
- `mobile/src/components/screen-background.tsx` — wrapper unico applicato a tutte le schermate: colore di sfondo del tema + pattern grafico (`FitnessPattern`) a opacità molto bassa (4-8%, più discreta in dark), mai sopra il contenuto
- `mobile/src/components/fitness-pattern.tsx` — pattern decorativo (manubri/cerchi) disegnato con `View` pure, non un'immagine: nessun asset da caricare, nessun problema di tiling multipiattaforma
- `mobile/src/components/developer-info-section.tsx` — card "Sviluppatore" (nome, proprietario, versione, anno, copyright, ringraziamenti), usata sia in `impostazioni.tsx` (coach) sia in `cliente-profilo.tsx` (cliente), stesso componente per non duplicare testo/layout
- `mobile/src/app/{workout,nutrizione,questionario,prenotazioni,bacheca,chat}.tsx` — schermate cliente nuove (route flat, come `cliente-home.tsx`), ciascuna scoped al `currentClientId` autenticato, mai alla lista completa dei clienti
- `mobile/src/store/{nutrition,checkin,booking,board,chat}-store.ts` — store Zustand persistiti (prefisso chiave `fitcoach-*`, per distinguerli dai vecchi `coachdesk-*`), uno per dominio: piani nutrizionali (sola lettura lato cliente, nessuna UI coach per assegnarli ancora), check-in settimanali, prenotazioni, bacheca, chat
- `mobile/src/lib/workout-progress.ts` — derivazioni sullo stato allenamento cliente: totale/completati per il contatore abbonamento, prossimo allenamento, numero settimana (posizionale, non salvato), progresso esercizi completati nella sessione live, id degli esercizi cardio di una scheda (via `MuscleGroup === 'Cardio/Funzionale'`)
- `mobile/src/lib/booking-slots.ts` — generazione slot prenotabili (14 giorni, orari fissi) e marcatura "occupato" in base a tutte le prenotazioni confermate nello store, non filtrate per cliente
- `mobile/src/components/workout-session-controls.tsx` — Inizia/Fine allenamento + timer di durata (persistito via `WorkoutPlan.startedAt`, sopravvive al refresh), usato solo lato cliente in `schede/[id].tsx`
- `mobile/src/app/altro.tsx` / `mobile/src/app/progressi.tsx` — menu cliente (Profilo/Impostazioni/Storico pesi/Metriche/Progressi/Abbonamento/Bacheca/Prenotazioni) e schermata "Progressi" condivisa (peso da check-in + kpi allenamento), raggiungibili dalla tab "Altro"
- `mobile/src/components/exercise-set-logger.tsx` — sezione "Serie" del dettaglio esercizio (solo cliente): una riga peso/ripetizioni per ogni serie assegnata, "+ Serie", bottone "Rec." che avvia `RestTimer` (prop `autoStartToken`) invece di duplicarne la logica
- `mobile/src/components/exercise-attachments.tsx` + `mobile/src/store/attachment-store.ts` — allegati per esercizio (foto), persistiti, upload via `expo-image-picker`
- `mobile/src/types/subscription.ts` + `mobile/src/store/subscription-store.ts` — abbonamento cliente reale (`SubscriptionPackage`): pacchetto, totale/completati, date, stato, note. `completedWorkouts` è persistito ed editabile (non solo derivato), vedi `docs/DECISIONS.md`
- `mobile/src/types/appointment.ts` + `mobile/src/store/appointment-store.ts` + `mobile/src/lib/appointment-overlap.ts` — agenda coach reale (`Appointment`), distinta da `Booking`/`booking-store.ts` (prenotazione self-service cliente su slot fissi): creazione con controllo anti-sovrapposizione (stesso coach, stessa data, orari che si intersecano, esclusi gli annullati)
- `mobile/src/components/subscription-form.tsx` — form condiviso creazione/modifica abbonamento, usato da `app/clienti/abbonamento-nuovo.tsx` e `app/clienti/abbonamento-modifica.tsx`
- `mobile/src/app/appuntamenti/{index,new,_layout}.tsx` — agenda coach (lista reale + creazione), sostituisce il vecchio file flat `appuntamenti.tsx` (era interamente placeholder)
- `mobile/src/lib/workout-progress.ts` — oltre alle derivazioni preesistenti: `getActiveSubscription`/`getWorkoutCounter` (contatore abbonamento-aware con fallback legacy), `getSessionDayLabel`/`getSessionWeekLabel` (preferiscono l'override esplicito del coach su `WorkoutPlan.dayLabel`/`weekLabel`, altrimenti derivano come prima)
- `mobile/src/types/workout-template.ts` + `mobile/src/data/workout-plan-templates.ts` (2026-07-06, parte 2) — 7 modelli di allenamento predefiniti, dati statici mai mutati (stesso pattern di `EXERCISE_LIBRARY`, non uno store persistito: vedi `docs/DECISIONS.md`). `mobile/src/lib/workout-template-copy.ts` converte gli esercizi di una sessione del modello in `WorkoutExercise` reali (id nuovi, `targetWeight: null`). Schermate `mobile/src/app/schede/modelli/{index,[id],_layout}.tsx`: lista, dettaglio con azione "Usa per cliente" che genera N `WorkoutPlan` reali via `addWorkoutPlan` (mai il modello originale), poi modificabili con `WorkoutPlanForm`/`schede/[id].tsx` già esistenti.

## Video e audio locali: come funzionano davvero

Metro (bundler Expo) richiede `require()` statici per gli asset: non si può caricare un file per path stringa a runtime. Per questo:
- **Video** (`mobile/src/data/video-registry.ts`): registro `Record<string, number>` **vuoto di default**. `Exercise.videoStatus` è calcolato (non scritto a mano) controllando se `videoFile` ha una voce nel registro: se non c'è, `ExerciseVideoPlayer` mostra "Video locale mancante" e non tenta nessun require dinamico né fallback a URL esterni. Aggiungere un video reale richiede: (1) copiare il file in `mobile/assets/videos/`, (2) aggiungere una riga `require(...)` nel registro — vedi il README nella cartella.
- **Audio**: a differenza dei video, i 3 suoni di recupero **esistono davvero** (generati proceduralmente come WAV validi, non placeholder) e sono già nel registro: il timer di recupero produce un suono reale, non solo dichiarato.

## Tema chiaro/scuro/sistema

`theme-store.ts` salva solo `mode: 'light' | 'dark' | 'system'`. `useEffectiveColorScheme()` combina questa preferenza con lo schema del sistema operativo/browser (`useColorScheme()`) e restituisce sempre `'light' | 'dark'`. Tre punti nel codice leggono da lì (mai da `useColorScheme()` di React Native direttamente): `useTheme()` (colori dei componenti), `app-tabs.tsx` (tab bar nativa), `app/_layout.tsx` (tema di React Navigation per header nativi). Cambiare l'impostazione in Impostazioni aggiorna tutta l'app immediatamente perché tutti questi punti sono hook Zustand reattivi, non letture una tantum.

## Autenticazione demo e navigazione per ruolo

**Nessuna autenticazione reale.** `auth-store.ts` tiene `isAuthenticated`, `currentRole` (`coach` | `client`), `currentClientId`. Il login (`login-screen.tsx`) confronta username/email e password **in chiaro** con gli account salvati in `client-store.ts` — nessun server, nessun hashing, nessuna sessione verificabile. Vedi `docs/DECISIONS.md`.

`components/auth-gate.tsx`, montato da `app/_layout.tsx` al posto del vecchio `<AppTabs/>` diretto, decide cosa renderizzare:
1. Non autenticato → `LoginScreen`
2. Cliente con `mustChangePassword: true` → `ChangePasswordScreen`
3. Cliente → `ClientTabs` (`cliente-home`, `cliente-profilo`)
4. Coach → `AppTabs` (invariata)

Le schermate coach-only che restano route indipendenti (`clienti/*`, `schede/index`, `appuntamenti/*`) si proteggono da sole con un controllo `currentRole !== 'client'` in testa (mostrano `CoachOnlyNotice` altrimenti). **Questa è una barriera di contenuto lato UI, non un vero controllo di accesso**: chi conoscesse l'URL esatto in preview web potrebbe comunque tentare di navigarci; l'app si limita a non mostrare il contenuto, non impedisce la navigazione a livello di router. Per `schede/[id]` ed `esercizi/[id]` (condivisi tra coach e cliente) il controllo è più fine: le azioni di modifica/eliminazione sono nascoste per i clienti, e la lista di assegnazioni in `esercizi/[id]` è filtrata al solo `currentClientId` per un account cliente.

**Vincolo di routing per le nuove schermate coach (importante, vedi `docs/BUGS.md` BUG-002):** `components/app-tabs.web.tsx` (tab bar coach) usa le stesse Tabs "headless" di `expo-router/ui` che causarono BUG-002 lato cliente — il navigator riconosce solo le rotte dichiarate come `TabTrigger` (`index`, `clienti`, `esercizi`, `schede`, `appuntamenti`, `impostazioni`) e i loro discendenti nel filesystem. Per questo `abbonamento-nuovo.tsx`/`abbonamento-modifica.tsx` vivono dentro `app/clienti/`, la creazione appuntamento dentro `app/appuntamenti/new.tsx`, e i modelli di allenamento dentro `app/schede/modelli/` (tutte discendenti di tab già registrate): qualunque nuova schermata coach raggiungibile da `router.push`/link deve essere un discendente di una di queste sei cartelle, altrimenti sarà invisibile al navigator esattamente come in BUG-002. Vedi `docs/DECISIONS.md` (2026-07-06). Le icone aggiunte alla tab bar coach (2026-07-06, parte 2) sono puramente additive dentro `TabButton` — non toccano il meccanismo Tabs/TabTrigger, quindi non introducono questo rischio.

## Schema dati (tipi TypeScript attuali)

Vedi `mobile/src/types/training.ts`, `client.ts`, `auth.ts` per i tipi completi. Riepilogo:

```
Exercise { id, name, muscleGroup, description, technicalNotes, difficulty, equipment, videoFile, videoStatus }
WorkoutExercise { id, exerciseId, sets, reps, repsMin?, repsMax?, targetWeight, restSeconds, tempo?, notes, order, techniqueType?, supersetGroupId? }
WorkoutPlan { id, name, clientId, startDate, expiryDate, exercises: WorkoutExercise[], sessionStatus?,
              startedAt?, completedExerciseIds?, durationSeconds?, completedAt?,
              coachId?, subscriptionId?, scheduledTime?, dayLabel?, weekLabel? }
ExerciseProgressHistory { id, clientId, exerciseId, workoutPlanId, date, setsCompleted, repsCompleted, weightUsed, restUsed, notes, perceivedEffort?, createdAt }
SoundSettings { restSoundEnabled, restSoundVolume, countdownSoundEnabled, finishSoundEnabled, vibrationEnabled, selectedSound }

SubscriptionPackage { id, clientId, coachId, packageName, totalWorkoutsPurchased, completedWorkouts, startDate, endDate?, status, notes?, createdAt, updatedAt }
Appointment { id, clientId, coachId, workoutSessionId?, title, date, startTime, endTime, status, type, notes?, createdAt }

Client { id, firstName, lastName, email, phone?, birthDate?, goal, notes, status, createdAt }
ClientAccount { id, clientId, username, email, temporaryPassword, role: 'client', mustChangePassword, status: 'active', createdAt }
ThemeMode = 'light' | 'dark' | 'system'
```

`techniqueType`/`supersetGroupId` e `sessionStatus` sono **opzionali e additivi**: una `WorkoutPlan`/`WorkoutExercise` creata prima di questa modifica resta valida (trattata come `'normal'`/`'todo'`). Stesso principio per i campi aggiunti il 2026-07-06 (`coachId`, `subscriptionId`, `scheduledTime`, `dayLabel`, `weekLabel`, `completedAt`, stato `cancelled`): tutti opzionali, nessuna scheda esistente è invalidata. **`WorkoutPlan` è il modello che nel planning di prodotto viene chiamato "WorkoutSession"** — non rinominato, vedi `docs/DECISIONS.md` (2026-07-06) per il perché.

**Nota rispetto alla bozza Supabase precedente:** `WorkoutPlan` ora appartiene direttamente a un cliente (`clientId` singolo), non è più un template condiviso tramite tabella ponte (`client_workout_assignments`). Semplificazione esplicita su richiesta dell'utente, coerente con l'uso reale (schede personalizzate per cliente). Se in futuro servirà riutilizzare una scheda come template per più clienti, si affronterà come estensione separata.

**Stato cliente e stato scheda non sono campi salvati**: entrambi derivano da `computeWorkoutPlanStatus(expiryDate)` (`mobile/src/types/training.ts`), mai duplicati o scritti a mano.

## Percorso futuro (non MVP, non ora)

- Migrazione da AsyncStorage a **Supabase** (Postgres + Auth + Storage + RLS) per persistenza reale multi-dispositivo — necessaria anche solo per usare l'app da più di un iPhone/browser, non solo per il futuro accesso cliente
- App/portale cliente separato sullo stesso backend
- Notifiche push (Expo Notifications) per promemoria scadenze/appuntamenti
- Upload video reali in `mobile/assets/videos/` (o migrazione a storage remoto se i file diventano troppo pesanti per il bundle dell'app)
- EAS Build per build iOS reale, distribuzione TestFlight, poi App Store

## Decisioni infrastrutturali

Vedi `docs/DECISIONS.md` per il ragionamento completo dietro le scelte sopra, incluse quelle superate/riviste.
