# handoff.md

Documento di passaggio rapido per chi riprende il lavoro su **FitCoach Pro** (app iPhone/Android per personal trainer, proprietario Luigi Marrano). Non sostituisce la memoria di progetto — è un punto d'ingresso che rimanda ai documenti dettagliati.

## Stato al 2026-07-23

- **Repository:** `C:\Users\987246\OneDrive\Desktop\codex\lavoro`
- **Branch:** `checkpoint-prima-redesign-20260715`
- **Ultimo commit:** `5df299d` — "docs: aggiorna lo stato pre-release multipiattaforma"
- **Working tree:** pulito

## Verdetto release (ultimo audit + stabilizzazione, 2026-07-22/23)

| Piattaforma | Stato |
|---|---|
| Android APK | PRONTO |
| Android AAB | PRONTO |
| iOS Development Build | PRONTO lato repository (richiede account Apple Developer esterno) |
| TestFlight | PRONTO CON RISERVE (`ascAppId` ancora placeholder) |
| App Store | BLOCCATO (solo dati esterni mancanti, nessun difetto di codice) |

## Cosa è stato fatto nell'ultima sessione

1. **Configurazione iOS completa** (`mobile/app.json`/`eas.json`, bundle id `com.fitcoachapp.mobile`, permessi, `IOS_SETUP.md` in root).
2. **Eliminazione account reale** (Edge Function `delete-account`, deployata e verificata end-to-end con account temporanei — mai dati reali).
3. **Audit "Release Gate Android + iOS" completo** (18 sezioni, vedi risposta nella conversazione o `docs/WORKLOG.md`), che ha trovato 4 finding reali, poi tutti chiusi:
   - Menu "Altro" mostrava Bacheca/Prenotazioni ai clienti self_guided → **fix** (commit `7192a36`).
   - Store Zustand non azzerati al logout (rischio dati residui account precedente) → **fix** (commit `6ba0bcb`).
   - Link Privacy/Termini senza gestione errori `Linking.openURL` → **fix** (commit `4ebc779`).
   - Edge Function `send-push` scritta ma mai deployata → **deployata** (nessuna modifica al codice, era già sicura).

Dettagli completi dei 4 fix (con causa/impatto/verifica) in `docs/BUGS.md`, voci **BUG-048, BUG-049, BUG-050, BUG-051**.

## Cosa manca ancora prima di distribuire

**Dati esterni da fornire (Luigi), nessuno è un difetto di codice:**
- ASC App ID reale → `mobile/eas.json` → `submit.production.ios.ascAppId`
- Chiave pubblica RevenueCat iOS → `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- Privacy policy e termini di servizio reali → `mobile/src/constants/app-info.ts` (oggi `example.com`)
- Account Apple Developer / iPhone registrato per la prima build EAS iOS reale

**Test runtime mai eseguiti in questo ambiente** (nessun tool di automazione browser/app disponibile qui — solo verifiche statiche/API dirette): checklist completa e aggiornata in fondo a `docs/TODO_NEXT.md` (sezione "Priorità alta", primo item). Copre: menu self_guided, cambio account su tutti i ruoli, link privacy/termini, notifiche push (chat/appuntamenti), più tutta la checklist iOS su device reale.

## Dove guardare per i dettagli

- `docs/PROJECT_STATE.md` — snapshot completo dello stato attuale (sovrascritto ad ogni sessione, leggere sempre prima di agire).
- `docs/WORKLOG.md` — log cronologico di ogni intervento (append-only).
- `docs/BUGS.md` — bug trovati/risolti, incluse le 4 voci di questa sessione.
- `docs/TODO_NEXT.md` — prossimi passi prioritizzati e checklist di test.
- `IOS_SETUP.md` (root) — configurazione iOS, comandi EAS, checklist dati Apple mancanti.

## Cose utili da sapere sull'ambiente di sviluppo

- Il Supabase CLI **è disponibile e già autenticato** tramite `npx supabase@latest ...` (progetto collegato: `rkcecnzvzoigipjliwdk`) — non serve assumere il contrario.
- I percorsi `mobile/.env*` sono bloccati da permessi (Read/Write/Bash diretti falliscono) — per leggere `mobile/.env.example` (tracciato) usare `git show HEAD:mobile/.env.example`.
- Nessun tool di automazione browser/app in questo ambiente: ogni verifica "runtime" reale resta da fare a mano da Luigi.
- Regole dure del progetto in `CLAUDE.md` (root): non dichiarare testato ciò che non lo è, aggiornare sempre la memoria di progetto dopo ogni intervento.
