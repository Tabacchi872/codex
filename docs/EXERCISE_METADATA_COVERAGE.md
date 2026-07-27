# EXERCISE_METADATA_COVERAGE.md — Sotto-blocco 2.2, seed metadati esercizio

Documento di dettaglio per il seed di `exercise_movement_metadata` e
`exercise_alternatives` (Blocco 2, sistema "Programmi automatici"). Nessuna
RPC/motore di revisione/UI in questo sotto-blocco: solo dati e tassonomia.

## Fonti analizzate

- `mobile/src/data/exercise-library.ts` (catalogo esercizi reale dell'app).
- `mobile/src/lib/exercise-catalog.ts` (mapping gruppo muscolare legacy ↔ `ExerciseMuscleGroupId`).
- `mobile/src/types/training.ts` (enum `MuscleGroup`/`ExerciseMuscleGroupId`/`Difficulty`).
- `mobile/src/app/questionario-fitness.tsx` (definizione autorevole dei 3 livelli di attrezzatura: `bodyweight_only`="Solo corpo libero", `home_basic`="Attrezzatura di base: Manubri, elastici, tappetino", `full_gym`="Palestra completa: Bilancieri, macchine, cavi").
- Query dirette sul DB reale: `workout_template_exercises`/`workout_template_days`/`workout_templates` (per i 18 template `auto_eligible`), `workout_day_exercises` (per tutte le schede reali assegnate, non solo i template).

## Totale esercizi e copertura

| Metrica | Valore |
|---|---|
| Esercizi totali nel catalogo (`exercise-library.ts`) | 96 (44 "storici" + 52 "coverage") |
| Esercizi attivi | 96 (nessun esercizio con `active=false` in questo file — nessun legacy/disattivato) |
| ID univoci | 96 (nessun duplicato di id) |
| Esercizi usati dai 18 template `auto_eligible` | 78 id distinti |
| Copertura metadati sui 78 usati dai template | 78/78 = **100%** |
| Copertura metadati sul catalogo totale | 96/96 = **100%** |
| Riferimenti orfani/mancanti (template → catalogo) | **0** |
| Riferimenti orfani/mancanti (tutte le schede reali → catalogo) | **0** locali; 2 id in formato UUID trovati, entrambi verificati appartenere esclusivamente a `workout_plans.origin='coach'` (esercizi custom/ymove di un coach reale) — fuori scope per il sistema self-guided, che usa sempre e solo id locali (verificato: nessun template di sistema referenzia mai un id uuid) |
| Righe in `exercise_movement_metadata` dopo il seed | 96 (tutte `metadata_version=2`) |
| Righe in `exercise_alternatives` dopo il seed | 114 |

## Duplicati/ambiguità trovati (non rinominati/rimossi — fuori scope, solo annotati)

1. **`gambe-leg-press` / `gambe-leg-press-45`**: praticamente la stessa macchina (leg press), nomi diversi nel catalogo storico. Trattati come varianti equivalenti (`substitution_group='squat_machine_quad'`, alternativa reciproca priorità 1).
2. **`gambe-leg-curl`**: descrizione originale ambigua ("da sdraiati o seduti"), si sovrappone a `femorali-leg-curl-sdraiato`/`femorali-leg-curl-seduto` (introdotti successivamente nel catalogo "coverage"). Classificato come equivalente generico, con nota di classificazione esplicita e alternativa verso `femorali-leg-curl-sdraiato`.

## Tassonomia adottata

**Principio generale**: riusata la tassonomia già reale del sotto-blocco 2.1 ovunque possibile (nessuna reinvenzione); estesa solo dove una necessità è stata dimostrata durante la classificazione effettiva dei 96 esercizi.

- **Schema di movimento** (`movement_pattern`): 14 valori del 2.1 + **3 nuovi, necessità dimostrata**: `core_flexion`, `core_extension`, `core_rotation`. Motivo: crunch/reverse-crunch/cable-crunch (flessione), hyperextension/superman (estensione), russian-twist (rotazione) sono movimenti **dinamici** nella direzione indicata dal nome — non tenute isometriche di resistenza come plank/pallof-press (`core_anti_extension`/`core_anti_rotation`). Forzarli nella categoria "anti-" sarebbe stata una classificazione fattualmente sbagliata. **Non adottate** le altre 21 categorie suggerite nel testo del compito (`knee_flexion`, `knee_extension`, `hip_abduction`, `hip_adduction`, `calf_raise`, `elbow_flexion`, `elbow_extension`, `shoulder_abduction`, `shoulder_isolation`, `other`, ecc.): già ragionevolmente coperte da `isolation_legs`/`isolation_arms` esistenti senza necessità dimostrata di frammentarle ulteriormente. `isolation_arms` è usata in senso esteso ("isolamento di un singolo gruppo muscolare della parte superiore del corpo", non solo braccio in senso stretto) per includere anche il lavoro isolato di spalle (alzate laterali/frontali) — scelta pragmatica documentata riga per riga nel `classification_note` dove rilevante.
- **Attrezzatura** (`equipment_tag`): **riusati identici** i 3 livelli del 2.1 (`bodyweight_only`/`home_basic`/`full_gym`), identici a `client_fitness_profile.equipment_level` e alle etichette reali dell'app. **Non adottata** la tassonomia più fine suggerita nel compito (barbell/dumbbell/kettlebell/cable/machine/ecc.): nessuna necessità dimostrata, il livello a 3 già distingue correttamente tutti i 96 esercizi. Regola applicata: quando il testo originale elenca più attrezzi alternativi (es. "Bilanciere/manubri"), si usa il livello **più basso** tra le alternative esplicitamente elencate — `equipment_tag` rappresenta "il minimo sufficiente per eseguire l'esercizio", non l'attrezzo preferito.
- **Luogo compatibile** (`compatible_locations`): riusati identici i 2 valori del 2.1 (`gym`/`home`). Non adottati `outdoor`/`bodyweight_anywhere`: nessun esercizio del catalogo li richiede.
- **Livello minimo** (`min_level`): riusato identico il campo `difficulty` già presente per ogni esercizio nel catalogo app (`beginner`/`intermediate`/`advanced`), nessuna nuova classificazione necessaria.
- **Categoria** (`role`): riusati identici `primary`/`secondary`/`accessory` del 2.1.
- **Gruppi muscolari**: riusato identico `ExerciseMuscleGroupId` già usato da `mobile/src/types/training.ts` e già presente come campo `primaryMuscleGroup` per ogni esercizio del catalogo — nessuna nuova nomenclatura, nessuna variante tipo "petto/chest/pettorali" introdotta.
- **Nuova colonna** `classification_note text` (additiva, nullable): richiesta esplicitamente dal compito ("fonte o nota di classificazione, se disponibile"), assente nel 2.1.

## Classificazioni dubbie/degne di nota

- `core-mountain-climber`: ibrido core/cardio. Classificato `movement_pattern='cardio'` per coerenza con l'`exerciseType` già impostato nel catalogo app (override esplicito), pur avendo `primary_muscle_group='addome'`.
- `core-side-plank`: resiste alla flessione laterale, non a rotazione/anti-estensione in senso stretto — nessuna categoria dedicata nella tassonomia attuale. Classificato nel bucket più vicino disponibile (`core_anti_rotation`), annotato.
- `petto-dips-petto` / `tricipiti-dip-tricipiti`: stesso identico movimento fisico (dip alle parallele), differenziato solo dall'inclinazione del busto e quindi dal gruppo muscolare principale enfatizzato. Tenuti come esercizi distinti (rispetta "conservare il gruppo muscolare principale"), ma collegati da un'alternativa esplicita incrociata.

## Esercizi non sostituibili / senza alternativa disponibile

Nessun esercizio è stato marcato `eligible_for_substitution=false` (tutti i 96 sono risultati classificabili con sufficiente sicurezza). **Un solo esercizio usato dai template resta senza alcuna alternativa**, per scelta esplicita non per dimenticanza:

- **`gambe-leg-extension`**: unico esercizio di isolamento in estensione del ginocchio nel catalogo attuale. Nessuna alternativa credibile esiste senza cambiare schema di movimento (l'unica altra opzione sarebbe uno squat/leg press, che sono schemi compound completamente diversi) — lasciato intenzionalmente senza alternativa piuttosto che forzare un accostamento scorretto.

`spalle-tirate-mento` (non usato dai template `auto_eligible`) resta anch'esso senza alternativa per lo stesso principio (movimento sufficientemente specifico, nessun sostituto diretto nel catalogo attuale).

## Numero di relazioni alternative

**114 righe totali** in `exercise_alternatives`, tutte direzionali (nessuna simmetria assunta automaticamente — le coppie bidirezionali hanno entrambe le righe inserite esplicitamente, ciascuna con la propria motivazione). Zero self-reference, zero coppie duplicate, zero riferimenti a esercizi non registrati (verificato con query di validazione dopo il seed).

## Verifica dei 18 template `auto_eligible`

15/18 **PASS** (tutti gli esercizi esistono, hanno metadati, attrezzatura/luogo/livello coerenti col template). **3 FAIL — problemi reali nel CONTENUTO dei template (Blocco 1, non nel seed di questo sotto-blocco), trovati perché ora esiste per la prima volta un dato di attrezzatura/livello con cui confrontarli:**

| Template | Location | Level | Problema |
|---|---|---|---|
| **Corpo Libero** | Casa | Principiante | Include `gambe-squat` (squat con **bilanciere**, `full_gym`) — un template "corpo libero" non dovrebbe contenere un esercizio che richiede un bilanciere. Include anche `dorso-trazioni` (livello `advanced`) in un template "Principiante". |
| **Manubri ed Elastici** | Casa | Intermedio | Include `gambe-stacco-rumeno` (stacco rumeno con **bilanciere**, `full_gym`) — un template il cui nome stesso indica "manubri ed elastici" non dovrebbe contenere un esercizio a bilanciere. |
| **Tecnica dei Fondamentali** | Palestra | Principiante | Include `gambe-stacco-rumeno` (livello `advanced`) in un template "Principiante"/"Fondamentali". |

**Nessuno di questi 3 template è stato disattivato (`auto_eligible` non toccato)**: la richiesta di questo sotto-blocco vieta esplicitamente di disattivare automaticamente senza documentare, ed è comunque una modifica ai dati del Blocco 1 (`workout_template_exercises`), fuori dallo scope di un sotto-blocco di seed metadati. **Decisione richiesta all'utente prima che il motore di revisione (2.3) possa fidarsi ciecamente del flag `auto_eligible` per questi 3 template**: correggere il contenuto del template (sostituire l'esercizio incompatibile) oppure accettare esplicitamente l'eccezione. Vedi anche `docs/BUGS.md` per la registrazione formale.

## Decisioni rimandate al sotto-blocco 2.3

- Come il motore di revisione userà concretamente `substitution_group`/`exercise_alternatives`/`compatible_locations`/`min_level` per proporre sostituzioni (l'algoritmo stesso, non i dati, è fuori scope qui — vedi `docs/BLOCK_2_DESIGN.md` sezione 9.4 per la proposta di design già scritta).
- Decisione sui 3 template `auto_eligible` incompatibili trovati sopra.
- Eventuale popolamento futuro di `exercise_movement_metadata`/`exercise_alternatives` per esercizi custom/ymove (oggi fuori scope: mai usati da piani self-guided).
