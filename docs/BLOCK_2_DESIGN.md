# BLOCK_2_DESIGN.md — Sistema "Programmi automatici", Blocco 2

**Stato: progettazione approvata (2026-07-27) con le decisioni della sezione 0
qui sotto. Sotto-blocco 2.0 (logging progressi self-guided) implementato,
testato e chiuso (migration `20260803090000`). Sotto-blocco 2.1 (schema
cicli/check-in/review, tabelle di supporto) implementato, testato e chiuso
(migration `20260804090000`, vedi sezione 23). Motore di revisione, RPC
cliente/Superadmin, variazione automatica esercizi, UI, seed completo
metadati esercizio (2.2) restano non implementati.** Le soglie numeriche non
ancora coperte da una decisione esplicita restano marcate **[PROPOSTA DA
APPROVARE]**; le scelte di modellazione non ancora confermate restano
**[INTERPRETAZIONE — da confermare]**.

## 0. Decisioni approvate dall'utente (2026-07-27)

1. **Soglie iniziali**: aderenza minima 60%, sessioni minime 4, esercizi
   principali con dati utilizzabili almeno 50%, incremento massimo carico per
   ciclo 10%, massimo una serie aggiuntiva per esercizio, esercizi mantenuti
   tra due cicli almeno 60%, esercizi sostituiti massimo 40% — approvate come
   configurazione di default. **Devono risiedere in `auto_program_review_config`
   (o struttura server-side equivalente), mai hardcoded in RPC/servizi/UI, e la
   configurazione deve essere versionata** (una review storica deve poter
   indicare quale versione delle soglie è stata usata). La sezione 7.3 è stata
   aggiornata di conseguenza: `auto_program_review_config` include ora una
   colonna `config_version integer` esplicita, e `client_cycle_reviews.
   algorithm_version` (sezione 11.2) registra il numero di versione realmente
   usato per quella revisione, non una stringa libera `'v1'`.
2. **Enum e CHECK constraint**: approvata l'estensione/normalizzazione descritta
   nelle sezioni 2.2/6.1, a condizione che avvenga tramite un'unica migration
   transazionale che aggiorna prima le righe esistenti (se non già compatibili)
   e poi elimina/ricrea i CHECK, con la mappatura vecchio→nuovo valore
   documentata nella migration stessa (non solo qui). Nessuna riga esistente va
   eliminata. Verificato di nuovo con query read-only immediatamente prima di
   scrivere quella migration (non ancora fatto: fa parte del sotto-blocco 2.1,
   non ancora iniziato).
3. **Nessun template compatibile**: **rifiutata** l'ipotesi di riusare
   `pending_safety_review` (sezione 2.2, nota ora superata). Approvato un
   **undicesimo** stato dedicato **`pending_template`**, distinto e
   mai confuso con `pending_safety_review`. Una review che termina in
   `pending_template` non sostituisce mai la scheda corrente, non genera mai
   una scheda incompleta, crea una sola segnalazione Superadmin (stesso
   anti-duplicazione di sezione 15.2), conserva la review e i criteri che non
   hanno trovato corrispondenza (`client_cycle_reviews.metrics_snapshot`), ed è
   sbloccabile solo tramite scelta manuale del Superadmin (stessa RPC
   `superadmin_resolve_safety_review` generalizzata, o un'RPC gemella dedicata
   — da decidere in sede di implementazione del sotto-blocco 2.5). Sezione 2.2
   aggiornata: 11 stati totali, non più 10.
4. **Priorità**: procedere subito e solo con il sotto-blocco 2.0 (logging
   progressi self-guided) — **fatto**, vedi sezione 1.3 per il resoconto
   completo. Schema/motore di revisione/variazione esercizi/UI del Blocco 2
   restano non iniziati, in attesa di ulteriore via libera.

Verifiche read-only eseguite sul progetto reale prima di scrivere questo documento
(nessuna scrittura): `select count(*) from client_program_cycles/client_cycle_reviews/
client_monthly_checkins/client_fitness_profile/exercise_progress_history(coach_id is null)`
→ **1 ciclo reale attivo** (cliente reale, `source='auto_initial'`, `status='active'`,
avviato 2026-07-27, nessun account sintetico), **0 review**, **0 check-in**, **0 righe
di progresso self-guided**. Questo conferma che le estensioni additive di CHECK
proposte più sotto sono sicure oggi (il valore `'active'`/`'auto_initial'` resta
valido in qualunque riformulazione), e che il gap di logging descritto al punto 1.3
è reale, non solo teorico: zero dati di carico/ripetizioni esistono per nessun
cliente self-guided, incluso quello con un ciclo già attivo da oggi.

---

## 1. Analisi preliminare — cosa esiste, cosa si riusa, cosa manca davvero

### 1.1 Tabelle Blocco 1 (tutte create in `20260730090000_auto_program_schema_core.sql`, riusabili così come sono salvo estensioni additive elencate al punto 1.4)

| Tabella | Scopo reale oggi | Righe reali | Riuso in Blocco 2 |
|---|---|---|---|
| `client_fitness_profile` | Questionario iniziale, 1 riga per cliente (`unique client_id`), immutabile solo su `completed`/`client_id` | 1 | Letta come baseline storica (non toccata dal check-in periodico, che è una tabella separata) |
| `client_excluded_exercises` | Lista viva esercizi esclusi/non graditi, `unique(client_id, exercise_id)`, `reason in ('dislike','pain','injury','other')` | 0 | Riusata identica: il check-in periodico **aggiorna questa tabella**, non ne crea una parallela |
| `client_program_cycles` | Wrapper "ciclo", **un solo ciclo non-terminale per cliente** (indice unico parziale su `status in ('draft','active','pending_review')`) | 1 | Riusata, **CHECK su `status` da estendere** (vedi 1.4) |
| `client_program_cycle_plans` | Join ciclo ↔ `workout_plans` reali generati | 1 (implicito, 3 piani per il ciclo esistente) | Riusata identica |
| `client_monthly_checkins` | Check-in periodico, **schema già pronto ma vuoto** (mai scritto da alcuna RPC) | 0 | Riusata, **campi da estendere** (vedi 1.4 e sezione 4) |
| `client_cycle_reviews` | Esito revisione, **schema già pronto ma vuoto** | 0 | Riusata, **CHECK su `decision` da estendere + nuove colonne relazionali** (vedi 1.4 e sezione 11) |
| `app_notifications` | Centro notifiche multi-ruolo, **scritta da Blocco 1 ma senza alcun consumer UI** (verificato via grep: nessun file in `mobile/src` legge `app_notifications`) | notifiche già scritte per il ciclo reale esistente | Riusata per scrivere; **nessuna schermata la legge ancora** (Blocco 3, vedi rischio in sezione 20/rischi) |
| `superadmin_program_overrides` | Log/audit override, solo insert, mai letto da UI (nessun pannello Blocco 1/2) | 0 | Riusata; **nuove `action` da aggiungere al CHECK** per i controlli di sezione 14 |
| `workout_templates.auto_eligible/auto_assignment_rules/auto_progression_rules/next_template_id` | `auto_eligible` usato dal matching Blocco 1; **`auto_assignment_rules`/`auto_progression_rules`/`next_template_id` esistono ma non sono MAI letti da alcuna RPC** (verificato via grep sull'intera cartella `supabase/migrations`) | 18 template di sistema, tutti `auto_eligible=true` | `next_template_id` è la colonna più rilevante per la progressione (punto 7): oggi vuota per tutti e 18, va popolata a mano prima di poterla usare |
| `workout_plans.origin/coach_id nullable` | Distingue piani `coach`/`auto_system`/`superadmin_override`, CHECK di coerenza | — | Riusato identico, nessuna modifica di schema necessaria |
| `exercise_progress_history.coach_id nullable + has_pain/pain_notes` | **Schema-prep del Blocco 1, mai collegata a una RPC/UI di scrittura per self-guided** | 0 righe con `coach_id is null` | **Vedi 1.3 — gap bloccante, non un semplice riuso** |

### 1.2 RPC/funzioni Blocco 1 riusabili come pattern

- `client_has_no_active_coach(uuid)` — predicato riusato identico per ogni nuova RPC di Blocco 2.
- `_has_active_client_pro_entitlement(uuid)` (ex `client_has_active_self_guided_plan`, rinominata e messa in sicurezza il 2026-07-27, zero grant a `public`/`anon`/`authenticated`) — riusata identica per ogni controllo abbonamento.
- `_copy_template_days_to_plans(template_id, client_id, coach_id, origin)` — riusata **senza modifiche** per generare le schede del ciclo N+1 (stesso "un piano indipendente per giorno", stessa immutabilità).
- `assign_initial_auto_program()` — **pattern da replicare**, non da modificare: nessun parametro (sempre `auth.uid()`), fast-path di idempotenza prima del lock, `pg_advisory_xact_lock(hashtext(client_id::text))`, ricontrollo dopo il lock, unica funzione `SECURITY DEFINER` con `search_path=public`. La nuova RPC `run_cycle_review()` (sezione 10) segue lo stesso identico scheletro.
- `superadmin_assign_program_template(cycle_id, template_id, notes)` — pattern da replicare per le nuove RPC superadmin di sezione 14 (`select ... for update`, verifica `status` atteso, log in `superadmin_program_overrides`, notifica al cliente).
- I 3 trigger di immutabilità post-completamento (`prevent_completed_workout_plan_edit`/`_day_write`/`_day_exercise_write`, ora con bypass `supabase_auth_admin` per la cancellazione account, 2026-07-27) — **nessuna modifica necessaria**: il Blocco 2 non deve mai scrivere su una scheda `completed`, crea sempre schede nuove per il ciclo successivo.
- La decisione di processo già presa e documentata (`docs/DECISIONS.md`, 2026-07-27): **revisione on-demand, nessun `pg_cron`/job schedulato**. Il Blocco 2 eredita questa decisione senza rimetterla in discussione: ogni transizione di stato "il tempo è passato" (`checkin_due`, `paused_subscription`) viene calcolata pigramente alla lettura, non da un processo in background.

### 1.3 Gap bloccante — RISOLTO (sotto-blocco 2.0, 2026-07-27)

**Stato: implementato, testato, chiuso.** Migration
`supabase/migrations/20260803090000_enable_self_guided_exercise_progress_logging.sql`.

**Causa esatta** (confermata leggendo il codice, non assunta): `mobile/src/lib/
exercise-progress-service.ts`, funzione `resolveProgressActor()` (righe
171-209 prima della modifica), risolveva SEMPRE l'attore tramite una riga
`coach_clients` attiva. Un cliente self-guided non ha mai questa riga →
`client_not_linked` sempre, sia per l'insert (`createExerciseProgressEntries`)
sia per il delete (`deleteExerciseProgressEntry`). Le RLS INSERT/UPDATE/DELETE
su `exercise_progress_history` (tutte, sia per il coach sia per il cliente)
richiedevano anch'esse la stessa relazione `coach_clients`: un self-guided
sarebbe rimasto bloccato anche eliminando il controllo lato app.

**Soluzione**: due nuove funzioni `SECURITY DEFINER` (`log_self_guided_
exercise_progress`, `delete_self_guided_exercise_progress`), **nessuna nuova
policy RLS permissiva aggiunta**. Motivo: nessuna policy esistente permette
comunque un insert/update/delete diretto via PostgREST per un self-guided —
l'unico percorso di scrittura resta la RPC, e un tentativo di bypass diretto
resta bloccato dalla RLS esistente per assenza di policy permissiva
(verificato empiricamente: un insert diretto via REST con il token di un
cliente self-guided reale è stato respinto con `42501 row-level security
policy`). Il percorso coach (scritture dirette via RLS, invariate) non è
stato toccato: verificato con un insert diretto reale come coach su un
cliente coach-guided, riuscito esattamente come prima.

**Autorizzazione (tutta server-side, mai un parametro di identità dal
client)**: ruolo cliente, `client_has_no_active_coach()`, `_has_active_client_
pro_entitlement()`, proprietà reale della scheda (`workout_plans.client_id =
auth.uid()`), origine `auto_system`/`superadmin_override` con `coach_id is
null` (letta dal DB, mai dichiarata dal client — le due RPC non hanno
nemmeno un parametro per dichiararla), stato del ciclo collegato (via
`client_program_cycle_plans`, usando gli stati **già esistenti** del Blocco 1:
nessuna estensione di CHECK in questa migration), appartenenza dell'esercizio
alla scheda, e `exercise_progress_entry_writable()` — funzione già esistente
dal 2026-07-20, riusata identica, non duplicata — per `WORKOUT_LOCKED`.

**Test eseguiti (SQL con ruolo `authenticated` reale + REST API reali, account
sintetici dominio `@block20-test.invalid`, 7 account, harness Edge Function
temporanea rimossa a fine test)**: tutti i 15 scenari della matrice richiesta
PASS, più verifiche aggiuntive di difesa in profondità (bypass diretto RLS
bloccato, `anon` senza alcun accesso, delete cross-client bloccato,
fallimento a metà payload → rollback completo, doppia chiamata → comportamento
deterministico non duplicante in modo incoerente). Dettaglio completo in
`docs/WORKLOG.md`.

**Nota per il resto del Blocco 2 (motore di analisi progressi, sezioni 5-7)**:
i dati di carico/ripetizioni/RPE ora accumulabili tramite questo sotto-blocco
sono disponibili **solo a partire da qui in avanti**: qualunque ciclo/sessione
precedente al 2026-07-27 per un cliente self-guided non ha e non può avere
dati di carico (il logging era strutturalmente impossibile prima). Il motore
di revisione, quando verrà costruito, **non deve mai interpretare l'assenza
di dati storici pre-esistenti come una prestazione negativa** (`trend`
sarebbe correttamente `not_evaluable`, mai `negative`, per qualunque ciclo
chiuso prima dell'attivazione di questo logging) — vedi sezione 5.1, che
resta corretta così com'era, con questa precisazione esplicita aggiunta qui
perché è la sezione che i futuri lettori del documento cercheranno per primo.

### 1.3-bis Gap bloccante originale (testo conservato per riferimento storico)

**`exercise_progress_history` è strutturalmente inaccessibile per un cliente self-guided oggi.** `mobile/src/lib/exercise-progress-service.ts`, funzione `resolveProgressActor()` (righe 171-209): per QUALUNQUE scrittura di un carico/ripetizione, risolve prima una riga attiva in `coach_clients` (`relationQuery.eq('status','active').eq('client_id', clientId)`, poi filtrata per `coach_id=authUserId` se l'attore non è il cliente stesso). Un cliente self-guided **non ha mai** una riga `coach_clients` (per definizione: `client_has_no_active_coach()` è vero) → la funzione ritorna sempre `{ ok: false, code: 'client_not_linked' }`. Nessuna schermata (`schede/[id].tsx`, `esercizi/[id].tsx`) fa alcun controllo speciale su `coach_id is null` prima di montare `ExerciseSetLogger`: il logger viene mostrato normalmente e fallisce silenziosamente/con errore al primo tentativo di salvataggio.

Conseguenza diretta per questo documento: le sezioni 5-7 (analisi progressi, decisione, progressione) **non hanno alcuna sorgente dati di carico/ripetizioni/RPE su cui operare** finché questo gap non è chiuso. Un motore di revisione scritto oggi produrrebbe sempre `insufficient_progress_data` per ogni cliente reale, per sempre. Per questo la chiusura di questo gap è proposta come **sotto-blocco 2.0, da implementare PRIMA del motore di revisione** (ordine in sezione 22), non come una nota a margine.

Cosa resta invece disponibile SENZA alcuna modifica: l'aderenza (percentuale sessioni completate) è già calcolabile da `workout_plans.session_status`/`workout_day_exercises.completed`, perché `update_workout_session_progress` gestisce correttamente il ramo `coach_id is null` fin dal Blocco 1 (fix del bug reale trovato il 2026-07-30/31). Il motore di sezione 5 dovrà quindi operare su **due livelli di evidenza** esplicitamente distinti (dettaglio in sezione 5.1), non solo su un'unica fonte.

### 1.4 Altri gap concreti (non bloccanti singolarmente, ma da colmare nel Blocco 2)

1. **`client_program_cycles.status` CHECK** ammette oggi solo `('draft','active','completed','superseded','suspended','pending_review')` — 6 valori, non i 10 richiesti. Estensione additiva proposta in sezione 2.
2. **`client_cycle_reviews.decision` CHECK** ammette oggi solo `('progress','maintain','reduce','block_pain','superadmin_required')` — 5 valori con nomi diversi da quelli richiesti (`regress`≠`reduce`, `manual_review`≠`superadmin_required`, mancano `partial_change`/`blocked_safety`/`blocked_subscription`/`insufficient_data`). Estensione proposta in sezione 6.
3. **`client_monthly_checkins`** ha già la maggior parte dei campi richiesti (`perceived_difficulty`, `has_pain_or_limitation`/`pain_areas`/`pain_notes`, `requires_professional_supervision`, `wants_to_continue`, `available_minutes`, `goal_changed_to`, `variety_preference`, `liked_exercise_ids`/`disliked_exercise_ids`, `notes`) ma **manca**: percezione fatica, livello di recupero, soddisfazione (oggi `perceived_difficulty` copre solo "difficoltà", non questi tre assi distinti), disponibilità settimanale attuale (giorni/settimana — oggi solo `available_minutes`, cioè la durata, non la frequenza), attrezzatura non più disponibile / nuova attrezzatura, motivo principale degli allenamenti saltati. Estensione proposta in sezione 4.
4. **Nessun metadato di esercizio strutturato** (schema movimento, tag attrezzatura coerente con `client_fitness_profile.equipment_level`, alternative/equivalenze, livello minimo) esiste né in `mobile/src/types/training.ts` né in `public.exercises`. `Exercise.equipment` è testo libero non tassonomico (es. "Bilanciere", "Manubri"), `Exercise.difficulty` è per-esercizio ma senza legame esplicito a un "livello minimo richiesto". Nuova tabella proposta in sezione 9.
5. **Nessun ledger delle pause abbonamento**: `user_subscriptions` conserva solo lo stato corrente per riga (righe precedenti vengono marcate `canceled` dal trigger `user_subscriptions_single_active` quando sostituite, ma `starts_at`/`expires_at` restano leggibili sulle righe storiche). Il calcolo dei "giorni con abbonamento attivo" per un ciclo deve essere **ricostruito per intersezione di intervalli** dalle righe storiche, non letto da un contatore già pronto. Dettaglio e rischio in sezione 12.
6. **`app_notifications` non ha ancora un consumer UI** (Blocco 3, già noto). Il Blocco 2 scrive notifiche reali ma **il cliente/coach/superadmin non le vede finché non esiste una schermata**: rischio di percezione "il sistema non mi ha avvisato" se il Blocco 3 non viene fatto a ridosso. Segnalato come rischio operativo in sezione 20, non bloccante per la progettazione.
7. **Nessuna RPC/pannello superadmin per revisione** esiste oltre a `superadmin_assign_program_template` (sblocca solo il caso "nessun template compatibile"/"richiede supervisione" del Blocco 1). Tutto quanto richiesto in sezione 14 è nuovo.

---

## 2. Durata del ciclo — stati e transizioni

### 2.1 Concetto di ciclo e durata effettiva

Il ciclo (`client_program_cycles`) ha una **durata nominale di 28 giorni** (`review_due_at = started_at + 28`, già impostato così da `assign_initial_auto_program`). La **durata effettiva** è invece misurata in "giorni con abbonamento Client Pro attivo trascorsi dall'avvio del ciclo", non in giorni di calendario:

```
effective_active_days(cycle) = giorni in [cycle.started_at, oggi]
                                  intersecati con l'unione degli intervalli
                                  [starts_at, coalesce(expires_at, oggi)]
                                  di TUTTE le righe user_subscriptions dello
                                  stesso cliente con status in ('active','expired')
                                  e la stessa combinazione payment_provider/
                                  entitlement usata da _has_active_client_pro_entitlement
```

**[INTERPRETAZIONE — da confermare]**: si propone di includere anche le righe `status='expired'` (non solo `'active'`) nel calcolo storico, perché una riga che era `active` ieri e oggi è scaduta naturalmente per decorrenza (`expires_at < now()`) NON diventa `'expired'` come valore di `status` a meno che un job la aggiorni — verificato che nessun job del genere esiste nel progetto: lo `status` resta `'active'` finché RevenueCat/il webhook non scrive un nuovo evento. Questo significa che, in pratica, **il campo `status` da solo non basta**: il calcolo corretto è "per ogni riga storica, l'intervallo realmente coperto è `[starts_at, min(expires_at, oggi)]` se `expires_at` non è nullo, altrimenti aperto" — indipendentemente dal valore corrente di `status`. Va verificato empiricamente (con un abbonamento di test reale che scade naturalmente) prima di implementare, perché dipende dal comportamento esatto del webhook RevenueCat già in produzione, non documentato per questo caso specifico.

Non si conta mai un giorno di calendario come "trascorso" se in quel giorno il cliente non aveva un piano Client Pro attivo. Una scheda non viene mai proposta per revisione solo perché sono passati 28 giorni di calendario: la soglia si applica a `effective_active_days`, non a `current_date - started_at`.

### 2.2 Stati proposti (10, nessuno in più)

| Stato | Significato | Terminale? |
|---|---|---|
| `draft` | Riga di ciclo creata ma non ancora attiva (riservato a flussi manuali superadmin futuri; nessuna RPC automatica lo produce oggi né nel Blocco 2) | No |
| `active` | Ciclo in corso, piano assegnato e in uso, clock non ancora a soglia | No |
| `checkin_due` | `effective_active_days >= nominal_cycle_days` (soglia [PROPOSTA DA APPROVARE] in sezione 3.4) e il check-in periodico non è ancora stato completato | No |
| `review_pending` | Check-in completato; il motore di revisione non ha ancora concluso (idempotente, richiamabile finché non esce da questo stato) | No |
| `pending_subscription` | Il motore di revisione è stato invocato (check-in già fatto) ma l'entitlement Client Pro è risultato inattivo in quel momento — **distinto** da `paused_subscription` perché il check-in resta valido: al ripristino dell'abbonamento si riprende direttamente dalla revisione, senza richiedere di nuovo il check-in | No |
| `pending_safety_review` | Il check-in (o, per il primo ciclo, il questionario iniziale) segnala dolore/necessità di supervisione professionale: nessuna progressione/regressione automatica, richiede azione Superadmin | No |
| `paused_subscription` | L'entitlement Client Pro è inattivo **in qualunque momento del ciclo**, anche prima che il check-in sia dovuto — il clock si ferma, il cliente non può completare sessioni (già garantito da `update_workout_session_progress`, Blocco 1), nessuna nuova revisione viene tentata | No |
| `completed` | Il ciclo è stato chiuso regolarmente da una revisione automatica o da un'azione Superadmin equivalente, e un ciclo N+1 è stato creato | Sì |
| `replaced` | Il ciclo è terminato non per revisione naturale ma perché il cliente ha ricevuto un coach, o per un intervento Superadmin che sostituisce il ciclo con un altro percorso | Sì |
| `cancelled` | Il ciclo è stato annullato manualmente da un Superadmin senza sostituzione (dato errato, duplicato, ecc.) | Sì |
| `pending_template` | **(11° stato, approvato 2026-07-27)** Nessun template/insieme di esercizi compatibile trovato per un rinnovo (caso distinto da `pending_safety_review`: qui non c'è alcun segnale di dolore/sicurezza, solo assenza di corrispondenza). Non sostituisce mai la scheda corrente, non genera mai una scheda incompleta, crea una sola segnalazione Superadmin, conserva la review e i criteri senza corrispondenza, sbloccabile solo da azione manuale Superadmin | No |

**Decisione approvata sul rename**: `pending_review`/`suspended`/`superseded` (i 3 valori Blocco 1 non nella lista sopra) vengono rimossi dal CHECK e sostituiti — `pending_review` si scinde ora in **due stati distinti e mai confusi**: `pending_safety_review` (riservato ESCLUSIVAMENTE al segnale di dolore/necessità di supervisione professionale) e `pending_template` (riservato ESCLUSIVAMENTE al caso "nessun template/insieme di esercizi compatibile", che nel Blocco 1 usava impropriamente lo stesso `pending_review` per un motivo concettualmente diverso). L'ipotesi precedente di riusare `pending_safety_review` per entrambi i casi è stata esplicitamente respinta dall'utente. `suspended`/`superseded` (mai prodotti da codice nel Blocco 1) diventano rispettivamente `paused_subscription`/`replaced`.

Questa riformulazione del CHECK è una modifica additiva sicura sui dati reali (verificato: l'unica riga esistente ha `status='active'`, valore che resta valido in ogni caso) — da applicare comunque tramite un'unica migration transazionale che aggiorna prima le righe esistenti non compatibili (nessuna oggi) e poi elimina/ricrea il CHECK, con la mappatura vecchio→nuovo valore documentata nella migration stessa, come richiesto e approvato.

### 2.3 Transizioni consentite

```
draft              -> active                          (manuale superadmin, non automatico)
active              -> checkin_due                     (sync on-demand: soglia raggiunta, check-in non fatto)
active              -> paused_subscription              (sync on-demand: entitlement inattivo)
checkin_due         -> review_pending                   (submit_monthly_checkin riuscito)
checkin_due         -> paused_subscription              (sync on-demand: entitlement inattivo prima del check-in)
review_pending      -> completed                        (run_cycle_review: decisione progress/maintain/regress/partial_change, nuovo ciclo creato)
review_pending      -> pending_safety_review             (run_cycle_review: dolore/supervisione segnalati nel check-in)
review_pending      -> pending_subscription              (run_cycle_review: entitlement inattivo al momento della revisione)
review_pending      -> review_pending                    (run_cycle_review: dati insufficienti — nessuna transizione, safe retry, riga in client_cycle_reviews comunque scritta con decision='insufficient_data' per audit, MAI come motivo di chiusura ciclo)
pending_subscription -> review_pending                   (sync on-demand: entitlement ripristinato, si riprova la revisione automaticamente al prossimo accesso)
paused_subscription  -> active | checkin_due              (sync on-demand: entitlement ripristinato, active_days ricalcolati)
pending_safety_review -> active | completed              (SOLO superadmin_resolve_safety_review, sezione 14)
QUALUNQUE stato non terminale -> replaced                (client_has_no_active_coach() diventa falso: coach assegnato, sezione 13)
QUALUNQUE stato non terminale -> cancelled                (SOLO superadmin, azione esplicita e motivata)
```

**Transizioni esplicitamente vietate**: nessuna transizione uscente da `completed`/`replaced`/`cancelled` (verificate con `select ... for update` + controllo `status` prima di ogni scrittura, stesso pattern già usato da `superadmin_assign_program_template`); nessuna transizione diretta `active -> completed` (deve sempre passare da `checkin_due`/`review_pending`: non si può "saltare" il check-in); nessuna transizione che un cliente possa invocare direttamente passando lo stato di destinazione come parametro (tutte le transizioni sono effetti collaterali di RPC che decidono internamente lo stato di arrivo, mai un `update` diretto esposto).

---

## 3. Requisiti minimi per la revisione — funzione di eleggibilità

### 3.1 Firma proposta

```sql
create or replace function public.check_cycle_review_eligibility(p_cycle_id uuid)
returns table (
  eligible boolean,
  result text, -- vedi 3.3
  reason text,
  completion_ratio numeric,
  sessions_completed integer,
  exercises_with_data_ratio numeric
)
language plpgsql
stable
security definer
set search_path = public
```

**Pura, senza effetti collaterali**, richiamabile in qualunque momento (anche dalla UI per mostrare "quanto manca alla revisione") senza mutare nulla. `run_cycle_review()` (sezione 10) la richiama internamente come primo passo.

### 3.2 Criteri valutati (tutti sul ciclo, non sull'intero storico cliente)

1. `effective_active_days(cycle) >= nominal_cycle_days` [PROPOSTA 28] → altrimenti `cycle_not_due`.
2. `client_program_cycles.status = 'review_pending'` (cioè il check-in è già stato completato) → altrimenti `checkin_required`.
3. `_has_active_client_pro_entitlement(client_id)` → altrimenti `subscription_required`.
4. `client_has_no_active_coach(client_id)` → altrimenti `coach_assigned` (difesa in profondità: non dovrebbe mai accadere, perché l'assegnazione di un coach già forza `replaced`, sezione 13, ma la funzione lo ricontrolla comunque, mai fidandosi solo dello stato ciclo).
5. `client_fitness_profile.requires_professional_supervision` **o** `client_monthly_checkins.requires_professional_supervision` (l'ultimo check-in del ciclo) → `safety_review_required`.
6. `client_cycle_reviews` non ha già una riga con `next_cycle_id is not null` per questo `cycle_id` → altrimenti `already_reviewed` (idempotenza, vedi sezione 10.3).
7. Percentuale di allenamenti completati: `count(workout_plans con session_status='completed') / count(workout_plans totali del ciclo)` → se `< min_completion_ratio` [PROPOSTA 0.60] → `insufficient_sessions`.
8. Numero minimo di sessioni effettive: `count(workout_plans con session_status='completed')` → se `< min_sessions` [PROPOSTA 4] → `insufficient_sessions` (stesso codice risultato di 7, causa combinata).
9. Percentuale esercizi principali con dati utilizzabili (**richiede il sotto-blocco 2.0**, sezione 1.3): `count(exercizi 'primary' per movement_pattern con almeno N righe exercise_progress_history) / count(esercizi 'primary' nel piano)` → se `< min_exercise_data_ratio` [PROPOSTA 0.50] → `insufficient_progress_data`.
10. Nessun `superadmin_program_overrides` con `action='disable_template'` sul template corrente non ancora gestito → non un blocco diretto, ma un input alla decisione (sezione 6).

### 3.3 Valori di `result` (9, esattamente quelli richiesti)

`eligible` · `insufficient_sessions` · `insufficient_progress_data` · `checkin_required` · `subscription_required` · `coach_assigned` · `safety_review_required` · `already_reviewed` · `cycle_not_due`

Ordine di valutazione: **cycle_not_due → checkin_required → already_reviewed → coach_assigned → subscription_required → safety_review_required → insufficient_sessions → insufficient_progress_data → eligible**. Il primo che fallisce determina `result`; nessuna combinazione multipla in un'unica risposta (mantiene "spiegabile", sezione 5 filosofia generale).

### 3.4 Soglie [PROPOSTA DA APPROVARE — tutte in `auto_program_review_config`, sezione 7.3]

`nominal_cycle_days=28`, `min_completion_ratio=0.60`, `min_sessions=4`, `min_exercise_data_ratio=0.50`.

Se i dati sono insufficienti (`insufficient_sessions`/`insufficient_progress_data`), **il ciclo resta in `review_pending`** (nessuna transizione), il cliente continua ad allenarsi sulla scheda esistente (non toccata, non scaduta: `workout_plans.expiry_date` è già impostata a 90 giorni da `_copy_template_days_to_plans`, ampio margine), e la revisione viene ritentata al prossimo accesso — mai una progressione inventata sui pochi dati disponibili.

---

## 4. Questionario periodico (check-in)

### 4.1 Estensione proposta a `client_monthly_checkins` (additiva, 0 righe reali oggi — nessun rischio dati)

```sql
alter table public.client_monthly_checkins
  add column if not exists perceived_fatigue text check (perceived_fatigue is null or perceived_fatigue in ('low','moderate','high')),
  add column if not exists recovery_quality text check (recovery_quality is null or recovery_quality in ('poor','fair','good')),
  add column if not exists satisfaction text check (satisfaction is null or satisfaction in ('low','medium','high')),
  add column if not exists available_days_per_week integer check (available_days_per_week is null or available_days_per_week between 1 and 7),
  add column if not exists equipment_no_longer_available text[] not null default '{}'::text[],
  add column if not exists equipment_newly_available text[] not null default '{}'::text[],
  add column if not exists main_skip_reason text check (main_skip_reason is null or main_skip_reason in ('no_time','no_motivation','pain_discomfort','travel','equipment_unavailable','too_hard','none')),
  add column if not exists locked_at timestamptz;
```

`available_minutes`/`goal_changed_to`/`variety_preference`/`liked_exercise_ids`/`disliked_exercise_ids`/`has_pain_or_limitation`/`pain_areas`/`pain_notes`/`requires_professional_supervision`/`wants_to_continue`/`notes` restano invariati (già coprono il resto della sezione 4 richiesta).

### 4.2 Campi obbligatori vs opzionali

Obbligatori per considerare il check-in "completo" (mirror del pattern `client_fitness_profile.completed`, CHECK esplicito): `perceived_difficulty`, `perceived_fatigue`, `recovery_quality`, `satisfaction`, `available_days_per_week`, `available_minutes`, `variety_preference`, `has_pain_or_limitation` (booleano, sempre risposto esplicitamente — mai un default silenzioso, stesso principio già usato per `requires_professional_supervision` nel questionario iniziale). Opzionali: `pain_areas`/`pain_notes` (solo se `has_pain_or_limitation=true`), `goal_changed_to`, `equipment_no_longer_available`/`equipment_newly_available`, `liked_exercise_ids`/`disliked_exercise_ids`, `main_skip_reason`, `notes`.

### 4.3 Validazioni

- `has_pain_or_limitation=true` **e** `pain_areas` vuoto → rifiutato lato RPC (`INVALID_PAYLOAD`), stesso principio del questionario iniziale: non si accetta "ho dolore" senza area.
- `requires_professional_supervision=true` non richiede `has_pain_or_limitation=true` (una condizione può richiedere supervisione senza essere "dolore", es. una nuova diagnosi riferita in `notes`).
- `liked_exercise_ids`/`disliked_exercise_ids` verificati contro gli esercizi effettivamente presenti nel ciclo corrente (non un id arbitrario): un id non appartenente al piano viene scartato silenziosamente (mai un errore bloccante per un campo secondario).
- `main_skip_reason='none'` ammesso solo se `completion_ratio` del ciclo (sezione 3) è già alto — **non enforced lato server** in questo blocco (sarebbe un giudizio, non una validazione): lasciato passare, la contraddizione eventuale finisce in `manual_review` se rilevante (sezione 6).

### 4.4 Condizioni che richiedono revisione manuale (si riflettono sulla decisione, sezione 6, non sul salvataggio del check-in)

`has_pain_or_limitation=true` con area diversa da quelle già escluse in precedenza; `requires_professional_supervision=true`; `goal_changed_to` diverso dall'obiettivo `client_onboarding.goals[1]` originale; `equipment_no_longer_available` che rimuove l'unico livello attrezzatura disponibile (es. cliente passa da `full_gym` a nessuna attrezzatura riportata).

### 4.5 Modifica prima dell'elaborazione / blocco dopo la revisione

Nuova RPC `submit_monthly_checkin(p_cycle_id uuid, payload jsonb)`: upsert su `client_monthly_checkins` (vincolo `unique cycle_id` già esistente), permesso **finché** `client_program_cycles.status in ('checkin_due','review_pending')` — una volta che `run_cycle_review()` ha concluso (ciclo non più in questi due stati), un trigger `prevent_checkin_edit_after_review` (nuovo, stesso schema dei trigger di immutabilità esistenti: `before update`, blocca se `old.locked_at is not null`) impedisce ogni modifica. `locked_at` viene impostato da `run_cycle_review()` nello stesso momento in cui calcola la decisione (mai lasciato al client).

Nessuna diagnosi medica: `requires_professional_supervision`/`pain_areas`/`pain_notes` restano segnali grezzi passati al Superadmin, mai interpretati o etichettati automaticamente come una condizione clinica.

---

## 5. Analisi dei progressi

### 5.1 Due livelli di evidenza (sotto-blocco 2.0 ora implementato, vedi sezione 1.3)

- **Livello A — sempre disponibile (aderenza)**: da `workout_plans.session_status`/`completed_at`/`duration_seconds` e `workout_day_exercises.completed`. Non richiede alcuna modifica.
- **Livello B — disponibile SOLO dal 2026-07-27 in poi (carico/ripetizioni/RPE)**: da `exercise_progress_history`, ora scrivibile per self-guided tramite `log_self_guided_exercise_progress` (sotto-blocco 2.0, chiuso — sezione 1.3). **Importante per il motore quando verrà costruito**: qualunque ciclo/sessione self-guided completato PRIMA di questa data non ha e non può avere dati di Livello B (il logging era strutturalmente impossibile) — il motore deve trattare quei cicli storici come `trend='not_evaluable'`, **mai come `trend='negative'`**: l'assenza di dati pregressi non è mai una prestazione negativa, è un'assenza di strumento. Per i cicli aperti dal 2026-07-27 in poi, il Livello B è normalmente disponibile e va usato.

### 5.2 Funzione proposta

```sql
create type public.exercise_progress_metric as (
  exercise_id text,
  movement_pattern text,       -- da exercise_movement_metadata, sezione 9
  sessions_count integer,      -- Livello A
  sets_completed integer,      -- Livello B (0 se non disponibile)
  reps_completed integer,      -- Livello B
  initial_load numeric,        -- Livello B, primo peso registrato nel ciclo
  final_load numeric,          -- Livello B, ultimo peso registrato nel ciclo
  best_load numeric,           -- Livello B, massimo peso registrato nel ciclo
  total_volume numeric,        -- Livello B, sum(weight_kg * reps_completed)
  consistency_ratio numeric,   -- sessioni con questo esercizio completato / sessioni previste con questo esercizio
  skipped_count integer,       -- Livello A: quante volte marcato non completed
  avg_rpe numeric,             -- Livello B, avg(perceived_effort) se presente
  had_pain boolean,            -- Livello B (has_pain) OR segnalazione check-in su area corrispondente
  trend text                   -- 'positive'|'stable'|'negative'|'not_evaluable', vedi 5.3
);

create or replace function public._compute_exercise_progress_metrics(p_cycle_id uuid)
returns setof public.exercise_progress_metric
language plpgsql
stable
security definer
set search_path = public
```

Nessun valore testuale libero dove serve una decisione automatica: `trend` è un enum a 4 valori, non una stringa descrittiva. Il "perché" (spiegazione leggibile) vive separatamente in `decision_reason`/`client_cycle_reviews.decision_reason`, mai nello stesso campo usato per decidere.

### 5.3 Calcolo di `trend` (deterministico, non un giudizio soggettivo)

```
not_evaluable  se sessions_count < 2 OPPURE (Livello B assente per questo esercizio)
negative       se avg_rpe > soglia_rpe_alta [PROPOSTA 8.5] O had_pain=true O final_load < initial_load
stable         se final_load == initial_load E consistency_ratio >= soglia_consistenza [PROPOSTA 0.7]
positive       se final_load > initial_load E reps_completed >= reps_previste E non had_pain
```

Non si usa mai il solo peso corporeo/BMI come indicatore: `trend` è calcolato per-esercizio da carico/ripetizioni/RPE/dolore/regolarità, mai da una metrica antropometrica generale (che in questo progetto vive altrove, `client_metrics`, dominio distinto e non toccato da questo blocco).

---

## 5-bis. Perché non un JSON libero: schema normalizzato

`exercise_progress_metric` è un composite type tipizzato (non `jsonb` libero) proprio perché la sezione 6 (decisione) deve poter fare confronti numerici/booleani diretti senza validare la forma di un JSON a runtime. La versione persistita in `client_cycle_reviews.metrics_snapshot` (jsonb) è una **serializzazione** di un array di questo tipo già validato, non la fonte di verità per la decisione — la fonte di verità è il risultato tipizzato della funzione, calcolato ogni volta al bisogno (stabile, non memoizzato: un ciclo revisionato una sola volta, nessun problema di performance a questo volume).

---

## 6. Decisione del ciclo

### 6.1 Estensione proposta a `client_cycle_reviews.decision` (additiva; 0 righe reali oggi)

```sql
alter table public.client_cycle_reviews drop constraint client_cycle_reviews_decision_check;
alter table public.client_cycle_reviews add constraint client_cycle_reviews_decision_check
  check (decision in ('progress','maintain','regress','partial_change','manual_review','blocked_safety','blocked_subscription','insufficient_data'));
```

(Nota: rinomina `reduce`→`regress`, `superadmin_required`→`manual_review`; nessuna riga reale da migrare, verificato.)

### 6.2 Regole (in ordine di valutazione — la prima che si applica vince, mai una combinazione)

```
blocked_safety        := eligibility.result = 'safety_review_required'
blocked_subscription  := eligibility.result = 'subscription_required'
insufficient_data     := eligibility.result in ('insufficient_sessions','insufficient_progress_data')
manual_review          := goal_changed_to diverso dall'obiettivo originale
                          OR nuova pain_area mai segnalata prima
                          OR nessun v_template_id trovato per un eventuale rinnovo motore (stage 1-4 di assign_initial_auto_program, stessa cascata)
                          OR trend contraddittori (>= 1 esercizio positive E >= 1 esercizio negative con had_pain=true nello stesso ciclo)
regress                := main_skip_reason in ('too_hard','pain_discomfort')
                          OR completion_ratio < 0.75 [PROPOSTA] con skipped_count alto su piu' esercizi
                          OR recovery_quality='poor' E perceived_fatigue='high'
                          OR available_days_per_week < giorni previsti dal piano corrente
                          OR rientro dopo paused_subscription lunga (sezione 12.3)
progress               := completion_ratio >= 0.85 [PROPOSTA]
                          E almeno un esercizio 'primary' con trend='positive'
                          E nessun esercizio con trend='negative'
                          E perceived_difficulty in ('right')
                          E satisfaction in ('medium','high')
maintain               := tutto il resto (risultati accettabili ma non abbastanza per 'progress',
                          oppure dati Livello B insufficienti per decidere un aumento pur con
                          aderenza sufficiente — "maintain" è il default sicuro, mai "progress"
                          per default)
```

**Principio guida esplicito**: `maintain` è lo stato di default quando i segnali non sono chiaramente in una direzione — non `progress`. Questo rispetta "se i dati sono insufficienti, il sistema non deve inventare una progressione" anche nel caso limite in cui l'eleggibilità (sezione 3) sia soddisfatta ma il Livello B (carico) resti debole per un singolo esercizio non critico.

### 6.3 Soglie di questa sezione [PROPOSTA DA APPROVARE]

`progress.min_completion_ratio=0.85`, `regress.max_completion_ratio=0.75`, `trend.rpe_high=8.5`, `trend.consistency_stable=0.70`.

---

## 7. Progressione

### 7.1 Gerarchia (applicata in ordine, mai più di un livello contemporaneamente per lo stesso esercizio)

1. Completare il range di ripetizioni previsto (se `reps_completed < reps_max` del ciclo precedente su più sessioni, il ciclo N+1 **non** aumenta il carico: aumenta prima il target ripetizioni entro il range esistente).
2. Aumentare leggermente il carico (solo se il range ripetizioni è già pieno da almeno 2 sessioni consecutive nel ciclo precedente).
3. Aumentare una serie, solo se il carico è già stato aumentato con successo in un ciclo precedente per lo stesso esercizio (mai al primo ciclo di progressione).
4. Modificare recuperi/tempo sotto tensione (parametro `rest_seconds`/tecnica, non serie/carico).
5. Passare a una variante più difficile (`next_template_id` o sostituzione mirata via `substitution_group`, sezione 9) **solo dopo** che i livelli 1-4 sono già stati esauriti in cicli precedenti per quel pattern di movimento (serve quindi guardare `previous_cycle_id` a ritroso, non solo il ciclo immediatamente precedente — **[PROPOSTA]** limite di lookback: 2 cicli precedenti, non l'intero storico).

### 7.2 Limiti per singolo ciclo [PROPOSTA DA APPROVARE, in `auto_program_review_config`]

`max_load_increase_ratio=0.10` (mai oltre +10% rispetto al carico finale del ciclo precedente per lo stesso esercizio); `max_added_sets_per_exercise=1`; nessun aumento per esercizi con `trend='not_evaluable'`; nessun aumento per esercizi con `had_pain=true` nel ciclo appena concluso (indipendentemente dal `trend` complessivo); nessun recupero automatico dei vecchi massimali dopo una pausa lunga (sezione 12.3) — un rientro dopo pausa lunga riparte SEMPRE da `regress` (settimana di rientro, sezione 8), mai da dove il cliente aveva lasciato.

### 7.3 Tabella di configurazione (tutte le soglie di sezioni 3, 6, 7, 8, 9 in un unico posto, VERSIONATA — decisione approvata 2026-07-27)

**Requisito approvato**: una review storica deve poter indicare quale versione
delle soglie è stata usata. Modello proposto: ogni modifica a una qualunque
soglia crea un nuovo `config_version` (snapshot completo di tutte le chiavi,
non solo di quella modificata), mai un update in-place dei valori di una
versione già usata da almeno una review. Il motore legge sempre la versione
`is_active=true` corrente; `client_cycle_reviews.algorithm_version` (sezione
11.2) registra il `config_version` realmente usato per quella revisione — un
intero che punta qui, non una stringa libera.

```sql
create table public.auto_program_review_config (
  id uuid primary key default gen_random_uuid(),
  config_version integer not null,
  key text not null,
  value numeric not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (config_version, key)
);
-- Una sola versione attiva alla volta (tutte le sue righe, non una per chiave):
-- attivare una nuova versione disattiva atomicamente tutte le righe della
-- precedente (RPC superadmin dedicata, non un update diretto).
create unique index auto_program_review_config_active_key_uidx
  on public.auto_program_review_config(key) where is_active;

-- RLS: solo superadmin (read/write). Letta dalle funzioni SECURITY DEFINER,
-- che bypassano la RLS in quanto proprietarie (stesso meccanismo già verificato
-- per le altre tabelle Blocco 1: il ruolo che applica le migration ha
-- rolbypassrls=true).
```

Seed proposto (`config_version = 1`, `is_active = true`, **tutte modificabili
da Superadmin senza nuova migration** creando una versione 2 — questo è
l'unico posto dove queste percentuali vivono, mai hardcoded in PL/pgSQL):

| key | value | description |
|---|---|---|
| `nominal_cycle_days` | 28 | Durata nominale del ciclo in giorni di abbonamento attivo |
| `min_completion_ratio` | 0.60 | Soglia minima aderenza per eleggibilità |
| `min_sessions` | 4 | Numero minimo sessioni completate per eleggibilità |
| `min_exercise_data_ratio` | 0.50 | Percentuale minima esercizi principali con dati Livello B |
| `progress_min_completion_ratio` | 0.85 | Soglia aderenza per decisione `progress` |
| `regress_max_completion_ratio` | 0.75 | Soglia aderenza sotto cui si valuta `regress` |
| `trend_rpe_high` | 8.5 | RPE oltre cui un esercizio è `negative` |
| `trend_consistency_stable` | 0.70 | Regolarità minima per `stable` |
| `max_load_increase_ratio` | 0.10 | Incremento massimo carico per ciclo |
| `max_added_sets_per_exercise` | 1 | Serie aggiuntive massime per esercizio per ciclo |
| `min_exercise_keep_ratio` | 0.60 | Percentuale minima esercizi mantenuti tra cicli |
| `max_exercise_change_ratio` | 0.40 | Percentuale massima esercizi cambiati tra cicli |
| `short_pause_days` | 7 | Soglia pausa abbonamento "breve" |
| `medium_pause_days` | 21 | Soglia pausa abbonamento "media" (oltre = lunga) |

---

## 8. Regressione

### 8.1 Azioni possibili (scelte dal motore in base a quale criterio di sezione 6.2 ha attivato `regress`)

- Riduzione carico suggerito (stesso `max_load_increase_ratio` ma in negativo, [PROPOSTA] -10% singolo step, mai un azzeramento).
- Riduzione serie (mai sotto 1 per esercizio).
- Riduzione frequenza settimanale (allineata a `available_days_per_week` del check-in, mai forzata sopra la disponibilità dichiarata).
- Allenamenti più brevi (allineati a `available_minutes` aggiornato).
- Variante più semplice (stesso meccanismo di sostituzione di sezione 9, ma verso il basso: `substitution_group` con `min_level` inferiore).
- Sostituzione mirata dell'esercizio che ha causato `had_pain=true` (mai una sostituzione generica "a caso").
- Mantenimento di tecnica e gruppo muscolare: la sostituzione (sezione 9) garantisce sempre stesso `movement_pattern`/gruppo muscolare primario, mai un cambio di focus corporeo come effetto collaterale di una regressione.
- Settimana iniziale di rientro: se la causa è `paused_subscription` lunga (sezione 12.3), il ciclo N+1 generato ha automaticamente `-1` serie su tutti gli esercizi principali e `max_load` bloccato al valore dell'**ultimo ciclo con aderenza sufficiente prima della pausa** (non al carico finale, che potrebbe essere sovrastimato rispetto alla condizione attuale del cliente dopo l'inattività).

### 8.2 Pausa abbonamento non è scarsa aderenza

`completion_ratio` (sezione 3/6) è calcolato **solo sui giorni con `effective_active_days`** (sezione 2.1): i giorni in `paused_subscription` non contribuiscono né al numeratore né al denominatore. Un cliente che si allena regolarmente nei giorni in cui l'abbonamento è attivo non viene mai penalizzato per il periodo di sospensione.

---

## 9. Variazione degli esercizi

### 9.1 Gap di metadati (confermato in sezione 1.4.4): nuova tabella necessaria

```sql
create table public.exercise_movement_metadata (
  exercise_id text primary key, -- stesso testo libero usato da workout_day_exercises.exercise_id: id locale (es. 'gambe-squat') o uuid-as-text di public.exercises (ymove/custom)
  movement_pattern text not null check (movement_pattern in (
    'squat','hinge','lunge','horizontal_push','horizontal_pull',
    'vertical_push','vertical_pull','core_anti_extension',
    'core_anti_rotation','carry','isolation_arms','isolation_legs',
    'cardio','mobility'
  )),
  equipment_tag text not null check (equipment_tag in ('bodyweight_only','home_basic','full_gym')),
  min_level text not null check (min_level in ('beginner','intermediate','advanced')),
  role text not null default 'accessory' check (role in ('primary','secondary','accessory')),
  substitution_group text, -- esercizi con lo stesso valore sono equivalenti per pattern+gruppo muscolare
  is_pain_sensitive_default boolean not null default false, -- vero per esercizi statisticamente più segnalati come dolorosi (es. affondi con ginocchio, panca con presa stretta) — valore di partenza, mai l'unico segnale (has_pain reale del cliente vince sempre)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: enable, nessuna policy per anon/authenticated (letta solo da funzioni
-- SECURITY DEFINER); una policy superadmin_all per un futuro pannello di
-- gestione (fuori scope Blocco 2 lato UI, ma lo schema la prevede già).
```

**Popolamento**: manuale/scriptato per i 44 esercizi locali (`mobile/src/data/exercise-library.ts`) e per gli esercizi ymove/custom effettivamente referenziati dai 18 template di sistema (stesso script di verifica già usato per validare gli id nel 2026-07-13, "0 id inventati" — da riadattare per generare `movement_pattern`/`equipment_tag`/`min_level` invece di limitarsi a validare l'esistenza). Chiuso (closed set): confermato via grep che tutti gli esercizi nei 18 template di sistema usano id locali (`'gambe-squat'`, `'petto-panca-piana'`, ecc.), mai un uuid ymove/custom — quindi il popolamento iniziale copre solo i 44 esercizi locali, non l'intero catalogo ymove (che resta fuori scope finché un template di sistema non lo referenzia).

### 9.2 Categorie (già presenti concettualmente, ora formalizzate)

- **Principali da mantenere**: `role='primary'` con `trend in ('positive','stable')` nel ciclo precedente.
- **Secondari modificabili**: `role='secondary'`.
- **Accessori a maggiore rotazione**: `role='accessory'`.
- **Esclusi**: presenti in `client_excluded_exercises` con `active=true` — mai riproposti, indipendentemente da `reason`.
- **Bloccati per sicurezza**: `client_excluded_exercises.reason='pain'` — trattati in modo distinto da `'dislike'`: un esercizio `pain` non solo non viene riproposto, ma il suo intero `substitution_group` viene evitato per quel cliente nel ciclo N+1 (un dolore su uno squat a corpo libero non deve tradursi nel proporre uno squat con bilanciere come "alternativa", perché condividono `substitution_group`).
- **Non valutabili per mancanza dati**: `trend='not_evaluable'` — trattati come `secondary` di default per la rotazione, mai promossi a "mantenuto per risultati" (perché non ci sono risultati da citare).

### 9.3 Regole quantitative [PROPOSTA DA APPROVARE, in `auto_program_review_config`]

`min_exercise_keep_ratio=0.60`, `max_exercise_change_ratio=0.40` (i due si sovrappongono deliberatamente: 60-70% mantenuto lascia il 30-40% di margine per sostituzioni, coerente con la richiesta "50–70%"/"non più del 30–40%" — si propone il punto medio 60/40 come default singolo, non un range, per rendere la regola verificabile in un test automatico).

### 9.4 Algoritmo di sostituzione (per ogni esercizio da sostituire)

```
1. Determinare substitution_group + movement_pattern + role dell'esercizio uscente.
2. Candidati = esercizi con lo stesso substitution_group,
   equipment_tag compatibile con client_fitness_profile.equipment_level corrente
   (mapping: full_gym accetta full_gym/home_basic/bodyweight_only;
   home_basic accetta home_basic/bodyweight_only; bodyweight_only accetta solo bodyweight_only),
   min_level <= livello cliente (stessa scala _level_ordinal già esistente),
   NON in client_excluded_exercises (active=true, qualunque reason),
   NON riproposto nell'ultimo cambio per lo stesso cliente sullo stesso substitution_group
   (evita l'alternanza A->B->A->B tra due cicli consecutivi richiesta esplicitamente
   dal task: si tiene traccia in client_cycle_exercise_transitions, sezione 11).
3. Se nessun candidato: l'esercizio resta nella scheda invariato (mai una scheda
   con un buco), e il ciclo passa a decision='manual_review' se questo accade
   per un esercizio 'primary' (un accessorio non sostituibile non giustifica
   da solo una revisione manuale).
4. Altrimenti: sceglie il primo candidato per sort_order/creazione (deterministico,
   mai casuale), registra il motivo (dislike/pain/stagnation/variety_preference)
   in client_cycle_exercise_transitions.
```

Priorità di sostituzione: prima gli esercizi segnalati non graditi/incompatibili/stagnanti (`trend='negative'` per 2 cicli consecutivi = "stagnante"), solo dopo — se serve ancora margine per raggiungere `variety_preference='more_variety'` — gli accessori a rotazione libera.

---

## 10. Creazione del nuovo ciclo — RPC atomica e idempotente

### 10.1 Firma

```sql
create or replace function public.run_cycle_review()
returns uuid -- id del client_cycle_reviews creato (o esistente, se idempotente)
language plpgsql
security definer
set search_path = public
```

Nessun parametro: sempre `auth.uid()`, stesso principio di `assign_initial_auto_program()`. Trova da sé il ciclo corrente (`status in ('checkin_due','review_pending','pending_subscription')`) del chiamante — se non esiste alcun ciclo in questi stati, errore `NOT_DUE: nessuna revisione in attesa`.

### 10.2 Passi (mappano 1:1 i 12 richiesti)

```
1.  select ... for update sul ciclo corrente (blocca contro chiamate concorrenti).
2.  check_cycle_review_eligibility(cycle_id) — se non eligible, gestisce i casi
    pending_subscription/pending_safety_review (transizione + return) o
    review_pending invariato (insufficient_*) + riga client_cycle_reviews
    con decision='insufficient_data' (audit, nessuna transizione) + return.
3.  (già verificato dentro il passo 2: abbonamento, coach, check-in valido)
4.  _compute_exercise_progress_metrics(cycle_id) — Livello A sempre, Livello B
    se disponibile (sotto-blocco 2.0).
5.  insert in client_cycle_reviews (decision, decision_reason, metrics_snapshot,
    algorithm_version, eligibility_result) — SEMPRE scritta, anche per
    insufficient_data (vedi sopra) e anche per blocked_safety/blocked_subscription.
6.  Decisione (sezione 6) determinata dalla riga appena scritta.
7.  Se progress/maintain/regress/partial_change: genera il piano N+1
    (_copy_template_days_to_plans, template scelto per continuità/next_template_id
    o stesso template con override sostituzioni) — MAI modifica il piano
    esistente (resta completed/immutabile).
8.  insert nuovo client_program_cycles (cycle_number+1, previous_cycle_id=cycle_id,
    source in base alla decisione, started_at=current_date, review_due_at
    calcolato su effective_active_days, non su current_date+28 fisso —
    sezione 2.1).
9.  Collega: nuovo ciclo.previous_cycle_id già impostato al passo 8;
    client_cycle_reviews.next_cycle_id impostato subito dopo l'insert del
    passo 8 (stesso pattern "returning id into" già usato in tutte le RPC
    Blocco 1).
10. update client_program_cycles set status='completed' (o 'replaced'/
    'cancelled' per i rami non-decisione) where id=cycle_id.
11. insert in app_notifications (evento in base all'esito, sezione 15).
12. return v_review_id — la risposta stessa (via una tabella/jsonb, non solo
    l'uuid nudo — vedi 10.4) è "spiegabile": decisione + motivo + link al
    nuovo ciclo.
```

### 10.3 Idempotenza — garanzie esplicite

- **Due review**: impedito da `client_cycle_reviews.cycle_id unique` (già esistente) + dal controllo "già revisionato" (`already_reviewed`, sezione 3) prima di qualunque insert.
- **Due cicli**: impedito dallo stesso indice unico parziale già esistente (`client_program_cycles_one_current_per_client_idx`, `status in ('draft','active','pending_review')` — **da aggiornare** nell'estensione del CHECK per includere tutti gli stati non-terminali: `('draft','active','checkin_due','review_pending','pending_subscription','pending_safety_review','paused_subscription')`).
- **Due schede**: impedito dal fatto che il passo 7 (creazione piano N+1) avviene DOPO il lock `for update` del passo 1 e DOPO l'insert della review (passo 5) — una seconda chiamata concorrente si blocca sul lock, poi al risveglio trova `already_reviewed` e ritorna senza rieseguire il passo 7.
- **Due notifiche**: stesso principio — il passo 11 avviene una sola volta per revisione, dentro la stessa transazione della review.
- **Lock**: `select ... for update` sulla riga `client_program_cycles` (non un advisory lock come in `assign_initial_auto_program`, perché qui esiste già una riga concreta da bloccare — l'advisory lock in Blocco 1 serviva perché la riga non esisteva ancora al momento del lock).

### 10.4 Forma del risultato ("spiegabile")

```sql
returns table (
  review_id uuid,
  decision text,
  decision_reason text,
  next_cycle_id uuid,
  eligibility_result text
)
```

(non un semplice `uuid`: la UI e il Superadmin devono poter mostrare subito l'esito senza una seconda query.)

---

## 11. Immutabilità e storico

### 11.1 Principio

Nessuna scheda `completed` viene mai modificata (i 3 trigger Blocco 1 lo garantiscono già, invariati). Il ciclo N+1 è **sempre** un nuovo `client_program_cycles` + nuove `workout_plans` indipendenti, collegate da `previous_cycle_id`.

### 11.2 Colonne relazionali vs `jsonb`

**Relazionali** (necessarie per query/filtri/dashboard senza parsing JSON):
- `client_program_cycles`: `previous_cycle_id` (già esiste), + nuove `checkin_completed_at timestamptz`, `effective_active_days_at_review integer`, `subscription_paused_days integer not null default 0`, `last_subscription_check_at timestamptz`.
- `client_cycle_reviews`: `decision` (già esiste, CHECK esteso), + nuove `algorithm_version integer not null` (**non una stringa**: punta a `auto_program_review_config.config_version`, la versione delle soglie realmente usata per questa review — requisito approvato 2026-07-27, sezione 7.3), `eligibility_result text not null`, `exercises_kept_count integer not null default 0`, `exercises_replaced_count integer not null default 0`, `superadmin_override_id uuid references superadmin_program_overrides(id) on delete set null`.
- **Nuova tabella** `client_cycle_exercise_transitions` (relazionale, non jsonb — è esattamente il caso "serve alle query principali" citato nel task):

```sql
create table public.client_cycle_exercise_transitions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.client_cycle_reviews(id) on delete cascade,
  previous_exercise_id text,
  new_exercise_id text,
  action text not null check (action in ('kept','progressed','regressed','replaced','removed','added')),
  reason text,
  created_at timestamptz not null default now()
);
create index on public.client_cycle_exercise_transitions(review_id);
```

**Solo `jsonb`** (snapshot, mai interrogato con filtri diretti): `client_cycle_reviews.metrics_snapshot` (array di `exercise_progress_metric` serializzato + risposte check-in copiate + parametri di progressione applicati per esercizio, es. `{"exercise_id": "...", "load_delta_pct": 0.08, "sets_delta": 0}`), `client_program_cycles.fitness_profile_snapshot` (già esistente, invariato).

### 11.3 Override Superadmin

Registrato in `superadmin_program_overrides` (già esistente) — `client_cycle_reviews.superadmin_override_id` punta lì quando una decisione è stata forzata (sezione 14), rendendo "quale valore automatico è stato sovrascritto" interrogabile con un JOIN, non nascosto in JSON.

---

## 12. Abbonamento

### 12.1 Rispetto del piano Client Pro lato server

Ogni transizione che porterebbe a `checkin_due`/`review_pending`/creazione ciclo N+1 verifica `_has_active_client_pro_entitlement` (riusata identica, nessuna duplicazione della logica RevenueCat — coerente con la Decisione già presa nel Blocco 1 di non duplicare `client-plan-access-service.ts`).

### 12.2 Scadenza durante il ciclo

Se l'abbonamento scade in qualunque momento (anche a metà ciclo, ben prima del check-in): sync on-demand (chiamata leggera, es. dentro `getMyActiveProgramCycle()` esteso, o una nuova RPC dedicata `sync_program_cycle_state()` — **[PROPOSTA]** unificare qui anche il calcolo `checkin_due`) porta il ciclo a `paused_subscription`. Nessuna review processata, nessun nuovo programma generato, i dati (check-in bozza, metriche già accumulate) restano intatti — solo lo stato del ciclo cambia, mai una cancellazione.

### 12.3 Soglie pausa [PROPOSTA DA APPROVARE]

`short_pause_days<=7`: nessuna azione speciale, il rientro riprende `active`/`checkin_due` esattamente da dove era (il clock `effective_active_days` semplicemente non è avanzato durante la pausa). `medium_pause_days<=21` (8-21 giorni): al rientro, un check-in "di rientro" è **richiesto** anche se non era ancora dovuto per date normali (**[PROPOSTA]**: forza `active -> checkin_due` immediatamente al ripristino, indipendentemente da `effective_active_days` accumulati). `>21 giorni` (pausa lunga): oltre al check-in di rientro obbligatorio, la decisione risultante è vincolata a non poter mai risultare `progress` per quel primo ciclo di rientro (forza minimo `maintain`, tipicamente `regress` con settimana di rientro, sezione 8.1) — implementato come un controllo esplicito in `run_cycle_review` prima di applicare la sezione 6, non come un'eccezione sparsa.

### 12.4 Non duplicare RevenueCat

Nessuna nuova tabella di webhook/eventi: si riusano `user_subscriptions`/`subscription_packages` così come sono. L'unica funzione nuova è di sola lettura (ricostruzione intervalli, sezione 2.1), mai una scrittura verso lo stato abbonamento.

---

## 13. Cliente che riceve un coach

### 13.1 Comportamento

Appena `client_has_no_active_coach(client_id)` diventa falso (un nuovo `coach_clients` con `status='active'` viene creato — evento già esistente, gestito da `_link_client_to_coach`, non toccato da questo blocco): un trigger **nuovo**, `after insert on coach_clients` (per il caso `status='active'` inserito direttamente, o `after update` per una riattivazione), chiama una funzione che:

1. Trova l'eventuale ciclo non-terminale del cliente (`status not in ('completed','replaced','cancelled')`).
2. Lo porta a `replaced` (mai cancellato: storico conservato, `client_program_cycle_plans`/`workout_plans` restano leggibili, provenienza `origin='auto_system'` invariata — soddisfa esplicitamente "conservare la provenienza delle vecchie schede").
3. Non genera alcuna notifica per il cliente/coach in questo punto specifico (il coach ha già i propri strumenti per vedere lo storico cliente; una notifica duplicata rispetto a quella già esistente per "nuovo cliente collegato" sarebbe rumore) — **[INTERPRETAZIONE — da confermare]**.

### 13.2 Review già in `review_pending`/`checkin_due` al momento dell'assegnazione coach

Stessa transizione a `replaced`, indipendentemente dallo stato specifico (vedi tabella transizioni, sezione 2.3: "QUALUNQUE stato non terminale -> replaced"). Un check-in già compilato ma non ancora elaborato resta nel suo record (`client_monthly_checkins`, mai cancellato), semplicemente non porta più ad alcuna azione: `run_cycle_review()` per quel ciclo ritornerebbe `NOT_DUE` (il ciclo non è più in uno stato compatibile) se richiamata per errore.

---

## 14. Superadmin

### 14.1 Nuove RPC proposte (tutte `security definer`, `if not is_superadmin() then raise 'FORBIDDEN'`, tutte loggano in `superadmin_program_overrides`)

```sql
-- Lettura aggregata (nessuna scrittura): check-in + review + motivazione, per un cliente
create or replace function public.superadmin_get_client_program_history(p_client_id uuid)
returns table (...) -- cicli, review, check-in, transizioni esercizio, in un'unica risposta

-- Risolve un ciclo pending_safety_review
create or replace function public.superadmin_resolve_safety_review(
  p_cycle_id uuid, p_action text, -- 'approve_continue' | 'approve_new_template' | 'cancel'
  p_template_id uuid default null, p_notes text default null
) returns uuid

-- Sostituisce un singolo esercizio in un piano attivo (senza rigenerare l'intero ciclo)
create or replace function public.superadmin_replace_single_exercise(
  p_workout_plan_id uuid, p_old_exercise_id text, p_new_exercise_id text, p_reason text
) returns void

-- Forza la decisione di una revisione già eleggibile (bypassa la sezione 6, non la sezione 3:
-- l'eleggibilità resta verificata, altrimenti si rischia di forzare una decisione priva di senso
-- su un ciclo con 0 sessioni)
create or replace function public.superadmin_force_cycle_decision(
  p_cycle_id uuid, p_decision text, p_notes text
) returns uuid

-- Annulla una review NON ANCORA applicata (finché il nuovo ciclo non è stato reso 'active'
-- in modo irreversibile — in pratica, entro la stessa transazione/subito dopo: da verificare
-- se serve davvero una finestra "annullabile" più ampia o se è sufficiente che il Superadmin
-- usi superadmin_force_cycle_decision per correggere in avanti — [INTERPRETAZIONE, sezione aperta])
create or replace function public.superadmin_cancel_pending_review(p_review_id uuid, p_notes text) returns void
```

### 14.2 Estensione `superadmin_program_overrides.action`

```sql
alter table public.superadmin_program_overrides drop constraint superadmin_program_overrides_action_check;
alter table public.superadmin_program_overrides add constraint superadmin_program_overrides_action_check
  check (action in (
    'manual_assign','force_progress','force_maintain','force_reduce','unblock_pain',
    'suspend_cycle','resume_cycle','disable_template',
    'resolve_safety_review','replace_single_exercise','force_cycle_decision','cancel_pending_review'
  ));
```

### 14.3 Ogni override registra (già garantito dalla struttura esistente della tabella + nuove colonne di sezione 11.2)

Autore (`superadmin_id`, sempre `auth.uid()`, mai un parametro), data (`created_at`), motivo (`notes`), entità modificata (`client_id`/`cycle_id`), valore automatico precedente e nuovo valore (`payload jsonb` — qui sì jsonb, perché la forma varia per tipo di azione ed è puro audit, mai interrogato con filtri strutturati).

### 14.4 Confronto vecchio/nuovo ciclo

`superadmin_get_client_program_history` fa il lavoro: JOIN tra `client_program_cycles` (via `previous_cycle_id`), `client_cycle_reviews`, `client_cycle_exercise_transitions` — nessuna vista materializzata necessaria a questo volume di dati.

---

## 15. Notifiche

### 15.1 Eventi (tutti scritti in `app_notifications`, riuso identico della tabella)

| Evento | `type` | Destinatario | Quando (anti-duplicazione) |
|---|---|---|---|
| Check-in disponibile | `monthly_checkin_available` | cliente | Alla transizione `active->checkin_due` (una sola volta: la sync on-demand verifica prima se esiste già una notifica non letta con lo stesso `type` e `data->>'cycle_id'` prima di inserirne un'altra) |
| Check-in mancante (promemoria) | `monthly_checkin_reminder` | cliente | **[PROPOSTA]** solo se `checkin_due` da più di N giorni [PROPOSTA 7] — richiede comunque un accesso app per essere valutato (nessun cron, coerente con la decisione già presa) |
| Programma mantenuto | `auto_program_maintained` | cliente | Alla chiusura `run_cycle_review` con `decision='maintain'` |
| Nuovo programma disponibile | `auto_program_progressed` | cliente | `decision in ('progress','partial_change')` |
| Progressione applicata | (sovrapposto al precedente — **[INTERPRETAZIONE]** unificato in un solo evento con `data->>'decision'` a distinguere, per non moltiplicare i `type` per una differenza già rappresentata nel payload) | — | — |
| Programma semplificato | `auto_program_regressed` | cliente | `decision='regress'` |
| Revisione sospesa per abbonamento | `auto_program_paused_subscription` | cliente | Transizione a `paused_subscription`/`pending_subscription` |
| Revisione richiesta al Superadmin | `auto_program_requires_review` | superadmin (tutti, stesso pattern Blocco 1: `select profiles.id from profiles where role='superadmin'`) | `decision in ('manual_review','blocked_safety')` |
| Override Superadmin completato | `auto_program_override_applied` | cliente | Ogni RPC di sezione 14 che modifica lo stato visibile al cliente |

### 15.2 Anti-duplicazione (regola generale)

Prima di ogni insert in `app_notifications` dentro le nuove RPC: `select 1 from app_notifications where recipient_id=... and type=... and data->>'cycle_id'=... and read_at is null limit 1` — se trovata, non se ne inserisce una seconda identica. Non impedisce eventi diversi sullo stesso ciclo (es. "check-in disponibile" e poi "programma mantenuto" sono entrambi legittimi), solo la ripetizione dello stesso evento non ancora letto.

---

## 16. Sicurezza

Tutte le nuove RPC seguono, senza eccezioni, i pattern già stabiliti nel Blocco 1:

- Ogni RPC cliente (`submit_monthly_checkin`, `run_cycle_review`) non accetta mai `client_id` come parametro: sempre `auth.uid()`.
- Ogni lettura di ciclo/review/check-in altrui è impedita dalle stesse RLS `_owner_read`/`_owner_all` già esistenti (nessuna nuova policy permissiva; le nuove tabelle — `client_cycle_exercise_transitions`, `auto_program_review_config`, `exercise_movement_metadata` — hanno RLS abilitata con **solo** policy superadmin, mai una policy cliente diretta: sono sempre lette/scritte tramite funzioni `SECURITY DEFINER`).
- Il client non può mai passare `decision` come parametro di una RPC cliente: `submit_monthly_checkin`/`run_cycle_review` non hanno alcun parametro `decision`; solo le RPC superadmin di sezione 14 lo accettano, e solo dopo `is_superadmin()`.
- Il client non può scegliere un template arbitrario: `run_cycle_review` sceglie sempre tramite la stessa cascata deterministica di `assign_initial_auto_program` (stage 1-4) o tramite `next_template_id`, mai un `template_id` passato dal chiamante.
- Il client non può alterare `metrics_snapshot`/`decision_reason`: scritti solo da `run_cycle_review` (SECURITY DEFINER), nessuna policy di UPDATE per il cliente su `client_cycle_reviews` (solo SELECT, come già oggi).
- Ogni nuova funzione `SECURITY DEFINER` dichiara `set search_path = public` esplicito (stesso identico pattern verificato su tutte le funzioni Blocco 1, incluso il fix di sicurezza del 2026-07-27 su `_has_active_client_pro_entitlement`).
- Grant minimi: `revoke all ... from public, anon` su ogni nuova funzione, `grant execute ... to authenticated` solo sulle RPC destinate al cliente; le RPC superadmin (sezione 14) restano `grant execute to authenticated` (perché la verifica `is_superadmin()` è interna, stesso pattern di `superadmin_assign_program_template`) — **mai** ristrette a un ruolo Postgres superadmin dedicato, che non esiste in questo progetto.
- Percorso con coach: **zero righe di questo blocco toccano mai** `workout_plans` con `coach_id is not null` — ogni nuova RPC verifica `client_has_no_active_coach()` o filtra per `origin='auto_system'`, stesso principio già verificato per il Blocco 1. Test di non regressione esplicito in sezione 18.

---

## 17. Gestione concorrenza

| Scenario | Meccanismo |
|---|---|
| Doppio tap su "Invia check-in" | `client_monthly_checkins` ha `unique cycle_id`: il secondo insert fallisce con conflitto, gestito con `on conflict (cycle_id) do update` solo se `locked_at is null` (altrimenti l'update stesso viene rifiutato dal trigger di sezione 4.5) |
| Due dispositivi dello stesso cliente, entrambi chiamano `run_cycle_review` quasi simultaneamente | `select ... for update` sul ciclo (sezione 10.3): il secondo attende il commit del primo, poi trova `already_reviewed` e ritorna lo stesso risultato senza rieseguire nulla |
| "Job automatico" e chiamata manuale contemporanei | Non esiste alcun job automatico (decisione già presa, nessun cron): questo scenario non si presenta per costruzione — ogni invocazione è "manuale" nel senso che parte da un accesso app, ma sempre attraverso la stessa RPC con lo stesso lock |
| Rinnovo RevenueCat durante la review | Il controllo entitlement (sezione 3.2 punto 3) è letto **dentro** la transazione di `run_cycle_review`, dopo il lock sul ciclo: un rinnovo che committa PRIMA del lock viene visto; uno che committa DOPO (durante l'esecuzione) non altera il risultato di questa chiamata (coerenza snapshot), ma la chiamata successiva lo vedrà — nessuna corsa pericolosa, al peggio un ciclo che va in `pending_subscription` un secondo prima che il webhook scriva il rinnovo, risolto al prossimo accesso |
| Assegnazione di un coach durante la review | Il trigger di sezione 13 e il lock di sezione 10 operano su tabelle diverse (`coach_clients` vs `client_program_cycles`): possibile, in teoria, che `run_cycle_review` sia a metà esecuzione quando il trigger imposta `replaced` — **mitigazione proposta**: `run_cycle_review` ricontrolla `client_has_no_active_coach()` subito prima dello `update ... set status='completed'` finale (passo 10) e abortisce con `COACH_ASSIGNED_MID_REVIEW` se nel frattempo è cambiato, facendo rollback dell'intera transazione (nessun ciclo N+1 orfano creato per un cliente che nel frattempo ha un coach) |
| Modifica del check-in mentre la review parte | Impedito dal lock `for update` sul ciclo (passo 1): la RPC di modifica check-in (`submit_monthly_checkin`, che fa solo un update se non `locked_at`) non blocca la stessa riga `client_program_cycles`, ma `run_cycle_review` legge il check-in DOPO aver acquisito il lock sul ciclo — un update del check-in concorrente vede comunque `locked_at` impostato una volta che `run_cycle_review` ha impostato quel campo (stesso commit), quindi una modifica tardiva viene rifiutata dal trigger di sezione 4.5, mai silenziosamente ignorata |
| Override Superadmin concorrente | Tutte le RPC superadmin di sezione 14 usano lo stesso `select ... for update` sul ciclo — stesso meccanismo, nessuna differenza di trattamento tra "concorrenza cliente" e "concorrenza superadmin" |
| Errore a metà transazione | Ogni RPC è **una singola funzione PL/pgSQL**: un'eccezione non gestita fa rollback automatico dell'intera transazione Postgres (stesso comportamento già implicito in tutte le RPC Blocco 1, mai stati parziali persistiti) |

---

## 18. Piano di test (matrice PASS/FAIL, da eseguire con la stessa metodologia già validata il 2026-07-27: ruolo `authenticated`/`anon` esplicito, mai `postgres`; account sintetici via Admin API reale, mai insert diretto in `auth.users`; harness Edge Function temporanea con secret casuale, rimossa a fine test)

| # | Scenario | Atteso |
|---|---|---|
| 1 | Ciclo revisionabile (tutte le condizioni sezione 3 soddisfatte) | `eligible`, decisione coerente con i dati, nuovo ciclo creato |
| 2 | Ciclo troppo breve (`effective_active_days < 28`) | `cycle_not_due`, nessuna scrittura |
| 3 | Sessioni insufficienti (`< 4` o `< 60%`) | `insufficient_sessions`, ciclo resta `review_pending`, review scritta con `insufficient_data` |
| 4 | Dati insufficienti (Livello B `< 50%` esercizi principali) | `insufficient_progress_data`, stesso trattamento del punto 3 |
| 5 | Check-in mancante | `checkin_required`, nessuna scrittura |
| 6 | Progressione | `decision='progress'`, carico/serie aumentati entro i limiti di sezione 7.2, mai su esercizi `had_pain` |
| 7 | Mantenimento | `decision='maintain'`, stesso template/parametri, nessun esercizio cambiato oltre la normale rotazione accessori |
| 8 | Regressione | `decision='regress'`, azioni di sezione 8.1 applicate, nessuna riduzione sotto i minimi (1 serie) |
| 9 | Sostituzione parziale | `decision='partial_change'`, `min_exercise_keep_ratio` rispettato, transizioni tracciate in `client_cycle_exercise_transitions` |
| 10 | Dolore segnalato nel check-in | `blocked_safety`/`pending_safety_review`, notifica superadmin, nessuna scheda generata finché non risolto |
| 11 | Esercizio escluso | Mai riproposto nel ciclo N+1, `substitution_group` correlato evitato se `reason='pain'` |
| 12 | Cambio attrezzatura (`equipment_no_longer_available`) | Sostituzioni filtrate per `equipment_tag` compatibile, mai un esercizio che richiede attrezzatura non più disponibile |
| 13 | Cambio obiettivo (`goal_changed_to`) | `decision='manual_review'` |
| 14 | Abbonamento scaduto durante il ciclo | `paused_subscription`, nessuna sessione completabile (già garantito da Blocco 1), nessuna review tentata |
| 15 | Rinnovo dopo pausa breve (`<=7gg`) | Rientra in `active`/`checkin_due` senza check-in di rientro forzato |
| 16 | Rinnovo dopo pausa lunga (`>21gg`) | Check-in di rientro forzato, decisione vincolata a non poter essere `progress` |
| 17 | Cliente che riceve un coach | Ciclo→`replaced` indipendentemente dallo stato precedente, storico conservato, nessuna nuova scheda automatica generata dopo |
| 18 | Tentativo cross-client (cliente A prova a richiamare `run_cycle_review`/`submit_monthly_checkin` passando riferimenti al ciclo di B) | RLS/controllo espliciti bloccano, nessun dato di B letto o scritto |
| 19 | Doppia chiamata (`run_cycle_review` due volte di seguito) | Stesso `review_id`/`next_cycle_id` alla seconda chiamata, nessun duplicato (verificato con conteggio SQL) |
| 20 | Errore transazionale (es. eccezione forzata a metà) | Rollback completo, nessuno stato parziale (ciclo resta nello stato pre-chiamata) |
| 21 | Override Superadmin (ognuna delle RPC di sezione 14) | Audit scritto in `superadmin_program_overrides` con autore/motivo/valore precedente-nuovo, notifica al cliente dove pertinente |
| 22 | Non regressione schede coach | Un cliente `coach_guided` non è mai toccato da alcuna nuova RPC (verificato tentando di chiamarle su un cliente con coach: tutte rifiutano con `FORBIDDEN`/`NOT_DUE`) |
| 23 | Conservazione delle vecchie schede | Dopo N cicli, tutte le `workout_plans` precedenti restano leggibili (RLS invariata) e immutabili (trigger invariati) |

---

## 19. Output di questo documento — indice delle sezioni richieste

Tutte le sezioni richieste sono coperte come segue: stato riutilizzabile/gap → sezione 1; modello dati proposto → sezioni 2.2 (CHECK), 4.1, 6.1, 9.1, 11.2, 14.2, 7.3; stati e transizioni → sezione 2; algoritmo di revisione → sezioni 3, 5, 6, 10; algoritmo di variazione esercizi → sezione 9; regole di progressione/regressione → sezioni 7, 8; gestione abbonamento → sezione 12; gestione sicurezza → sezione 16; idempotenza e concorrenza → sezioni 10.3, 17; flusso UI → sezione 21 (sotto); piano migrazioni → sezione 22 (sotto); piano RPC → sezioni 3.1, 4.5, 10.1, 14.1; piano servizi mobile → sezione 21; matrice test → sezione 18; rischi → sezione 20; ordine di implementazione → sezione 22.

---

## 20. Rischi

1. ~~Il sotto-blocco 2.0 (logging progressi self-guided) è un prerequisito reale~~ — **RISOLTO 2026-07-27**: implementato, testato (15/15 scenari PASS + difesa in profondità), chiuso. Vedi sezione 1.3. Resta valido il corollario: i cicli/sessioni self-guided precedenti a questa data non hanno dati di Livello B per costruzione, e non vanno mai interpretati come prestazioni negative (sezione 5.1).
2. **`app_notifications` senza consumer UI** (Blocco 3 non ancora iniziato): il Blocco 2 scriverà eventi reali che nessuno vedrà finché non esiste una schermata — rischio di percezione "il sistema non avvisa nessuno", da comunicare chiaramente prima di andare live, non da scoprire dopo.
3. **Calcolo `effective_active_days` da intervalli storici `user_subscriptions`** dipende da un comportamento del webhook RevenueCat (se `status` resta `'active'` oltre la naturale scadenza finché non arriva un nuovo evento) che non è mai stato verificato empiricamente in questo progetto per questo caso specifico — va validato con un abbonamento di test reale prima dell'implementazione, non assunto.
4. **Rename delle CHECK esistenti** (`client_program_cycles.status`, `client_cycle_reviews.decision`, `superadmin_program_overrides.action`) è una modifica breaking a livello di enum — **approvata dall'utente** (2026-07-27, decisione 2), sicura sui dati reali odierni (1 riga, verificato) ma va applicata in un'unica migration transazionale coordinata con `mobile/src/types/client-fitness-profile.ts` (`ProgramCycleStatus`), con la mappatura vecchio→nuovo valore documentata nella migration stessa (non ancora scritta: sotto-blocco 2.1, non iniziato).
5. ~~Ambiguità irrisolta sullo stato "nessun template compatibile"~~ — **RISOLTA 2026-07-27** (decisione 3): stato dedicato `pending_template`, mai una sovrapposizione con `pending_safety_review`. Sezione 2.2 aggiornata a 11 stati.
6. **Popolamento di `exercise_movement_metadata`** è un lavoro manuale non banale (anche se limitato ai 44 esercizi locali): un errore di categorizzazione (`movement_pattern`/`substitution_group` sbagliati) produrrebbe sostituzioni concettualmente scorrette (es. proporre uno squat come "alternativa" a una panca) — richiede revisione umana riga per riga prima dell'uso in produzione, non solo una verifica automatica di esistenza degli id.
7. **Soglie numeriche approvate come default ma non ancora validate su dati reali**: con un solo cliente reale attivo oggi, nessuna delle soglie approvate (decisione 1) è stata testata contro un comportamento reale su scala — vanno trattate come punto di partenza rivedibile dopo le prime revisioni reali, non come valori immutabili (per questo sono versionate, sezione 7.3: una futura revisione delle soglie non richiede una migration, solo una nuova `config_version`).

---

## 21. Flusso UI e piano servizi mobile (sintesi — nessuna schermata creata in questa fase)

- **Nuova schermata `check-in-periodico.tsx`** (mirror di `questionario-fitness.tsx`, multi-step, stessi pattern di validazione/tri-stato per le domande di sicurezza) — raggiunta da un banner in `AutoProgramCard` quando lo stato del ciclo è `checkin_due` (nuovo ramo nel componente esistente, stesso file, nessuna duplicazione).
- **`AutoProgramCard` esteso**: nuovi rami per `checkin_due` (CTA "Compila il check-in"), `review_pending` (stato "in elaborazione"), `pending_subscription`/`paused_subscription` (CTA verso `/abbonamento-cliente`), `pending_safety_review` (stesso messaggio già presente per `pending_review` nel Blocco 1, riusato).
- **Nuovi servizi mobile**: `client-monthly-checkin-service.ts` (mirror di `client-fitness-profile-service.ts`), estensione di `auto-program-service.ts` con `runCycleReview()`/`syncProgramCycleState()`.
- **Pannello Superadmin** (nuovo, non ancora iniziato nemmeno come scaffold): fuori dallo scope stretto del Blocco 2 per come descritto nel Blocco 1 originale (era previsto per il Blocco 3) — **[INTERPRETAZIONE — da confermare]**: la sezione 14 di questa richiesta implica però che almeno le RPC esistano già nel Blocco 2, anche se la UI arriva dopo (stesso pattern già usato per `superadmin_assign_program_template`, RPC-only nel Blocco 1). Si propone di mantenere questa separazione: RPC nel Blocco 2, schermata nel Blocco 3, salvo diversa indicazione.
- ~~**Logging progressi self-guided** (sotto-blocco 2.0)~~ — **fatto**: `createExerciseProgressEntries`/`deleteExerciseProgressEntry` in `exercise-progress-service.ts` hanno un ramo esplicito quando `resolveProgressActor` fallisce con `client_not_linked` e l'attore è il cliente stesso, che instrada verso le due nuove RPC (`log_self_guided_exercise_progress`/`delete_self_guided_exercise_progress`) invece di fallire. Nessuna nuova schermata: `ExerciseSetLogger`/`ClientLoadHistory` (già condivisi, già montati su `/esercizi/[id]`/`/storico-carichi`) funzionano ora anche per il self-guided senza alcuna modifica UI.

---

## 22. Piano migrazioni e ordine di implementazione (sotto-blocchi)

Elenco in ordine di dipendenza (nessuna di 2.1-2.7 è stata scritta o applicata):

- ~~**2.0 — Prerequisito**~~ — **FATTO e CHIUSO (2026-07-27)**: migration `20260803090000_enable_self_guided_exercise_progress_logging.sql` (2 nuove RPC `SECURITY DEFINER`, nessuna nuova policy RLS, nessuna estensione di CHECK), `exercise-progress-service.ts` esteso con il ramo self-guided. 15/15 scenari della matrice PASS + verifiche di difesa in profondità. Commit isolato dedicato. Vedi sezione 1.3 per il resoconto completo.
- **2.1 — Schema**: estensione CHECK (`client_program_cycles.status`, `client_cycle_reviews.decision`, `superadmin_program_overrides.action`), nuove colonne (`client_monthly_checkins`, `client_program_cycles`, `client_cycle_reviews`), nuove tabelle (`client_cycle_exercise_transitions`, `auto_program_review_config`, `exercise_movement_metadata`). Un'unica migration coordinata (stesso stile delle migration Blocco 1), verificata con `db push --dry-run` e conferma esplicita prima di `db push` reale, come da metodologia già stabilita.
- **2.2 — Popolamento dati**: seed `auto_program_review_config` (soglie sezione 7.3) + `exercise_movement_metadata` (44 esercizi locali, revisione manuale).
- **2.3 — RPC cliente**: `check_cycle_review_eligibility`, `submit_monthly_checkin`, `_compute_exercise_progress_metrics`, `run_cycle_review`.
- **2.4 — Trigger coach handoff**: `after insert/update on coach_clients` → `replaced` (sezione 13).
- **2.5 — RPC Superadmin**: tutte quelle di sezione 14.1.
- **2.6 — Mobile**: check-in periodico (UI+servizio), estensione `AutoProgramCard`, estensione `auto-program-service.ts`.
- **2.7 — Verifica end-to-end**: stessa metodologia RLS/REST reale già validata il 2026-07-27 (ruolo `authenticated`/`anon` esplicito, harness con account sintetici, cleanup finale), matrice di sezione 18 completa.

Solo dopo 2.7 con esito PASS, procedere a un'eventuale ulteriore conferma prima del Blocco 3 (pannello Superadmin UI, centro notifiche in-app).

---

## 23. Sotto-blocco 2.1 — schema implementato (2026-07-27, migration `20260804090000_block2_cycle_review_schema.sql`)

**Solo schema**: nessuna RPC/motore di revisione/variazione esercizi/UI/notifica visibile in questa migration, come richiesto. Verifiche read-only preliminari: 1 riga in `client_program_cycles` (cliente reale, `status='active'`), 0 in `client_cycle_reviews`/`client_monthly_checkins`/`superadmin_program_overrides`, 2 in `client_program_cycle_plans`, 16 in `client_excluded_exercises` — tutte compatibili con le modifiche additive, verificato dopo l'apply.

### 23.1 Differenze rispetto alla proposta iniziale (sezioni 1-22 di questo documento)

- **`auto_program_review_config` è una singola tabella versionata per riga**, non lo schema a due tabelle (`..._versions` + `...`) abbozzato in sezione 7.3: ogni riga porta già `config_version`/`is_active`/`valid_from`/`valid_until`/`changed_by`/`change_reason`, con un indice unico parziale su `(key) where is_active` a garantire una sola versione attiva. Più semplice, stesso risultato, un solo oggetto da gestire in futuro.
- **`client_cycle_reviews_cycle_id_key` (UNIQUE su `cycle_id`, Blocco 1) è stato sostituito da un indice univoco parziale** (`client_cycle_reviews_one_definitive_per_cycle_idx`, `where decision <> 'insufficient_data'`). Scoperta emersa solo analizzando lo schema esistente contro il nuovo requisito "impedire più review **definitive**": il vincolo originale avrebbe permesso una sola riga in assoluto per ciclo, incompatibile con la possibilità esplicitamente richiesta di più tentativi `insufficient_data` (audit trail dei retry) prima di una decisione definitiva. Verificato PASS con test reale: due tentativi `insufficient_data` sullo stesso ciclo coesistono; un secondo tentativo con decisione definitiva (`progress` dopo `maintain`) viene respinto con violazione di unicità.
- **Nessuna tabella ledger per le pause abbonamento** (sezione 22, punto 11): il documento non approva una tabella dedicata (propone la ricostruzione da `user_subscriptions` come meccanismo primario, con un contatore materializzato come alternativa futura non decisa) — creata quindi nessuna tabella, per rispettare la condizione "se il documento approva... creala ora". `client_program_cycles.effective_active_days` resta il campo pronto ad accogliere il risultato, qualunque meccanismo verrà scelto nel 2.3.
- **`superseded_at` è stato rinominato `replaced_at`** (non solo un'aggiunta) per coerenza col nuovo stato `replaced` — 0 righe reali valorizzavano quella colonna, verificato prima del rename.
- **`client_program_cycles_source_check` esteso con `auto_partial_change`**: non esplicitamente richiesto dal testo del compito, ma inferito per coerenza — le altre 3 decisioni che generano un nuovo ciclo (`progress`/`maintain`/`regress`) avevano già un source dedicato (`auto_progression`/`auto_maintain`/`auto_regression`); `partial_change` no.
- **Notes su `superadmin_program_overrides` reso `NOT NULL` + non vuoto** (0 righe reali, nessun impatto) per "motivo obbligatorio".

### 23.2 Mapping vecchi → nuovi stati/decisioni (applicato via UPDATE difensivi, 0 righe reali interessate)

`client_program_cycles.status`: `superseded`→`replaced`, `suspended`→`paused_subscription`, `pending_review`→`pending_safety_review` (se `decision_reason` contiene un segnale esplicito di dolore/supervisione) altrimenti `pending_template`. `client_cycle_reviews.decision`: `reduce`→`regress`, `superadmin_required`→`manual_review`, `block_pain`→`blocked_safety`.

### 23.3 Nuovi CHECK/indici/RLS (riepilogo — dettaglio completo nella migration)

- `client_program_cycles_status_check` (11 valori), `..._source_check` (+`auto_partial_change`), 4 nuovi CHECK di coerenza date (`review_due_after_start`, `checkin_before_review`, `resumed_after_suspended`, `effective_active_days >= 0`). Indice `client_program_cycles_one_current_per_client_idx` esteso da 3 a 8 stati non terminali.
- `client_monthly_checkins`: 9 nuovi CHECK (fatica/recupero/soddisfazione/giorni disponibili/luogo/attrezzatura/motivo skip/stato/durata), trigger di immutabilità post-lock (`prevent_client_monthly_checkin_edit_after_lock`, bypass solo Superadmin).
- `client_cycle_reviews`: `decision` esteso a 9 valori, nuovo indice univoco parziale (23.1), 6 nuovi CHECK (eleggibilità/aderenza/percentuale esercizi/sessioni/conteggi esercizi/origine/coerenza timestamp).
- `auto_program_review_config` (nuova): unique `(config_version, key)`, indice univoco parziale "una sola versione attiva per chiave", trigger di validazione valori (negativi ovunque, range 0-1 per le chiavi-percentuale), RLS superadmin-only, 14 righe seed (`config_version=1`, tutte `is_active=true`).
- `exercise_movement_metadata` (nuova): CHECK su ogni enum (schema di movimento/gruppo muscolare/attrezzatura/livello/ruolo/classe movimento), CHECK array su `compatible_locations`, RLS superadmin-only, 1 riga minima (`gambe-squat`) per verifica schema — nessun seed completo (2.2).
- `exercise_alternatives` (nuova): CHECK anti-self-reference, UNIQUE coppia sorgente/alternativa, trigger che impedisce riferimenti a esercizi non registrati in `exercise_movement_metadata`, RLS superadmin-only.
- `client_cycle_exercise_transitions` (nuova): UNIQUE anti-duplicati, trigger anti cross-client (review/cicli precedente-successivo devono appartenere allo stesso `client_id` dichiarato), RLS superadmin-only + lettura proprietario.
- `superadmin_program_overrides`: `action` esteso a 13 valori, 8 nuove colonne (entità/valori prima-dopo/review collegata/stato applicazione/annullamento), trigger anti cross-client (stessa logica di `client_cycle_exercise_transitions`), `notes` reso obbligatorio.

### 23.4 Nota di compatibilità per il sotto-blocco 2.3 (non un bug, non risolto qui)

`assign_initial_auto_program()` (Blocco 1) ha un controllo hardcoded `status in ('draft', 'active', 'pending_review')` per il proprio fast-path di idempotenza. Con l'estensione a 11 stati, questo elenco non copre più i nuovi stati non terminali (`checkin_due`/`review_pending`/`pending_subscription`/`paused_subscription`/`pending_safety_review`/`pending_template`) — se un cliente si trovasse in uno di questi stati (possibile solo dopo che il motore di revisione, 2.3, esisterà davvero) e richiamasse di nuovo questa RPC, il fast-path non riconoscerebbe il ciclo esistente e tenterebbe un secondo INSERT. **Non è un bug oggi** (nessun codice produce ancora questi stati) **e non ha richiesto una modifica in questo sotto-blocco** (è una RPC, non schema — fuori perimetro esplicito del 2.1): l'indice univoco parziale aggiornato (23.3) impedirebbe comunque un secondo ciclo reale, ma con un errore di violazione di unicità grezzo invece di un ritorno pulito del ciclo esistente. Da correggere insieme al motore di revisione nel sotto-blocco 2.3.

### 23.5 Test eseguiti (tutti PASS, rollback espliciti — nessuna scrittura persistita oltre alla migration stessa)

Colonne/CHECK/FK/indici/default verificati via `information_schema`/`pg_constraint`/`pg_indexes`; RLS abilitata su tutte le nuove tabelle (`pg_class.relrowsecurity`); seed config 14/14 righe, 1 sola versione attiva; riga reale (`status='active'`, `source='auto_initial'`) compatibile, tutte le nuove colonne nullable/default corrette. Comportamentali: valore soglia fuori range `[0,1]` respinto; due review "definitive" sullo stesso ciclo respinte, due tentativi `insufficient_data` sullo stesso ciclo permessi; alternativa esercizio verso se stesso respinta; riferimento a esercizio non registrato respinto; modifica di un check-in dopo il lock respinta; transizione esercizio con `client_id` di un cliente diverso da quello reale del ciclo/review respinta. Ruoli: `authenticated` generico → 0 righe su tabelle amministrative; `anon` → 0 righe ovunque; cliente proprietario reale → vede ancora il proprio ciclo (invariato); Superadmin reale → accesso completo alle nuove tabelle.
