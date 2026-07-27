# BUG-055 — Fix contenuto incompatibile dei 3 template automatici

Chiuso 2026-07-27. Migration: `supabase/migrations/20260807090000_fix_bug_055_auto_template_content.sql`.

## Incompatibilità trovate (analisi preliminare)

| Template | Location / Level dichiarati | Riga incompatibile | Motivo FAIL |
|---|---|---|---|
| Corpo Libero (`b6a45d88-a517-48c6-8510-26ed7285a1d7`) | Casa, Principiante | Workout B pos.1: `gambe-squat` | squat con bilanciere, `equipment_tag=full_gym`, non compatibile con "Casa"/corpo libero |
| Corpo Libero | Casa, Principiante | Workout B pos.2: `dorso-trazioni` | `min_level=advanced`, incompatibile con template Principiante |
| Manubri ed Elastici (`6376a9e9-6add-4b77-b85d-00e97b7bd725`) | Casa, Intermedio | Lower A pos.2: `gambe-stacco-rumeno` | stacco rumeno a bilanciere, `equipment_tag=full_gym`, non compatibile con "manubri/elastici" dichiarati |
| Tecnica dei Fondamentali (`549fee34-1614-4d04-962d-bf9efa8d6ff5`) | Palestra, Principiante | Focus Stacco e Press pos.2: `gambe-stacco-rumeno` | `min_level=advanced`, incompatibile con template Principiante (l'intento del template è insegnare la tecnica di base, non una variante avanzata) |

Riga verificata e volutamente **non toccata**: "Focus Squat" pos.2, `gambe-squat` (`5c20c1d3-328d-4b29-bd92-042769081fb1`) nello stesso template "Tecnica dei Fondamentali" — coerente con l'attrezzatura dichiarata (bilanciere leggero/power rack) e con la funzione tecnica del template (insegnare lo squat con bilanciere), `min_level=intermediate` tollerato per un template Principiante secondo la stessa metodologia di validazione già usata per i 18 template (solo `advanced` è considerato incompatibile).

## Regola di immutabilità verificata prima del fix

`workout_days.workout_plan_id` referenzia solo `workout_plans(id)` e `workout_day_exercises.workout_day_id` referenzia solo `workout_days(id)` — nessuna FK verso `workout_template_days`/`workout_template_exercises`. `assign_workout_template_to_client` esegue una **copia per valore** (INSERT ... SELECT), mai un riferimento vivo. Verificato anche che 0 `workout_plans`/`client_program_cycles` reali derivano dai 3 template incriminati. Conclusione: correggere i template sorgente in-place è sicuro strutturalmente e non richiede versionamento.

## Sostituzioni eseguite (tabella prima/dopo)

| Riga (`workout_template_exercises.id`) | Template / Giorno / Pos. | Prima | Dopo | Variazioni serie/reps/recupero |
|---|---|---|---|---|
| `1df6d2cd-7516-44e7-a9d1-666cb374dbe0` | Corpo Libero / Workout B / 1 | `gambe-squat` (3×18, 15-20, rec 60s) | `glutei-squat-sumo` | sets 3, reps 15, reps_min 12, reps_max 15, rest 60s — volume adattato al corpo libero |
| `44f2f186-6b54-481c-a8a9-59d397387fb6` | Corpo Libero / Workout B / 2 | `dorso-trazioni` | `dorso-rematore-manubrio` | invariato nella struttura (segue il fallback già suggerito nella nota originale del template) |
| `11a09e8c-4a23-4ab2-875b-0393531f6e2b` | Manubri ed Elastici / Lower A / 2 | `gambe-stacco-rumeno` | `femorali-hip-hinge` | ripetizioni aumentate per compensare l'assenza di carico esterno (hip hinge a corpo libero) |
| `7433b045-2779-4578-b1ea-299ba33637f9` | Tecnica dei Fondamentali / Focus Stacco e Press / 2 | `gambe-stacco-rumeno` | `gambe-hip-thrust` | stessa struttura, esercizio di livello `intermediate` compatibile con l'attrezzatura dichiarata — regressione tecnica dell'esercizio, non innalzamento del livello del template |

Criteri di sostituzione applicati nell'ordine richiesto: attrezzatura → luogo → livello → schema movimento → gruppo muscolare → categoria, usando `exercise_movement_metadata`/`exercise_alternatives` come fonti autorevoli.

Alternative aggiunte in `exercise_alternatives` per coprire i nuovi esercizi introdotti (`dorso-trazioni → dorso-rematore-manubrio`, `gambe-stacco-rumeno → gambe-hip-thrust`), additive, senza toccare le righe seed del sotto-blocco 2.2.

## Risultato validazione

- **18/18 template `auto_eligible` PASS** (prima del fix: 15/18).
- 0 esercizi mancanti, 0 senza metadati, 0 incompatibilità di luogo/livello residue.
- 0 duplicati dello stesso esercizio nei 3 giorni modificati.
- Tutti i 4 nuovi esercizi inseriti hanno almeno un'alternativa attiva in `exercise_alternatives` (`glutei-squat-sumo`: 1, `dorso-rematore-manubrio`: 2, `femorali-hip-hinge`: 1, `gambe-hip-thrust`: 1).
- `alternatives_total` passato da 114 a 116 (+2 righe additive di questa migration).

## Non regressione sui dati reali

- `cycles_real` = 1 (invariato), `reviews_real` = 0 (invariato).
- `plans_from_these_templates` = 0 sia prima che dopo: **nessuna scheda cliente reale è mai stata generata da uno di questi 3 template**, quindi nessun dato reale è stato alterato da questo fix.
- Verifica esplicita via `raise exception` nella migration su una riga non toccata dello stesso template ("Focus Squat"/`gambe-squat`): nessuna eccezione sollevata, contenuto confermato invariato.

## Test con account sintetici (percorso server reale)

Eseguito tramite REST API reali (Admin API + PostgREST), mai clienti reali:
1. Creato un coach sintetico e un cliente sintetico via `auth.admin.createUser`, con `user_metadata.role`/`coach_id` — usa il vero trigger `handle_new_user()` (crea `profiles`/`coach_profiles`/`client_profiles`/`coach_clients` esattamente come la registrazione reale dell'app), non insert manuali.
2. Login reale del coach sintetico (`/auth/v1/token?grant_type=password`).
3. Per ciascuno dei 3 template, chiamata reale a `assign_workout_template_to_client` con il token del coach.
4. Verificato che ogni piano/giorno/esercizio copiato (exercise_id, sets, reps, reps_min, reps_max, target_weight, rest_seconds, notes, technique_type, superset_group_id, duration_seconds, rpe_rir) corrisponda esattamente al contenuto corretto del template.

Risultato: **3/3 template PASS** (Corpo Libero: 3 piani copiati, Manubri ed Elastici: 4 piani, Tecnica dei Fondamentali: 3 piani — 10 piani totali, 0 discrepanze).

Cleanup: eliminati entrambi gli account sintetici via `auth.admin.deleteUser` (stesso percorso sicuro validato per BUG-054, cascata su `profiles`/`coach_clients`/`workout_plans`/`workout_days`/`workout_day_exercises`). Verificato zero residuo: `profiles`, `workout_plans`, `coach_clients` per gli id sintetici → 0 righe.

## File toccati

- `supabase/migrations/20260807090000_fix_bug_055_auto_template_content.sql` (nuova, applicata al DB reale)
- `docs/BUGS.md` (BUG-055 chiuso)
- `docs/BLOCK_2_DESIGN.md` (nuova sezione di resoconto)
- `docs/EXERCISE_METADATA_COVERAGE.md` (verifica 18 template aggiornata a 18/18 PASS)
- `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`, `docs/TODO_NEXT.md`, `docs/WORKLOG.md`

Non è stato toccato alcun codice del sotto-blocco 2.3 (motore di revisione), che resta da iniziare.

---

## Riapertura (2026-07-27, stesso giorno): 2 sostituzioni del fix sopra erano semanticamente incompatibili

Migration: `supabase/migrations/20260808090000_fix_bug_055b_template_semantic_equipment.sql`.

L'utente ha richiesto una verifica semantica mirata prima di procedere col sotto-blocco 2.3, segnalando che due delle sostituzioni sopra, pur avendo prodotto un "18/18 PASS" automatico, non rispettavano la promessa reale del template.

### Causa del falso PASS (spiegazione richiesta esplicitamente)

Il validatore usato per il fix precedente aveva **due punti ciechi distinti**, entrambi confermati con query dirette prima di scrivere qualunque correzione:

1. **Attrezzatura verificata solo con il tag grezzo a 3 livelli** (`bodyweight_only`/`home_basic`/`full_gym`) confrontato con la location del template, **mai con il testo dichiarato dell'attrezzatura dell'esercizio** in `mobile/src/data/exercise-library.ts` (campo `equipment`). Per "Corpo Libero" (equipment dichiarato: "Corpo libero, sbarra opzionale per il dorso") questo ha lasciato passare due esercizi il cui testo non offre mai un'alternativa a corpo libero:
   - `dorso-rematore-manubrio`: testo "Manubrio, panca" — manubrio sempre necessario, nessuna alternativa a corpo libero.
   - `glutei-squat-sumo`: testo "Bilanciere o manubrio" — nessuna opzione a corpo libero. **Introdotto dal fix precedente con lo stesso identico errore** (sostituiva `gambe-squat`, controllato solo su `equipment_tag`, mai sul testo).

   Per confronto, un esercizio corretto come `gambe-affondi` ("a corpo libero o con manubri") offre esplicitamente l'opzione a corpo libero — ecco perché quello non era mai stato un problema.

   **Verificato anche `tricipiti-dip-tricipiti`** con lo stesso criterio più rigoroso: il suo testo ("Parallele **o** panca") offre già un'alternativa a bassa attrezzatura (qualunque sedia/panca stabile di casa), coerente con la nota già scritta nella riga del template ("Su sedia o panca stabile"). **Non è un'incompatibilità**: non è stato toccato, per evitare di correggere qualcosa che non era rotto.

2. **La sostituzione in "Tecnica dei Fondamentali" verificava solo `movement_pattern`** (hinge = hinge), **mai `substitution_group`** — il campo più preciso già presente nei dati fin dal sotto-blocco 2.2: `gambe-stacco-rumeno` appartiene a `hinge_hamstring_barbell` (vero hip-hinge: busto che si inclina, bacino che arretra, femorali che si allungano sotto carico), mentre `gambe-hip-thrust` appartiene a `hinge_glute_extension` (estensione d'anca a busto fisso — funzione biomeccanica diversa, nonostante condividano lo stesso `movement_pattern` grezzo). La distinzione era già nei dati, semplicemente mai controllata da questa sostituzione. Il giorno "Focus Stacco e Press" richiede di insegnare proprio il pattern hip-hinge: la sostituzione non lo faceva.

### Nuova regola di validazione adottata

Un esercizio è equipaggiamento-compatibile con un template "a corpo libero" solo se il suo testo `equipment` nel catalogo offre esplicitamente un'alternativa a corpo libero/bassa attrezzatura domestica (non basta il tag grezzo). Una sostituzione di un esercizio `role='primary'` deve preservare `substitution_group`, non solo `movement_pattern`.

### 3 nuovi esercizi aggiunti al catalogo

| id | Nome | Equipment tag | Substitution group | Usato per sostituire |
|---|---|---|---|---|
| `gambe-air-squat` | Squat a corpo libero | `bodyweight_only` | `squat_barbell_quad` (stessa famiglia di `gambe-squat`) | `glutei-squat-sumo` in Corpo Libero |
| `dorso-rematore-corpo-libero` | Rematore a corpo libero (inverted row) | `home_basic` (sbarra bassa/tavolo/anelli) | `row_horizontal_dorsali` (stessa famiglia di `dorso-rematore-manubrio`) | `dorso-rematore-manubrio` in Corpo Libero |
| `gambe-stacco-rumeno-manubri` | Stacco rumeno con manubri | `home_basic` | `hinge_hamstring_barbell` (stessa famiglia di `gambe-stacco-rumeno`) | `gambe-hip-thrust` in Tecnica dei Fondamentali **e** `femorali-hip-hinge` in Manubri ed Elastici |

Nessun video locale registrato per questi 3 id: `videoStatus` risulterà `'missing'` (comportamento già gestito dal codice esistente, coerente con molti altri esercizi "coverage" del catalogo — dichiarato esplicitamente, non un errore).

### Sostituzioni definitive (tabella prima/dopo di questa riapertura)

| Riga | Template / Giorno / Pos. | Prima (dal fix precedente) | Dopo | Motivo |
|---|---|---|---|---|
| `1df6d2cd-...` | Corpo Libero / Workout B / 1 | `glutei-squat-sumo` | `gambe-air-squat` | nessuna alternativa a corpo libero nel testo di `glutei-squat-sumo` |
| `44f2f186-...` | Corpo Libero / Workout B / 2 | `dorso-rematore-manubrio` | `dorso-rematore-corpo-libero` | nessuna alternativa a corpo libero nel testo di `dorso-rematore-manubrio` |
| `11a09e8c-...` | Manubri ed Elastici / Lower A / 2 | `femorali-hip-hinge` | `gambe-stacco-rumeno-manubri` | regressione a corpo libero non ottimale per un template a manubri: ora usa un vero stacco rumeno con manubri, stesso `substitution_group` dell'esercizio originale |
| `7433b045-...` | Tecnica dei Fondamentali / Focus Stacco e Press / 2 | `gambe-hip-thrust` | `gambe-stacco-rumeno-manubri` | `gambe-hip-thrust` non preserva il `substitution_group` (hinge_glute_extension ≠ hinge_hamstring_barbell): non insegna il pattern hip-hinge richiesto dal giorno |

Nessuna variazione di serie/reps/recupero per Corpo Libero (struttura preservata, solo note aggiornate). Manubri ed Elastici: sets 4→3, reps 15→12 (range 12-18→10-12), rest 60s→75s — volume tipico di un hinge caricato invece di un drill a corpo libero ad alte ripetizioni. Tecnica dei Fondamentali: struttura invariata (3×10, rest 75s), solo note aggiornate.

Aggiornati anche i `reason` di 2 righe di `exercise_alternatives` inserite dal fix precedente (`dorso-trazioni→dorso-rematore-manubrio`, `gambe-stacco-rumeno→gambe-hip-thrust`) che citavano esplicitamente la scelta di sostituzione ora superata: generalizzati, le relazioni restano valide come alternative a sé stanti.

### Risultato validazione (rieseguita su tutti i 18 template, non solo sui 3 toccati)

- **18/18 template PASS** sul controllo location/level/completezza (query eseguita su tutti i 18, non solo sui 3 — nessun'altra incompatibilità emersa altrove).
- **Corpo Libero**: rivisti tutti i 12 esercizi con la nuova regola equipaggiamento-testo — zero esercizi con manubri/bilancieri/cavi/macchine richiesti senza alternativa; le uniche 2 righe `home_basic` residue (`dorso-rematore-corpo-libero`: sbarra dichiarata dal template; `tricipiti-dip-tricipiti`: panca/sedia già nel testo originale) sono entrambe motivate e riviste esplicitamente.
- **Manubri ed Elastici**: confermato 0 esercizi `full_gym` in nessuno dei 2 template "Casa" (query dedicata).
- **Focus Stacco e Press**: contiene 2 esercizi `hinge` (`femorali-hip-hinge` no-load + `gambe-stacco-rumeno-manubri` caricato) — progressione tecnica coerente all'interno dello stesso giorno, non un duplicato.
- 0 duplicati dello stesso esercizio nei giorni modificati.
- Nuove alternative verificate: `gambe-air-squat` 2, `dorso-rematore-corpo-libero` 2, `gambe-stacco-rumeno-manubri` 3.
- Non regressione dati reali: `cycles_real=1`, `reviews_real=0`, `plans_from_these_templates=0` — invariati, nessuna scheda cliente reale ha mai usato questi 3 template.
- Verifica esplicita di non-regressione nella migration su una riga adiacente non toccata (`gambe-squat` in "Focus Squat"): nessuna eccezione sollevata.

### Test con account sintetici (ripetuto)

Stessa metodologia del fix precedente (Admin API + PostgREST, trigger reale `handle_new_user()`, mai clienti reali): **3/3 template PASS** (Corpo Libero 3 piani, Manubri ed Elastici 4 piani, Tecnica dei Fondamentali 3 piani — 10 piani totali, 0 discrepanze). Cleanup verificato: 0 residuo su `profiles`/`workout_plans`.

### Scoperta collaterale, esplicitamente FUORI SCOPE di questa correzione (documentata, non risolta)

Durante il riesame di "Manubri ed Elastici" (Lower B) è emerso che `gambe-bulgarian-split-squat` (`min_level='advanced'`) è usato in questo template `Intermedio`. Questo NON è stato toccato: non era tra le sostituzioni segnalate dall'utente, la richiesta di riapertura non chiedeva un audit generale del livello per i template `Intermedio`/`Avanzato` (solo la regola "advanced in un template Principiante" era stata finora validata), e cambiare la regola generale di compatibilità livello richiede una decisione di prodotto autonoma, non una correzione implicita dentro BUG-055. Registrato come **BUG-056** in `docs/BUGS.md` per una decisione futura esplicita.

### File toccati in questa riapertura

- `supabase/migrations/20260808090000_fix_bug_055b_template_semantic_equipment.sql` (nuova, applicata al DB reale)
- `mobile/src/data/exercise-library.ts` (3 nuovi esercizi)
- `docs/BUG_055_TEMPLATE_FIX.md` (questa sezione)
- `docs/BUGS.md` (nuovo BUG-056, non un fix di BUG-055 — resta un appunto separato)
- `docs/EXERCISE_METADATA_COVERAGE.md`, `docs/BLOCK_2_DESIGN.md`, `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`, `docs/TODO_NEXT.md`, `docs/WORKLOG.md`
