# Integrazione catalogo esercizi YMove — Edge Function `ymove-exercises`

Feature (2026-07-12): il coach cerca nel catalogo esercizi YMove durante la creazione di una scheda ("Libreria YMove") e preme "Aggiungi a FitCoach" per creare/riusare un esercizio FitCoach a partire dai metadati YMove — **opzione B**: si crea un esercizio FitCoach reale, mai un semplice link esterno al catalogo YMove.

## Architettura

```
mobile (coach/superadmin loggato)
  -> supabase.functions.invoke('ymove-exercises', { body: { action: 'search', filters } })
  -> supabase.functions.invoke('ymove-exercises', { body: { action: 'detail', id } })
     (Authorization: Bearer <JWT>, allegato automaticamente da supabase-js)
  -> Edge Function (Deno, YMOVE_API_KEY SOLO qui, mai nel bundle mobile)
     1. verifica il JWT del chiamante (supabaseAdmin.auth.getUser)
     2. legge il ruolo da public.profiles
     3. 'search': solo coach/superadmin, sempre GET /exercises?includeVideos=false
        (mai il video in lista, per non consumare il limite mensile)
     4. 'detail': coach/superadmin senza restrizioni (serve anche PRIMA di
        importare, per l'anteprima); un cliente deve avere un coach reale
        collegato (coach_clients, status active/invited) E che l'id YMove
        richiesto sia raggiungibile da QUEL coach in almeno uno dei due modi
        (2026-07-13, corretto): (a) esercizio importato in FitCoach
        (public.exercises, source='ymove' — condiviso globalmente), oppure
        (b) collegato come video di un esercizio locale/custom del PROPRIO
        coach (exercise_videos.ymove_exercise_id) — vedi limite
        architetturale sotto
     5. proxy verso https://exercise-api.ymove.app/api/v2, header X-API-Key
  -> risponde { ok: true, data } o { ok: false, code, message } — MAI un URL
     video/thumbnail viene salvato da nessuna parte, ne' qui ne' nel database
```

L'import vero e proprio (scrittura in `public.exercises`) **non passa dalla Edge Function**: il coach lo fa direttamente dal client mobile (`mobile/src/lib/fitcoach-exercises-service.ts`, `createOrReuseExerciseFromYmove`), protetto dalla RLS `exercises_coach_insert` — riusa i metadati gia' ottenuti dalla chiamata `detail` sopra, nessuna seconda chiamata a YMove necessaria.

## Limite architetturale onesto (da conoscere prima di usarla in produzione)

Il requisito "il cliente puo' richiamare il dettaglio YMove solo se l'esercizio e' realmente presente in una sua scheda" **non e' verificabile al 100% lato server oggi**: le schede (`WorkoutPlan`/`WorkoutExercise`) vivono solo lato app (AsyncStorage/Zustand, `mobile/src/store/training-store.ts`), non sono mai state migrate su Supabase (vedi `docs/TODO_NEXT.md`, voce "Migrare il resto dell'app a Supabase"). La Edge Function applica quindi il controllo piu' forte possibile con i dati REALMENTE disponibili lato server: il cliente deve essere autenticato, avere un coach collegato (`coach_clients`), e l'id YMove richiesto deve essere raggiungibile da quel coach (importato in FitCoach da un coach qualsiasi, oppure collegato dal PROPRIO coach — vedi sotto) — non un id YMove arbitrario mai importato/collegato da nessuno. Questo impedisce a un cliente di esplorare il catalogo YMove completo, ma NON garantisce che quello specifico esercizio sia davvero nella SUA scheda (potrebbe vedere il video di un esercizio importato da un altro coach, se ne conoscesse l'id, o di un esercizio collegato dal proprio coach ma assegnato solo ad altri clienti dello stesso coach). Per una garanzia completa servirebbe migrare le schede su Supabase — fuori scope di questo intervento.

**Correzione 2026-07-13** (bug segnalato dall'utente): il controllo per un cliente verificava SOLO il caso "importato in FitCoach" (`public.exercises`, `source='ymove'`). Un esercizio locale storico o custom con un video YMove ASSOCIATO tramite `exercise_videos` (mai importato come riga `exercises` — un caso reale e frequente, vedi la sezione "Associazione video YMove su un esercizio esistente" sopra) faceva quindi rispondere `forbidden` al cliente anche quando il video era regolarmente visibile al coach che lo aveva collegato: nella scheda del cliente restava il placeholder con la lettera al posto della thumbnail/video. La Edge Function ora autorizza il cliente anche nel secondo caso, ma SOLO se il collegamento in `exercise_videos` appartiene al coach a cui il cliente e' davvero collegato (`coach_clients.coach_id`) — mai a un coach diverso, anche se per assurdo ne conoscesse l'id YMove.

## SQL da eseguire

Sezione "Libreria esercizi FitCoach + integrazione catalogo YMove" in `docs/SUPABASE_SCHEMA.sql` (vicino alla fine del file): crea `public.exercises` (con vincolo univoco su `ymove_exercise_id` quando non nullo) e le relative policy RLS. Idempotente (`create table if not exists`, `drop policy if exists` prima di ogni `create policy`).

Esegui (o ri-esegui) l'intero `docs/SUPABASE_SCHEMA.sql` nel SQL editor del progetto Supabase, oppure isola ed esegui solo quella sezione se il resto e' gia' aggiornato.

## Deploy della Edge Function

Codice: `supabase/functions/ymove-exercises/index.ts`.

Richiede il [Supabase CLI](https://supabase.com/docs/guides/cli) installato localmente (non presente in questo ambiente di sviluppo):

```bash
supabase login
supabase link --project-ref <il-tuo-project-ref>
supabase functions deploy ymove-exercises
```

### Variabili d'ambiente richieste

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **automatiche**, iniettate dal runtime delle Edge Function. Non vanno impostate a mano.
- `YMOVE_API_KEY` — **obbligatoria**, chiave API YMove v2. Senza questa variabile la function risponde sempre `ymove_not_configured`.

```bash
supabase secrets set YMOVE_API_KEY=<la-tua-chiave-ymove>
```

### Traduzione italiana (opzionale, 2026-07-13)

- `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION` — **opzionali ma legate**: se manca anche solo una delle due, l'azione `translate` risponde `ok:false code:'translation_not_configured'` (status 200, non un errore): `createOrReuseExerciseFromYmove` (`mobile/src/lib/fitcoach-exercises-service.ts`) ricade sui testi originali YMove, **mai una traduzione finta**. La risorsa Azure Translator e' **regionale** (es. `italynorth`): senza `AZURE_TRANSLATOR_REGION`, Azure risponde 401 anche con la chiave corretta. `AZURE_TRANSLATOR_ENDPOINT` e' opzionale, default `https://api.cognitive.microsofttranslator.com` (endpoint globale documentato da Microsoft).
- La traduzione avviene **una sola volta**, al momento dell'import (quando si crea una NUOVA riga `public.exercises` — se l'esercizio esiste gia', si riusa senza ritradurre). I testi originali restano SEMPRE conservati separatamente in `ymove_original_title`/`ymove_original_description`/`ymove_original_instructions`, mai piu' toccati dopo l'import. Il risultato della traduzione diventa il testo **globale** (`exercises.name`/`description`/`technical_notes`), condiviso da tutti i coach — modificabile SOLO dal superadmin (vedi sotto, corretto il 2026-07-13).

### Personalizzazione per-coach del testo (2026-07-13, continuazione — corregge una scelta precedente sbagliata)

Il testo GLOBALE di un esercizio `source='ymove'` (risultato della traduzione all'import) e' condiviso da tutti i coach ed e' modificabile **SOLO dal superadmin**. Una versione precedente di questa integrazione permetteva a QUALUNQUE coach di modificarlo ("wiki-style") — segnalato dall'utente come un errore di design (un coach vedeva il proprio testo cambiare a sua insaputa se un collega lo modificava) e corretto: la policy `exercises_coach_update_ymove_text` e' stata rimossa.

Il coach puo' comunque correggere il testo che VEDE LUI dalla schermata esercizio ("Testi italiani" → "Modifica"), ma questo crea/aggiorna sempre una riga nella nuova tabella `public.exercise_text_overrides` (`coach_id`, `exercise_id`, `name`/`description`/`technical_notes`, `unique(coach_id, exercise_id)`) — **mai** il testo globale. In lettura, l'app usa sempre prima l'override del coach (o quello del proprio coach, per un cliente — RLS-scoped, mai quello di un coach diverso), altrimenti ricade sul testo globale.

Per un esercizio `source='custom'` (di proprieta' di un coach specifico) il comportamento resta invariato: modifica diretta della riga, nessun override necessario (nessun altro coach la vede comunque).

```bash
supabase secrets set AZURE_TRANSLATOR_KEY=<la-tua-chiave-azure>       # opzionale
supabase secrets set AZURE_TRANSLATOR_REGION=italynorth               # richiesta insieme alla chiave
supabase secrets set AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com  # opzionale, e' il default
```

### Debug (opzionale, solo per diagnosticare un 500)

- `YMOVE_DEBUG` (opzionale, default assente = `false`): se impostata a `true`, il body JSON di risposta include il messaggio reale dell'errore interno invece del generico "Errore interno della funzione" — MAI token/API key/header Authorization, solo `message`/`stack` dell'eccezione. Da disattivare (rimuovere il secret o impostarlo a qualsiasi valore diverso da `true`) prima di andare in produzione con clienti reali.
- La funzione logga sempre (indipendentemente da `YMOVE_DEBUG`) `YMOVE_ENV_CHECK` (solo `configured: true/false` e `length` del secret, mai il valore) e, in caso di eccezione non gestita, `YMOVE_FUNCTION_ERROR` (`message`/`stack`) — visibili in Dashboard Supabase → Edge Functions → `ymove-exercises` → Logs.

```bash
supabase secrets set YMOVE_DEBUG=true   # solo per diagnosticare, poi rimuovere
supabase functions deploy ymove-exercises
```

## Struttura risposta YMove v2 (confermata, 2026-07-13)

- `GET /exercises` → `{ data: Exercise[], pagination: {...}, _warning?: {...} }` — la lista e' SEMPRE dentro `data`, mai nella root ne' in `items`/`exercises`/`results`.
- `GET /exercises/:id` → `{ data: Exercise, _warning?: {...} }` — l'esercizio e' SEMPRE dentro `data`, mai nella root ne' in `exercise`/`result`.
- Campi ufficiali dell'esercizio: `id`, `title` (non `name`), `slug`, `description`, `instructions`, `importantPoints` (array), `muscleGroup` (stringa singola), `secondaryMuscles` (array), `equipment`, `category`, `difficulty`, `exerciseType` (**array**, non stringa singola), `videoUrl`, `videoHlsUrl`, `thumbnailUrl`, `videoDurationSecs`, `hasVideo`, `videos`.
- Un esercizio e' considerato valido se ha ALMENO `id` e `title`: tutti gli altri campi (incluso video/thumbnail) sono opzionali e la loro assenza non genera mai un errore — solo un fallback onesto lato UI ("nessun video disponibile").
- `exercise_type` in `public.exercises` resta una singola colonna `text`: l'array `exerciseType` di YMove viene unito con virgola in fase di import (`createOrReuseExerciseFromYmove`), nessuna modifica allo schema per un campo puramente informativo.
- Se YMove risponde con uno status non-2xx, la Edge Function restituisce SEMPRE lo status e il messaggio realmente ricevuti da YMove (mai un messaggio inventato), con un fallback generico solo se YMove non ha restituito alcun testo leggibile.
- Log sicuri (mai token/API key/header Authorization): `YMOVE_ENV_CHECK` (configurazione secret), `YMOVE_API_CALL` (status HTTP + sole chiavi top-level della risposta), `YMOVE_FUNCTION_ERROR` (message/stack di un'eccezione non gestita).

## Associazione video YMove su un esercizio esistente (2026-07-13)

Nella schermata di un esercizio (locale storico o FitCoach custom — NON per un esercizio gia' `source='ymove'`, che ha gia' il proprio video permanente), il coach vede una sezione "Video YMove" con:

- **Associa video YMove** (se non ancora collegato) → apre lo stesso `YMoveExercisePicker` gia' usato per l'import, ma in modalita' `link-video`: cercare/aprire l'anteprima funziona identico, ma il bottone e' "Usa questo video" invece di "Aggiungi a FitCoach" e NON crea alcuna riga in `public.exercises` — salva solo `ymove_exercise_id`/`ymove_slug` su `exercise_videos` (tabella gia' esistente, riusata: una riga rappresenta un file caricato O un collegamento YMove, mai entrambi).
- **Sostituisci video** (se gia' collegato) → riapre lo stesso picker per scegliere un video diverso.
- **Rimuovi collegamento YMove** → azzera `ymove_exercise_id`/`ymove_slug`, l'esercizio torna a mostrare (o richiedere) un video caricato manualmente.

Nome italiano, serie, ripetizioni, recupero, carico e note gia' presenti **non vengono mai toccati** da questa operazione: si tocca solo il video.

### Duplicati

Prima di salvare, si controlla (`findExerciseVideoLinkByYmoveId`) se quel coach ha gia' collegato lo STESSO esercizio YMove a un esercizio diverso: se si', si mostra "Questo video e' gia' associato a '<nome>'" con un link per aprire quell'esercizio, invece di sovrascrivere silenziosamente. Il vincolo univoco `exercise_videos_coach_ymove_unique` (`coach_id, ymove_exercise_id`) e' la garanzia reale a livello DB — il controllo app-side sopra e' solo per una UX onesta prima di arrivare li'. Coach diversi possono collegare lo stesso esercizio YMove ciascuno al proprio, senza conflitti (l'unicita' e' per-coach, non globale).

## Associazione automatica dei video YMove (2026-07-13, continuazione)

Sostituisce la ricerca/scelta manuale come flusso principale: il coach non deve piu' aprire "Libreria YMove" per ognuno dei 44 esercizi storici (`data/exercise-library.ts`) o dei propri esercizi `custom` — l'app cerca e collega da sola quando il punteggio di compatibilita' e' sufficientemente alto. "Associa video YMove" (schermata esercizio) resta disponibile come **fallback manuale** per gli esercizi rimasti "non associati"/"ambigui".

```
mobile (coach autenticato entra nell'app, mobile/src/components/auth-gate.tsx)
  -> autoLinkYmoveVideosForCoach() (mobile/src/lib/ymove-auto-link-service.ts)
     1. legge i 44 esercizi locali (EXERCISE_LIBRARY) + gli esercizi 'custom' del coach
        (listCustomExercisesForCoach) — esclude sempre gli esercizi 'ymove'
        (gia' collegati via exercise.ymoveExerciseId, mai rielaborati)
     2. legge TUTTE le righe exercise_videos del coach in una query sola
        (listExerciseVideosForCoach) e scarta chi ha gia' un video o un
        collegamento YMove
     3. per ogni esercizio rimasto: sceglie il termine di ricerca inglese
        (dizionario di sinonimi, altrimenti Azure Translator IT->EN in batch,
        altrimenti il nome originale) -> cerca su YMove (searchYmoveExercises)
        -> filtra solo hasVideo===true -> calcola un punteggio pesato
        (nome 60% / muscolo 20% / attrezzatura 15% / tipologia 5%)
     4. collega SOLO se punteggio migliore >= 0.85 E distacco dal secondo
        risultato >= 0.10 (mai una scelta casuale sotto soglia)
     5. controlla i duplicati (stesso video gia' collegato a un ALTRO
        esercizio dello stesso coach) prima di salvare
     6. salva in exercise_videos (stessa funzione linkExerciseVideoToYmove
        gia' usata dal flusso manuale — nessuna scrittura diretta separata)
  -> stato live in un piccolo store (store/ymove-autolink-store.ts), mostrato
     da un banner non bloccante nella dashboard coach
     (components/ymove-autolink-banner.tsx, app/index.tsx)
```

### Algoritmo di matching (`mobile/src/lib/ymove-name-matching.ts`)

- **Nome (60%)**: similarita' calcolata su distanza di Levenshtein normalizzata tra il nome GIA' TRADOTTO in inglese (sinonimo o Azure Translator) e il titolo del candidato YMove — mai tra il nome italiano originale e il titolo inglese (verificato: la distanza tra parole di lingue diverse e' quasi sempre bassa per puro caso ortografico, non misura la somiglianza semantica).
- **Gruppo muscolare (20%)**: 1 se il campo `muscleGroup` del candidato contiene una parola chiave inglese associata al gruppo muscolare italiano dell'esercizio locale (dizionario `MUSCLE_KEYWORDS_EN`), altrimenti 0.
- **Attrezzatura (15%)**: 1 se il campo `equipment` del candidato contiene una parola chiave inglese associata a una parola italiana trovata nell'attrezzatura locale (dizionario `EQUIPMENT_KEYWORDS_EN`), altrimenti 0.
- **Tipologia (5%)**: euristica debole (nessun campo "tipologia" dedicato nei dati locali) — coerenza cardio/non-cardio tra il gruppo muscolare locale e `exerciseType` del candidato.
- **Difficolta'**: usata SOLO come filtro di ricerca (il valore locale e' gia' in inglese: `beginner`/`intermediate`/`advanced`), MAI come componente del punteggio (i pesi forniti sommano a 100% senza di essa).
- **Soglie**: punteggio minimo `>= 0.85` E distacco dal secondo candidato `>= 0.10` (se esiste un solo candidato, il secondo punteggio vale 0, quindi il distacco e' automaticamente soddisfatto). Sotto soglia: l'esercizio resta "non associato"/"ambiguo", MAI un collegamento a caso.
- **Dizionario di sinonimi** (`EXERCISE_NAME_SYNONYMS`): copre tutti i 44 esercizi storici attuali (lat machine avanti→lat pulldown, panca piana→bench press, ecc. — elenco esteso oltre gli esempi forniti dall'utente per coprire l'intera libreria). Migliora la ricerca (termine piu' preciso, nessuna chiamata di traduzione) ma NON sostituisce mai il controllo del punteggio: un sinonimo impreciso viene comunque scartato se il punteggio risultante e' sotto soglia.

### Trigger automatici e cooldown (`mobile/src/lib/ymove-auto-link-service.ts`)

- **Al primo accesso del coach dopo l'aggiornamento**: `auth-gate.tsx` avvia `autoLinkYmoveVideosForCoach()` quando il ruolo diventa `'coach'` (una volta per sessione app, non ad ogni render/cambio rotta — dipendenza solo su `currentRole`).
- **Dedup in sessione**: una seconda chiamata mentre la prima e' in corso ritorna la STESSA promise (mai due scansioni parallele); dopo il completamento, ritorna il risultato gia' calcolato senza rifare alcuna richiesta di rete.
- **Cooldown di 7 giorni tra un riavvio e l'altro**: la data dell'ultima scansione completa e' salvata in AsyncStorage (`fitcoach-ymove-autolink-last-run:<coachId>`); una nuova sessione app esegue una scansione reale solo se non e' mai stata fatta o sono passati almeno 7 giorni — questo e' anche il meccanismo con cui gli esercizi "non associati"/"ambigui" vengono ritentati (non hanno una riga in `exercise_videos`, quindi rientrano sempre tra i candidati di una scansione reale).
- **Nuovo esercizio custom** (2026-07-13: hook pronto ma senza ancora un punto di chiamata reale — vedi "Limiti noti" sotto): `autoLinkYmoveVideoForExercise(exercise)` elabora UN esercizio appena creato, bypassando il cooldown di 7 giorni (mai tentato prima) ma con dedup in-flight per lo stesso id.
- Gli esercizi gia' presenti in una scheda sono sempre uno dei due insiemi elaborati (44 storici o custom del coach — una scheda referenzia solo questi id), quindi non serve alcuna query separata sulle schede.

### Estensione azione `translate` (Edge Function)

`supabase/functions/ymove-exercises/index.ts`, azione `'translate'`, riconosce ora due formati in `body.texts` (entrambi solo coach/superadmin):
- **Legacy** (invariato): oggetto `{ title, description, instructions }`, sempre EN->IT, usato da `createOrReuseExerciseFromYmove` all'import di un esercizio YMove.
- **Nuovo**: array di stringhe `{ texts: string[], from?: string, to: string }`, traduzione generica in qualunque direzione — usato da `ymove-auto-link-service.ts` per tradurre IT->EN i nomi degli esercizi locali/custom senza un sinonimo nel dizionario, **in un'unica chiamata batch** per tutta la scansione (non una per esercizio). Risposta `{ texts: string[] }` nello stesso ordine/lunghezza dell'array in ingresso. `AZURE_TRANSLATOR_KEY` non e' mai esposta al client mobile: vive solo nell'ambiente della Edge Function, invariato.

### Log sicuri (mai chiavi/URL)

`YMOVE_AUTOLINK_START`, `YMOVE_AUTOLINK_CANDIDATES` (conteggio risultati di ricerca), `YMOVE_AUTOLINK_MATCH` (id esercizio + punteggio), `YMOVE_AUTOLINK_SKIPPED` (id esercizio + motivo: `not_found`/`ambiguous`/`duplicate`/`search_failed`/`exception`), `YMOVE_AUTOLINK_DB_RESULT` (id esercizio + esito salvataggio), `YMOVE_AUTOLINK_COMPLETE` (riepilogo finale).

### SQL necessario

**Nessuno**: la funzionalita' riusa `public.exercise_videos` (gia' esistente, stesse colonne) tramite la funzione `linkExerciseVideoToYmove` gia' costruita per il flusso manuale — nessuna nuova tabella/colonna/policy.

## Come testare

1. Esegui `docs/SUPABASE_SCHEMA.sql` sul progetto Supabase reale (include sia la sezione "Libreria esercizi FitCoach" sia "Traduzione italiana... + associazione video").
2. Deploya la Edge Function e imposta `YMOVE_API_KEY` (obbligatoria) e, se disponibile, `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION` (opzionali, ma vanno impostate insieme).
3. Login come coach reale → apri/crea una scheda → "Libreria YMove" → cerca per nome/muscolo/attrezzatura/tipologia/difficolta' → verifica che compaiano nome/muscolo/attrezzatura/difficolta' per ogni risultato, **nessun video caricato in questa fase**.
4. Premi "Anteprima" su un risultato → verifica che compaia il video (o la miniatura se il video manca) e le istruzioni.
5. Premi "Aggiungi a FitCoach" → verifica che l'esercizio compaia subito nella scheda in costruzione, con serie/ripetizioni/durata/recupero/carico/note modificabili normalmente come ogni altro esercizio.
6. Apri quell'esercizio → "Testi italiani" → verifica che nome/descrizione/note siano in italiano (se `AZURE_TRANSLATOR_KEY`/`AZURE_TRANSLATOR_REGION` configurate) o uguali all'originale (se non configurate, MAI una traduzione a caso) → premi "Modifica", cambia un testo, "Salva" → verifica che resti salvato riaprendo l'esercizio.
6b. Con un SECONDO coach reale, apri lo STESSO esercizio (stesso `ymove_exercise_id`, riusato) → verifica che veda il testo ORIGINALE/globale (o la propria personalizzazione se ne ha una), MAI la personalizzazione del primo coach. Verifica in Table editor che esista una riga in `exercise_text_overrides` per il primo coach e che `public.exercises` (testo globale) NON sia stata modificata.
7. Ripeti l'import dello STESSO esercizio (stesso o altro coach) → verifica in Table editor (`public.exercises`) che non venga creata una seconda riga (stesso `ymove_exercise_id`, riusato) e che NON avvenga una seconda traduzione (nessuna nuova chiamata Azure Translator nei log).
8. Apri un esercizio LOCALE storico (uno dei 44) o un esercizio `custom` → "Associa video YMove" → cerca/scegli un video → "Usa questo video" → verifica che il video compaia subito, live.
9. Ripeti l'associazione dello stesso esercizio YMove su un ALTRO esercizio della stessa libreria coach → verifica che compaia "gia' associato a..." invece di un duplicato silenzioso.
10. "Sostituisci video" → scegline un altro → verifica che il video precedente sparisca e compaia il nuovo. "Rimuovi collegamento YMove" → verifica che torni allo stato "nessun video"/upload manuale.
11. Salva la scheda, assegnala a un cliente → login come quel cliente → apri l'esercizio → verifica che il video sia visibile.
12. Prova a rompere volutamente il player (es. connessione instabile) → verifica che compaia un messaggio d'errore chiaro con bottone "Riprova", non un player vuoto o bloccato.
13. Se possibile, testa il caso limite YMove (429) e un id non autorizzato per un cliente non collegato: verifica che i messaggi mostrati siano quelli onesti previsti, mai un crash o un player silenzioso.
14. Verifica in `public.exercises`/`exercise_videos` che NESSUNA colonna contenga un URL video/thumbnail salvato in modo permanente (solo `ymove_exercise_id`/`ymove_slug` o, per un file caricato, `video_path`/`video_url` del proprio Storage — mai un URL YMove).
15. **(2026-07-13, correzione autorizzazione cliente)** Su un esercizio LOCALE storico (uno dei 44) o `custom` MAI importato come riga `exercises`, associa un video con "Associa video YMove" → assegna quell'esercizio a un cliente reale del PROPRIO coach → login come quel cliente → apri l'esercizio → verifica che il video/la thumbnail siano visibili (prima rispondeva `forbidden`, placeholder con la lettera). Poi verifica il caso negativo: login come cliente di un ALTRO coach (o senza coach collegato) → prova ad aprire lo stesso esercizio (se raggiungibile) → verifica che resti `forbidden`.
16. **(2026-07-13, continuazione — associazione automatica)** Login come coach reale con `AZURE_TRANSLATOR_KEY`/`REGION` e `YMOVE_API_KEY` configurate → verifica che nella dashboard compaia il banner "Associazione automatica video: N/44" e che avanzi progressivamente, poi il riepilogo finale "Video associati: X · Non trovati: Y · Ambigui: Z" (scompare da solo dopo qualche secondo o con la ✕). Verifica in Table editor (`exercise_videos`) che le righe collegate abbiano `coach_id` reale, `ymove_exercise_id`/`ymove_slug` valorizzati, `video_path`/`video_url` NULL.
17. Apri uno degli esercizi collegati automaticamente → verifica che la card in scheda mostri gia' la thumbnail (non la lettera) e che il video parta nel Dettaglio esercizio.
18. Chiudi e riapri l'app (stessa sessione o nuova) subito dopo → verifica che il banner NON ricompaia (cooldown/dedup: nessuna nuova scansione entro 7 giorni).
19. Crea manualmente in Table editor una seconda riga `exercise_videos` con lo stesso `ymove_exercise_id` gia' collegato ma un `exercise_id` diverso dello stesso coach (simula un duplicato), poi forza una nuova scansione (es. cambia manualmente la data in `AsyncStorage`/reinstalla l'app) → verifica che quell'esercizio risulti "duplicato" nei log (`YMOVE_AUTOLINK_SKIPPED`, `reason:'duplicate'`) e non sovrascriva la riga esistente.
20. Prova con un secondo coach (dati diversi) → verifica che ogni coach ottenga i propri collegamenti indipendenti (stesso video YMove puo' essere collegato a esercizi diversi da coach diversi, mai in conflitto).

## Sicurezza — cosa e' garantito

- `YMOVE_API_KEY`/`AZURE_TRANSLATOR_KEY` non sono mai nel codice mobile ne' in `EXPO_PUBLIC_*`: vivono solo nell'ambiente della Edge Function.
- Nessun URL video/thumbnail/HLS viene mai scritto in `public.exercises`/`exercise_videos`: sono link firmati che scadono, richiesti live a ogni apertura del video e ri-richiesti se il player segnala un errore.
- Ricerca (`search`) e traduzione (`translate`) riservate a coach/superadmin autenticati.
- Dettaglio (`detail`) per un cliente richiede un coach collegato reale E che l'id YMove sia raggiungibile da quel coach (importato in FitCoach, oppure collegato in `exercise_videos` dal PROPRIO coach — mai da un coach diverso) — vedi limite architetturale onesto sopra per cosa questo NON garantisce ancora.
- La modifica del testo GLOBALE di un esercizio `ymove` condiviso e' permessa SOLO al superadmin. Ogni coach personalizza il proprio testo in `exercise_text_overrides` (RLS: solo la propria riga), mai il globale — vedi `docs/DECISIONS.md` per la correzione della scelta "wiki-style" precedente.

## Limiti noti / cosa NON e' stato fatto

- Nessuna UI di creazione "custom" da zero (esercizio FitCoach scritto interamente a mano dal coach, senza partire da YMove): lo schema/RLS la prevedono gia' (`source='custom'`), ma non e' stata costruita una schermata dedicata.
- La lista principale "Esercizi" del coach (`mobile/src/app/esercizi/index.tsx`) resta invariata, mostra solo i 44 esercizi storici locali: la ricerca/import YMove e' raggiungibile solo dal form scheda ("+ Aggiungi esercizio" / "Libreria YMove"), come richiesto ("durante la creazione di una scheda").
- I testi originali YMove (`ymove_original_*`) sono conservati ma non ancora mostrati/ripristinabili da nessuna UI ("torna all'originale") — solo conservazione dati, nessuna funzione di rollback costruita (non richiesta esplicitamente).
- Vedi la sezione dedicata sopra per il limite reale sulla verifica "e' davvero nella scheda di questo cliente".
- Nessun test contro l'API YMove/Azure Translator reale eseguito in questo ambiente (nessuna chiave disponibile): la normalizzazione dei campi YMove e' confermata dall'utente, ma la risposta reale di Azure Translator non e' stata verificata in questo ambiente.
- **Associazione automatica (2026-07-13, continuazione)**: `autoLinkYmoveVideoForExercise` (hook per un esercizio custom appena creato) e' pronto ma NON ha ancora un punto di chiamata reale — non esiste oggi nel codice alcuna schermata che crea un esercizio `source='custom'` (vedi sopra, "Nessuna UI di creazione custom da zero"). Quando quella schermata verra' costruita, va richiamata subito dopo l'inserimento riuscito. Il punteggio di matching e' stato validato con una simulazione locale (catalogo YMove SINTETICO, non dati reali — vedi `docs/WORKLOG.md`): nessun test e' stato eseguito contro l'API YMove/Azure Translator reale in questo ambiente (nessuna chiave disponibile), quindi il tasso di successo reale su un catalogo vero resta da verificare dall'utente.
