<!-- SEED: re-run /impeccable document una volta che esiste del codice, per estrarre i token reali e generare il sidecar. -->

---
name: Gestione Progetti & Task
description: Strumento interno B2B per pianificare, assegnare e tracciare progetti e task del team.
---

# Design System: Gestione Progetti & Task

## 1. Overview

**Creative North Star: "Il Quaderno Operativo"**

Uno strumento che si comporta come il quaderno di lavoro di un team che sa esattamente cosa deve fare: essenziale, leggibile a colpo d'occhio, senza nulla che distragga dal compito. La palette resta quasi neutra — un solo accento indaco profondo, usato con parsimonia per segnalare ciò che conta davvero (azione primaria, stato attivo, elemento da notare). La tipografia è un sans tecnico e neutro, scelto per la leggibilità dei dati (nomi, date, stati) più che per l'espressività. Il motion è discreto: reagisce alle azioni dell'utente, non le anticipa con coreografie.

Il sistema rifiuta esplicitamente l'estetica "AI-SaaS da landing page": nessun hero-metric dashboard, nessun gradiente decorativo, nessun glassmorphism, nessuna palette crema/sabbia di default, nessun eyebrow maiuscolo o marcatore numerato scenografico. Rifiuta anche il tono "consumer giocoso" (card colorate, tono informale): questo è uno strumento professionale, non un gioco.

**Key Characteristics:**
- Palette quasi monocromatica con un solo accento indaco, usato su ≤10% della superficie
- Sans tecnico in più pesi, nessun font decorativo
- Motion "restrained": solo risposta a stato/interazione, mai coreografia
- Superfici piatte, gerarchia costruita con spaziatura e contrasto tipografico, non con ombre

## 2. Colors

Palette **restrained**: neutri leggermente tinti verso il blu-indaco + un solo accento indaco profondo, usato con parsimonia.

### Primary
- **Indaco Profondo** `[hex/oklch da definire in fase di implementazione]`: azione primaria (bottoni principali, stato attivo, elemento selezionato). Non usato per testo lungo o superfici estese.

### Neutral
- **Grafite Testo** `[da definire]`: colore testo principale, ad alto contrasto sul fondo.
- **Fondo Neutro** `[da definire]`: sfondo dell'applicazione, neutro leggermente tinto verso l'indaco (non crema/sabbia).
- **Superficie** `[da definire]`: sfondo di pannelli/superfici sollevate rispetto al fondo.
- **Bordo/Divisore** `[da definire]`: separazioni sottili tra elementi, mai come stripe colorato decorativo.

### Named Rules
**La Regola del Singolo Accento.** L'indaco profondo appare in una sola azione o stato per schermata alla volta. Se tutto è accentato, niente lo è.

## 3. Typography

**Display/Body Font:** sans tecnico e neutro (famiglia da scegliere in implementazione, es. nella famiglia Inter / IBM Plex Sans), usato in più pesi invece di più famiglie.

**Character:** neutra, leggibile, pensata per dati (nomi, date, stati) più che per espressività. Nessun accostamento serif/sans: un'unica famiglia, differenziata per peso e dimensione.

### Hierarchy
- **Display** (peso 600, `[dimensione da definire]`): riservato a titoli di pagina/sezione, uso minimo.
- **Title** (peso 600, `[dimensione da definire]`): intestazioni di progetto/gruppo di task.
- **Body** (peso 400, `[dimensione da definire]`, max 65–75ch dove è testo prosa): contenuto principale, descrizioni task.
- **Label** (peso 500, `[dimensione da definire]`, nessun maiuscolo forzato salvo stati brevi): metadati, stati, date, assegnatari.

### Named Rules
**La Regola del Peso, non del Colore.** La gerarchia si costruisce con peso e dimensione tipografica, non con variazioni di colore del testo.

## 4. Elevation

Sistema **piatto per default**, coerente con il motion "restrained": nessuna ombra decorativa a riposo. La profondità si comunica con spaziatura, bordi sottili e contrasto di superficie (fondo vs. superficie), non con box-shadow.

### Named Rules
**La Regola del Piatto a Riposo.** Le superfici sono piatte di default. Un'ombra compare solo come risposta a uno stato (hover, drag, focus), mai come decorazione statica.

## 5. Components

Nessun componente ancora implementato: questa sezione va popolata da `/impeccable document` (modalità scan) una volta che il codice esiste. In fase di implementazione, i componenti canonici da definire per primi sono: bottone primario/secondario, campo di input, elemento lista/riga task, badge di stato, navigazione principale.

## 6. Do's and Don'ts

### Do:
- **Do** usare l'indaco profondo solo per l'azione o lo stato primario di ogni schermata (Regola del Singolo Accento).
- **Do** costruire la gerarchia con peso/dimensione tipografica, non con colori di testo diversi.
- **Do** mantenere le superfici piatte a riposo; introdurre profondità solo in risposta a un'interazione.
- **Do** rispettare WCAG AA su tutti i testi e componenti interattivi (contrasto ≥4.5:1 per il testo body, ≥3:1 per testo grande).

### Don't:
- **Don't** usare hero-metric dashboard, testo con gradiente, o glassmorphism decorativo: è esattamente l'estetica "AI-SaaS da landing page" che questo prodotto rifiuta.
- **Don't** usare una palette crema/sabbia di default per il fondo neutro: i neutri vanno tinti verso l'indaco del brand, non verso il "caldo" generico.
- **Don't** usare un tono consumer/giocoso (card colorate, tono informale): questo è uno strumento professionale per team B2B.
- **Don't** usare `border-left`/`border-right` colorati come accento decorativo su card o liste.
- **Don't** usare eyebrow maiuscolo ripetuto sopra ogni sezione o marcatori numerati 01/02/03 come scaffolding scenografico.
