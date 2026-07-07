# CLAUDE.md

Questo file guida Claude Code in questo repository. È la base universale per costruire siti web, webapp e app: contiene le regole non negoziabili. I dettagli operativi vivono in `PRODUCT.md`, `DESIGN.md`, `docs/` e `.claude/skills/`.

## Prima di iniziare
Leggi sempre `docs/PROJECT_STATE.md` e `docs/TODO_NEXT.md` per capire a che punto è il progetto prima di agire.

## Regole dure (non negoziabili)
1. **Non dichiarare completato ciò che non è testato.** Ogni feature va verificata end-to-end (skill `webapp-testing`) prima di essere segnata come fatta.
2. **Non creare solo UI finta.** Ogni schermata/componente deve essere collegato a logica reale (stato, API, dati), non un mockup statico spacciato per funzionante.
3. **Non lasciare bottoni senza funzione.** Se un elemento interattivo non ha ancora un comportamento, va disabilitato o rimosso, mai lasciato silenziosamente rotto.
4. **Non creare landing page se il progetto è una webapp operativa.** Distingui sempre se stai costruendo un sito vetrina (`website-builder`) o un'applicazione funzionante (`webapp-builder`): non sostituire l'uno con l'altro.
5. **Aggiorna sempre la memoria di progetto dopo ogni intervento**: `docs/PROJECT_STATE.md`, `docs/WORKLOG.md`, `docs/BUGS.md`, `docs/TODO_NEXT.md` (skill `project-memory`).

## Dove sta cosa
- `PRODUCT.md` — visione di prodotto, utenti, obiettivi.
- `DESIGN.md` — sistema di design, UX, tono.
- `docs/REQUIREMENTS.md` — requisiti funzionali e non funzionali.
- `docs/ARCHITECTURE.md` — architettura tecnica.
- `docs/PROJECT_STATE.md` — stato attuale del progetto (snapshot, non log).
- `docs/WORKLOG.md` — log cronologico di cosa è stato fatto.
- `docs/DECISIONS.md` — decisioni tecniche/prodotto e relative motivazioni.
- `docs/BUGS.md` — bug noti, stato, fix.
- `docs/TODO_NEXT.md` — prossimi passi prioritizzati.
- `.claude/skills/` — competenze operative specifiche (planning, frontend, backend, database, auth, test, review, deploy, mobile/PWA).

## Stato attuale
Repository in fase di scaffolding: non esiste ancora codice applicativo. Primo passo consigliato: skill `app-planner`.

## Design Context
Register: **product**. Webapp operativa B2B per la gestione interna di progetti e task (creazione, assegnazione, stato, scadenze), per team che oggi usano fogli di calcolo e chat frammentate. Personalità di brand: affidabile, essenziale, professionale. Anti-reference esplicita: estetica "AI-SaaS generica" (hero-metric, gradienti, glassmorphism, card grid identiche, palette crema/sabbia di default). Vedi `PRODUCT.md` per la visione completa e `DESIGN.md` (seed) per palette/tipografia/motion.

## Preview Rule

Quando si crea una app, webapp, dashboard, gestionale, ecommerce, sito web o PWA, usare la skill live-preview-workflow.

Ogni progetto visuale deve avere:
- preview locale reale
- URL localhost
- hot reload quando possibile
- file sorgente modificabili
- report dei file modificati
- test base della preview

Non dichiarare completata una UI se non è stata avviata o verificata.
Non creare anteprime finte, screenshot statici o dashboard decorative senza logica dichiarata.
