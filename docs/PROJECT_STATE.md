# PROJECT_STATE.md

Snapshot dello stato attuale del progetto. Questo file va **sovrascritto** ad ogni aggiornamento (non è un log): riflette sempre lo stato presente, non la storia. Per la storia vedi `WORKLOG.md`.

**Ultimo aggiornamento:** 2026-07-06

## Fase del progetto
Sviluppo MVP — lato Coach/Admin considerato l'ultimo aggiornamento prima di passare al lato cliente. Oltre ad abbonamenti/sessioni multiple/agenda, sono stati corretti due bug reali lato coach (visualizzazione status abbonamento, stato "saltato" bloccato) e aggiunti: modelli di allenamento predefiniti copiabili, icone nella tab bar coach web, suono "Sirena". Subito dopo, primo intervento lato Cliente: fix layout responsive del Dettaglio Esercizio (BUG-006, righe Serie tagliate e Allegati coperto dalla tab bar sotto i 360px) — solo layout, nessuna nuova funzione né modifica a logica dati o lato coach. Backend reale resta il pezzo mancante principale: tutto è persistito solo localmente (AsyncStorage).

## Tipo di progetto
App mobile iPhone — **FitCoach Pro** (nome definito in `mobile/src/constants/app-info.ts`; nel codice/documentazione precedente compare come "CoachDesk", nome di lavoro superato — vedi `docs/DECISIONS.md`), Expo + React Native + TypeScript. Non è una webapp/PWA. Proprietario/sviluppatore: Luigi Marrano.

> Nota: `PRODUCT.md`/`DESIGN.md` nella root del repo descrivono ancora un progetto precedente (webapp B2B gestione progetti/task) e non sono stati aggiornati — decisione rimandata dall'utente. Non usarli come fonte di verità per FitCoach Pro.

## Stack tecnologico
Expo SDK 57 (managed) + React Native 0.86 + TypeScript + Expo Router (file-based, cartella `mobile/src/app`). Stato applicativo Zustand con persistenza locale su AsyncStorage (persistenza locale parziale, no backend). Video locali via `expo-video`, audio via `expo-audio`. Backend Supabase pianificato ma non ancora integrato. Preview di sviluppo su web via `expo start --web`, layout incorniciato in stile iPhone (`WebPhoneFrame`, solo su web). Dettagli completi in `docs/ARCHITECTURE.md`.

## Ambienti
- Sviluppo: preview web locale (`http://localhost:8081`, Chrome su PC) via `npx.cmd expo start --web` — **verificato funzionante** (typecheck pulito, server riavviato per rigenerare i tipi delle nuove rotte, tutte le rotte coach rispondono 200).
- Expo Go su iPhone/Android reale: **non funziona correttamente al momento** (invariato rispetto alla sessione precedente, non affrontato in questa). Non bloccare lo sviluppo per questo: Expo Web resta l'ambiente principale.
- Staging/Produzione: non previste in questa fase.

## Funzionalità completate (via typecheck + HTTP, non ancora via clic reali in browser — nessun tool di automazione browser disponibile in questo ambiente)

### Fix e nuove funzioni Coach/Admin (2026-07-06, parte 2 — ultimo intervento coach prima del lato cliente)
- **Fix bug status abbonamento**: la card "Abbonamento" nel dettaglio cliente (`clienti/[id].tsx`) mostrava i dati SOLO quando `status === 'active'`; cambiando stato (Pausa/Completato/Scaduto) l'intera card spariva mostrando "Nessun abbonamento attivo", dando l'impressione che il salvataggio non fosse avvenuto. **La persistenza era sempre corretta** (`updateSubscription` sostituisce l'intero oggetto, incluso lo status) — era un bug di visualizzazione. Corretto: la card mostra sempre l'abbonamento più rilevante (`displaySubscription` = attivo se esiste, altrimenti il più recente per data), con il suo status reale esplicito. Aggiunto anche il valore mancante `'cancelled'` a `SubscriptionStatus` (il coach può ora impostare: active/paused/completed/expired/cancelled).
- **Fix stato "saltato" bloccato**: modificare una scheda con `sessionStatus: 'skipped'` la lasciava bloccata su "Saltato" per sempre (effetto collaterale del fix BUG-003 della sessione precedente, che ora preserva correttamente lo stato in modifica invece di azzerarlo). Corretto in `schede/[id].tsx`: se la sessione era "saltato" e il coach cambia data o ora, lo stato torna automaticamente a "Da fare"/todo.
- **Crea appuntamento**: verificato che non è mai esistito un campo "Data fine" (solo "Ora fine", già conforme al formato richiesto data singola + ora inizio/fine) — nessuna rimozione necessaria. Migliorato il layout (data su riga propria) per chiarezza.
- **Modelli di allenamento predefiniti**: 7 piani pronti (Dimagrimento base, Massa muscolare 3 giorni, Forza base, Ricomposizione corporea, Tonificazione generale, Gambe e glutei, Postura e mobilità) in `data/workout-plan-templates.ts` (dati statici, mai mutati). Nuove schermate `app/schede/modelli/{index,[id]}.tsx`: lista, dettaglio con esercizi reali, flusso "Usa per cliente" (seleziona cliente + abbonamento opzionale → crea N schede reali copiate, mai il modello originale) → il coach poi modifica ogni copia con l'editor scheda già esistente (esercizi, serie, ripetizioni, recuperi, cardio, data/ora).
- **Icone bottom bar coach (web)**: `components/app-tabs.web.tsx` non aveva icone (solo etichette + indicatore attivo); aggiunte (📊 Dashboard, 👥 Clienti, 🏋️ Esercizi, 📋 Schede, 📅 Agenda, ⚙️ Impostazioni), stesso stile/pattern del lato cliente. Il tab bar **nativo** (`app-tabs.tsx`, iOS/Android) aveva già le icone (SF Symbols/Material) — nessuna modifica necessaria lì.
- **Suono "Sirena"**: nuovo tono generato proceduralmente (`mobile/assets/sounds/sirena.wav`, frequenza oscillante 650–1300Hz, stessa tecnica dei 3 suoni esistenti — **non un placeholder/fallback dichiarato**, un asset audio reale) aggiunto a `SelectedSound`/`SOUND_REGISTRY`/`SOUND_LABELS`, selezionabile e riproducibile in Impostazioni → Suono selezionato.

### Abbonamenti, sessioni multiple, agenda (2026-07-06, parte 1)
- `SubscriptionPackage`, sessioni multiple per cliente con data/ora, `Appointment`/agenda con anti-sovrapposizione — vedi `docs/WORKLOG.md` (voce precedente) per i dettagli completi, invariati salvo i due fix sopra.

### Preesistenti (2026-07-05, invariate)
- Navigazione base, libreria 44 esercizi, struttura dati allenamento, timer/suoni/storico, tema chiaro/scuro, gestione clienti reale, login/ruoli demo, lato cliente completo (Nutrizione/Questionario/Prenotazioni/Bacheca/Chat) — vedi `docs/WORKLOG.md` e `docs/ARCHITECTURE.md`.

## Funzionalità in corso / non ancora verificate visivamente
- **Nessuna verifica con clic reali in un browser** per tutto il lavoro Coach/Admin 2026-07-06 (entrambe le parti): verificato solo via `tsc --noEmit` (0 errori) e HTTP (tutte le rotte coach rispondono 200, nessun `ReferenceError`/`TypeError` nello shell) — nessun tool di automazione browser disponibile in questo ambiente. Checklist completa da eseguire di persona in `docs/TODO_NEXT.md`.
- Verifica delle funzionalità del 2026-07-05 (idratazione store, suono/countdown timer, upload foto questionario, blocco slot prenotazione): ancora da fare.
- Test su iPhone/Android reale via Expo Go: non eseguibile al momento (vedi Rischi).
- Nessuna UI coach per assegnare piani nutrizionali o annunci personali.
- Vista calendario mensile/settimanale dell'agenda: non ancora costruita.
- **Lato cliente non toccato in questa sessione** (su richiesta esplicita): Home, Workout, tab, chat cliente restano come nella sessione precedente — il prossimo intervento previsto è proprio lì.

## Rischi/blocchi attivi
- **Expo Go su telefono non funziona correttamente** (invariato, vedi `docs/BUGS.md`). Expo Web resta l'ambiente principale.
- `PRODUCT.md`/`DESIGN.md` non allineati al progetto.
- Persistenza locale parziale: nessuna sincronizzazione multi-dispositivo; migrazione a Supabase resta il prossimo passo architetturale importante.
- **Nessuna scritta "demo"/limite tecnico è visibile in UI**: non distribuire a clienti reali finché non c'è un'autenticazione vera.
- Ambiente Windows senza Mac/iOS Simulator.
- Blocco slot prenotazione (`Booking`) resta separato dall'anti-sovrapposizione agenda (`Appointment`), vedi `docs/DECISIONS.md`.
- **Tab bar cliente nativa** probabilmente ha lo stesso limite di BUG-002 (non verificato/corretto, nessun simulatore su Windows).
- Le nuove schermate "Modelli allenamento" (`schede/modelli/*`) sono collocate come sottocartella di `schede/` (tab già registrata) per lo stesso motivo delle schermate abbonamento/appuntamento della sessione precedente: evitare il rischio di route invisibili alla tab bar coach headless (BUG-002-style) — vedi `docs/DECISIONS.md`.
- La distribuzione delle date quando si "Usa per cliente" un modello è semplificata (tutte le copie partono da oggi, scadenza a `durationWeeks` settimane): il coach deve regolare data/ora di ciascuna sessione singolarmente da "Modifica scheda" — nessun algoritmo di distribuzione automatica implementato (non richiesto esplicitamente, evitato per non introdurre complessità non specificata).
