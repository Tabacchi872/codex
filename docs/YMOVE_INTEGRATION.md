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
        importare, per l'anteprima); un cliente SOLO se l'esercizio e' gia'
        stato importato in FitCoach (public.exercises, source='ymove') E il
        cliente ha un coach reale collegato (coach_clients) — vedi limite
        architetturale sotto
     5. proxy verso https://exercise-api.ymove.app/api/v2, header X-API-Key
  -> risponde { ok: true, data } o { ok: false, code, message } — MAI un URL
     video/thumbnail viene salvato da nessuna parte, ne' qui ne' nel database
```

L'import vero e proprio (scrittura in `public.exercises`) **non passa dalla Edge Function**: il coach lo fa direttamente dal client mobile (`mobile/src/lib/fitcoach-exercises-service.ts`, `createOrReuseExerciseFromYmove`), protetto dalla RLS `exercises_coach_insert` — riusa i metadati gia' ottenuti dalla chiamata `detail` sopra, nessuna seconda chiamata a YMove necessaria.

## Limite architetturale onesto (da conoscere prima di usarla in produzione)

Il requisito "il cliente puo' richiamare il dettaglio YMove solo se l'esercizio e' realmente presente in una sua scheda" **non e' verificabile al 100% lato server oggi**: le schede (`WorkoutPlan`/`WorkoutExercise`) vivono solo lato app (AsyncStorage/Zustand, `mobile/src/store/training-store.ts`), non sono mai state migrate su Supabase (vedi `docs/TODO_NEXT.md`, voce "Migrare il resto dell'app a Supabase"). La Edge Function applica quindi il controllo piu' forte possibile con i dati REALMENTE disponibili lato server: il cliente deve essere autenticato, avere un coach collegato (`coach_clients`), e l'esercizio richiesto deve gia' essere stato importato in FitCoach da un coach qualsiasi (`public.exercises`, `source='ymove'`) — non un id YMove arbitrario mai importato. Questo impedisce a un cliente di esplorare il catalogo YMove completo, ma NON garantisce che quello specifico esercizio sia davvero nella SUA scheda (potrebbe vedere il video di un esercizio importato da un altro coach, se ne conoscesse l'id). Per una garanzia completa servirebbe migrare le schede su Supabase — fuori scope di questo intervento.

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

## Come testare

1. Esegui `docs/SUPABASE_SCHEMA.sql` sul progetto Supabase reale.
2. Deploya la Edge Function e imposta `YMOVE_API_KEY` (vedi sopra).
3. Login come coach reale → apri/crea una scheda → "Libreria YMove" → cerca per nome/muscolo/attrezzatura/tipologia/difficolta' → verifica che compaiano nome/muscolo/attrezzatura/difficolta' per ogni risultato, **nessun video caricato in questa fase** (verifica anche dal pannello YMove/dai log che le richieste di lista non contino come video).
4. Premi "Anteprima" su un risultato → verifica che compaia il video (o la miniatura se il video manca) e le istruzioni.
5. Premi "Aggiungi a FitCoach" → verifica che l'esercizio compaia subito nella scheda in costruzione, con serie/ripetizioni/durata/recupero/carico/note modificabili normalmente come ogni altro esercizio.
6. Ripeti l'import dello STESSO esercizio (stesso o altro coach, se disponibile un secondo account) → verifica in Table editor (`public.exercises`) che non venga creata una seconda riga (stesso `ymove_exercise_id`, riusato).
7. Salva la scheda, assegnala a un cliente → login come quel cliente → apri l'esercizio → verifica che il video sia visibile.
8. Prova a rompere volutamente il player (es. connessione instabile) → verifica che compaia un messaggio d'errore chiaro con bottone "Riprova", non un player vuoto o bloccato.
9. Se possibile, testa il caso limite YMove (429) e un id non autorizzato per un cliente non collegato: verifica che i messaggi mostrati siano quelli onesti previsti ("Limite YMove raggiunto", "Video non disponibile per il tuo account"), mai un crash o un player silenzioso.
10. Verifica in `public.exercises` che NESSUNA colonna contenga un URL video/thumbnail (devono esistere solo metadati testuali).

## Sicurezza — cosa e' garantito

- `YMOVE_API_KEY` non e' mai nel codice mobile ne' in `EXPO_PUBLIC_*`: vive solo nell'ambiente della Edge Function.
- Nessun URL video/thumbnail/HLS viene mai scritto in `public.exercises`: sono link firmati che scadono, richiesti live a ogni apertura del video e ri-richiesti se il player segnala un errore.
- Ricerca (`search`) riservata a coach/superadmin autenticati.
- Dettaglio (`detail`) per un cliente richiede un coach collegato reale E che l'esercizio sia gia' stato importato in FitCoach — vedi limite architetturale onesto sopra per cosa questo NON garantisce ancora.

## Limiti noti / cosa NON e' stato fatto

- Nessuna UI di creazione "custom" (esercizio FitCoach scritto a mano dal coach, senza YMove): lo schema/RLS la prevedono gia' (`source='custom'`), ma questo intervento ha implementato solo il percorso "opzione B" (import da YMove) richiesto esplicitamente.
- La lista principale "Esercizi" del coach (`mobile/src/app/esercizi/index.tsx`) resta invariata, mostra solo i 44 esercizi storici locali: la ricerca/import YMove e' raggiungibile solo dal form scheda ("+ Aggiungi esercizio" / "Libreria YMove"), come richiesto ("durante la creazione di una scheda").
- Vedi la sezione dedicata sopra per il limite reale sulla verifica "e' davvero nella scheda di questo cliente".
- Nessun test contro l'API YMove reale eseguito in questo ambiente (nessuna chiave disponibile): la normalizzazione dei campi e' un'assunzione ragionevole da verificare, vedi sopra.
