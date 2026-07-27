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
