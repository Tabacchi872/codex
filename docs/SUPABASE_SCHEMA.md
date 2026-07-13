# Supabase schema ufficiale

Questo documento descrive la base database per clienti, coach e superadmin. La app mobile resta ancora su login locale demo: non sono stati aggiunti URL Supabase, anon key, pacchetti o client reale.

Il SQL eseguibile e in `docs/SUPABASE_SCHEMA.sql`. Questa sezione e il file SQL sono il riferimento aggiornato; le note storiche sotto restano solo come contesto della fase precedente.

## Ruoli ufficiali

- `superadmin`: gestisce piattaforma, piani, billing e notifiche amministrative.
- `coach`: gestisce solo i propri clienti, appuntamenti, abbonamenti cliente e messaggi.
- `cliente`: vede solo il proprio profilo e i dati assegnati dal proprio coach.

## Tabelle ufficiali

- `profiles`: `id uuid primary key`, `role text check in ('superadmin','coach','cliente')`, `full_name`, `email`, `phone`, `avatar_url`, `is_active`, `created_at`, `updated_at`.
- `coach_profiles`: `id uuid primary key`, `user_id references profiles(id)`, `business_name`, `bio`, `phone`, `billing_status`, `created_at`, `updated_at`.
- `billing_profiles`: `id uuid primary key`, `coach_id references profiles(id)`, dati fiscali/intestazione fattura, PEC, codice SDI, email fatturazione, `created_at`, `updated_at`.
- `client_profiles`: `id uuid primary key`, `user_id references profiles(id)`, `goal`, `height`, `weight`, `notes`, `created_at`, `updated_at`.
- `registration_codes`: `id uuid primary key`, `coach_id references profiles(id)`, `code text unique not null`, `status check in ('active','disabled','expired')`, `max_uses`, `used_count`, `expires_at`, `created_at`, `updated_at`.
- `coach_clients`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `status`, `linked_by_code`, `created_at`, `updated_at`.
- `plans`: `id uuid primary key`, `code`, `name`, `price_monthly`, `price_yearly`, `max_clients`, `features jsonb`, `is_active`, `created_at`, `updated_at`.
- `coach_billing`: `id uuid primary key`, `coach_id references profiles(id)`, `plan_id references plans(id)`, `status check in ('trial','active','past_due','canceled','blocked')`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `provider`, `provider_customer_id`, `provider_subscription_id`, `created_at`, `updated_at`.
- `payment_events`: `id uuid primary key`, `coach_id references profiles(id)`, `provider`, `event_type`, `provider_event_id`, `payload jsonb`, `processed_at`, `created_at`.
- `invoices`: `id uuid primary key`, `coach_id references profiles(id)`, `billing_profile_id references billing_profiles(id)`, `invoice_number`, `status`, importi in centesimi, aliquota indicativa, periodo, riferimenti pagamento, stato SdI, `pdf_url`, `xml_url`, `created_at`, `updated_at`.
- `invoice_items`: `id uuid primary key`, `invoice_id references invoices(id)`, `description`, `quantity`, `unit_amount_cents`, `tax_rate_basis_points`, `total_cents`, `sort_order`, `created_at`, `updated_at`.
- `subscriptions`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `name`, `start_date`, `end_date`, `total_sessions`, `used_sessions`, `status`, `created_at`, `updated_at`.
- `appointments`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `title`, `description`, `start_at`, `end_at`, `status`, `created_at`, `updated_at`.
- `messages`: `id uuid primary key`, `coach_id references profiles(id)`, `client_id references profiles(id)`, `sender_id references profiles(id)`, `sender_role`, `body`, `read_at`, `created_at`.
- `admin_notifications`: `id uuid primary key`, `title`, `description`, `type`, `read_at`, `created_at`.
- `push_tokens`: `id uuid primary key`, `user_id references profiles(id)`, `token`, `platform`, `device_id`, `created_at`, `updated_at`.
- `exercise_videos` (2026-07-11): `id uuid primary key`, `coach_id references profiles(id)`, `exercise_id text` (id locale della libreria esercizi in `mobile/src/data/exercise-library.ts`, NON una foreign key — gli esercizi non sono in Supabase), `video_path`, `video_url`, `mime_type`, `size_bytes`, `created_at`, `updated_at`, `unique(coach_id, exercise_id)`. Video scoped per coach: coach diversi possono avere video diversi per lo stesso esercizio globale. Vedi `docs/SUPABASE_STORAGE_VIDEO.md` per il bucket Storage e le relative policy.
- `subscription_packages` (2026-07-12): pacchetti acquistabili gestiti dal superadmin, distinti da `plans`/`coach_billing` (piano SaaS interno del coach) e da `subscriptions` (pacchetto sessioni creato dal singolo coach per il proprio cliente). `id uuid primary key`, `target_role text check in ('coach','client')`, `name`, `description`, `price numeric(10,2)`, `currency default 'EUR'`, `duration_value integer`, `duration_unit text check in ('days','months')`, `max_clients integer null` (solo per `target_role='coach'`, vincolo check che lo forza a `null` per `target_role='client'`), `features jsonb default '[]'`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- `user_subscriptions` (2026-07-12): abbonamento di un utente (coach o cliente) a un `subscription_packages`. `id uuid primary key`, `user_id references profiles(id)`, `package_id references subscription_packages(id) on delete restrict`, `status text check in ('pending','active','expired','canceled')`, `starts_at`, `expires_at`, `payment_provider text null`, `external_subscription_id text null`, `created_at`, `updated_at`.

## RLS ufficiale iniziale

Le policy in `docs/SUPABASE_SCHEMA.sql` sono una base da validare prima della produzione.

- Superadmin: accesso completo alle tabelle operative, piani, billing, eventi pagamento e notifiche admin.
- Coach: accesso ai dati con `coach_id = auth.uid()` e ai clienti collegati tramite `coach_clients`.
- Cliente: accesso solo a `profiles`, `client_profiles`, appuntamenti, subscription e messaggi in cui `client_id = auth.uid()`.
- Registrazione cliente: consentita solo tramite codice coach valido in `registration_codes` con status `active`, non scaduto e con usi disponibili.
- Codici coach: il superadmin li gestisce tutti; il coach legge il proprio codice; la validazione pubblica deve passare da RPC/Edge Function o flusso controllato, non da lettura libera della tabella.
- Coach non vede altri coach: `coach_profiles` e `profiles` non hanno policy di lettura generale tra coach.
- Cliente non vede superadmin: nessuna policy cliente su `admin_notifications`, scrittura piani o billing.
- Superadmin non registrabile pubblicamente: gli account `superadmin` restano creati manualmente/internamente.
- Superadmin gestisce piani e billing; il coach legge solo il proprio billing.
- Fatturazione: superadmin gestisce profili fatturazione e fatture; coach legge il proprio profilo e le proprie fatture.
- Eventi pagamento: in produzione gli insert dovranno passare da backend/Edge Function con service role.
- Video esercizi (`exercise_videos`, 2026-07-11): coach gestisce solo i propri video (`coach_id = auth.uid()`); cliente legge solo i video del proprio coach tramite `coach_clients`; bucket Storage `exercise-videos` pubblico in lettura, scrittura solo nella propria cartella `{coach_id}/...` — vedi `docs/SUPABASE_STORAGE_VIDEO.md`.
- Pacchetti acquistabili (`subscription_packages`/`user_subscriptions`, 2026-07-12): superadmin gestisce tutto (crea/modifica/attiva-disattiva/elimina); coach legge solo i pacchetti attivi con `target_role='coach'`, cliente solo quelli con `target_role='client'` (via `current_app_role()`); ogni utente legge solo le proprie righe in `user_subscriptions` (`user_id = auth.uid()`). Nessuna policy insert/update per coach/cliente su `user_subscriptions`: senza un provider di pagamento reale collegato, solo il superadmin (o in futuro un webhook/Edge Function con service role) puo' scrivere un abbonamento — un utente non puo' auto-assegnarsi un abbonamento attivo dal client. `package_id` e' `on delete restrict`: un pacchetto collegato a QUALUNQUE abbonamento (anche scaduto/annullato) non e' eliminabile finche' quelle righe esistono — il superadmin puo' comunque disattivarlo (`is_active=false`) per non mostrarlo piu' senza cancellare lo storico. Policy aggiuntiva `subscription_packages_read_via_own_subscription`: un utente legge sempre il pacchetto del PROPRIO abbonamento anche se nel frattempo disattivato dal superadmin.

## Limite clienti coach collegato all'abbonamento (2026-07-12)

- **Un solo abbonamento `active` per utente**: trigger `user_subscriptions_single_active` (`enforce_single_active_user_subscription()`) marca `canceled` ogni altra riga `active` dello stesso `user_id` quando una nuova riga diventa `active` — un pacchetto acquistato/rinnovato non accumula mai slot, il pacchetto attivo corrente determina sempre il limite corrente.
- **`public._coach_capacity(p_coach_id)`** (interna, `EXECUTE` revocato ad `anon`/`authenticated`): pacchetto coach attivo non scaduto (`target_role='coach'`, `status='active'`, `expires_at is null or > now()`), `max_clients` di quel pacchetto, conteggio reale `coach_clients` con `status='active'`.
- **`public._link_client_to_coach(p_client_id, p_coach_id, p_code)`** (interna): collega atomicamente un cliente gia' autenticato al coach del codice usato, DOPO aver verificato codice/abbonamento attivo/limite — `pg_advisory_xact_lock(hashtext(coach_id))` serializza i controlli per coach, cosi' due registrazioni concorrenti con l'ultimo posto libero non possono passare entrambe. Idempotente (un cliente gia' collegato a qualunque coach: no-op). Usata sia dal trigger `handle_new_user()` (ramo cliente, best-effort, eccezioni catturate — non blocca mai la creazione dell'utente Auth) sia dalla RPC sotto.
- **`public.register_client_with_code(p_code)`** (RPC pubblica, `authenticated`): chiamata lato app dopo `signUp` (sessione immediata) o al primo login (`ensureClientOnboarding`, "Confirm email" attivo) — usa sempre `auth.uid()` come client id, mai un parametro falsificabile.
- **`public.can_coach_accept_client(p_coach_id)`** (RPC pubblica, `anon`+`authenticated`, sola lettura, nessun numero esposto): usata PRIMA di `signUp` per rifiutare la registrazione con un messaggio onesto ("Abbonamento necessario" / limite raggiunto) senza creare un account Supabase Auth destinato a restare non collegato.
- **`public.get_coach_client_capacity(p_coach_id)`** (RPC pubblica, `authenticated`): capacita' completa con i numeri (`used_clients`, `max_clients`, `available_slots`, `expires_at`) — solo il coach stesso o il superadmin possono chiamarla per un dato `p_coach_id`, chiunque altro viene rifiutato.
- **Nota**: se il coach passa a un pacchetto piu' piccolo con piu' clienti gia' collegati del nuovo limite, i clienti esistenti NON vengono rimossi (nessuna riga `coach_clients` viene mai cancellata da questa logica) — solo le NUOVE registrazioni vengono bloccate finche' il conteggio non torna sotto il limite.

## Libreria esercizi FitCoach + integrazione YMove (2026-07-12)

Prima di questa sezione non esisteva alcuna tabella esercizi su Supabase: la libreria storica (44 esercizi) resta un file locale condiviso (`mobile/src/data/exercise-library.ts`), non toccato da questa integrazione — coesiste con la tabella nuova (`mobile/src/hooks/use-exercise-resolver.ts` prova prima il file locale, poi `public.exercises`).

- **`public.exercises`**: `id uuid`, `coach_id uuid null` (NULL per `source='ymove'`, valorizzato per `source='custom'` — vincolo `exercises_source_ownership`), `name`, `description`, `technical_notes`, `muscle_group`, `equipment`, `difficulty`, `exercise_type`, `source text check in ('custom','ymove')`, `ymove_exercise_id text`, `ymove_slug text`, `created_at`, `updated_at`. Indice univoco su `ymove_exercise_id` quando non nullo: un esercizio YMove va importato una sola volta in assoluto (condiviso tra tutti i coach, mai duplicato), un esercizio `custom` appartiene sempre a un solo coach. **Nessun URL video/thumbnail/HLS viene mai salvato qui**: sono link firmati che scadono, richiesti ogni volta al bisogno tramite l'Edge Function `ymove-exercises`.
- **RLS**: superadmin gestisce tutto; qualunque utente autenticato legge gli esercizi `ymove` (condivisi, solo metadati, mai dati sensibili); il coach gestisce (crea/modifica/elimina) solo i propri `custom`; il cliente legge i `custom` del proprio coach tramite `coach_clients` (stesso scoping di `exercise_videos`); l'insert è vincolato (`exercises_coach_insert`) a un coach autenticato che crea un proprio `custom` o un `ymove` condiviso — mai un `ymove` intestato a sé o un `custom` di un altro coach.
- **Edge Function `ymove-exercises`** (`supabase/functions/ymove-exercises/index.ts`): unico punto che parla con l'API YMove (`https://exercise-api.ymove.app/api/v2`, header `X-API-Key`, secret `YMOVE_API_KEY` — mai nell'app Expo). Due azioni: `search` (lista, sempre con `includeVideos=false`, solo coach/superadmin) e `detail` (singolo esercizio con video/thumbnail/istruzioni, sempre `includeVideos` reale — coach/superadmin senza restrizioni; cliente autenticato SOLO se l'esercizio risulta già importato in `public.exercises` come `source='ymove'` E il cliente ha un collegamento `coach_clients` attivo con un coach — vedi limite architetturale documentato in `docs/YMOVE_INTEGRATION.md`: non esiste oggi una verifica server-side "è davvero nella scheda di questo cliente", perché le schede non sono su Supabase).

## Traduzione italiana esercizi YMove + associazione video su esercizi esistenti (2026-07-13)

- **Traduzione globale**: `name`/`description`/`technical_notes` di `public.exercises` restano i testi ATTUALMENTE mostrati (nessuna nuova colonna): dopo l'import sono in italiano (tradotti una sola volta, mai ad ogni apertura) o, se nessun servizio di traduzione è configurato, sono una copia onesta dell'originale — mai una traduzione finta. Tre nuove colonne conservano SEMPRE l'originale YMove separatamente, mai più toccate dopo l'import: `ymove_original_title`, `ymove_original_description`, `ymove_original_instructions`. **Questo testo globale è modificabile SOLO dal superadmin** (`exercises_superadmin_all`, già esistente) — nessun coach può più cambiarlo (vedi correzione sotto).
- **`public.exercise_text_overrides`** (2026-07-13, continuazione — CORREGGE una scelta precedente sbagliata): `id`, `coach_id`, `exercise_id uuid references exercises(id)`, `name`, `description`, `technical_notes`, `created_at`, `updated_at`, `unique(coach_id, exercise_id)`. Personalizzazione **per-coach** del testo italiano: il coach crea/modifica solo la propria riga (mai quella di un altro coach per lo stesso esercizio); il cliente legge solo l'override del proprio coach (`coach_clients`). In lettura, l'app usa SEMPRE prima l'override (se esiste), altrimenti il testo globale di `exercises`. **Correzione**: la policy precedente `exercises_coach_update_ymove_text` ("wiki-style", qualunque coach poteva modificare il testo condiviso) è stata rimossa perché sbagliata — un coach non deve poter cambiare cosa vedono gli altri coach. Vedi `docs/DECISIONS.md`.
- **Associazione video su un esercizio esistente**: riusa `exercise_videos` (già esistente per i video caricati manualmente) invece di una struttura nuova — una riga ora rappresenta O un file caricato (`video_path`/`video_url`) O un collegamento YMove (`ymove_exercise_id`/`ymove_slug`), mai entrambi vuoti (check `exercise_videos_has_source`). `video_path`/`video_url` sono stati resi nullable per questo. Nuovo indice univoco `(coach_id, ymove_exercise_id)`: un coach non può collegare lo stesso esercizio YMove a due esercizi diversi nella propria libreria (evita duplicati silenziosi) — coach diversi possono collegare lo stesso esercizio YMove ciascuno al proprio, senza conflitti.

## Migrazione schede e allenamenti a Supabase (2026-07-14)

Prima di questa sezione le schede (`WorkoutPlan`) erano interamente locali (Zustand + AsyncStorage, `mobile/src/store/training-store.ts`), fin dalla primissima versione dell'app — mai toccate quando Supabase fu introdotto (causa diretta per cui non erano mai sincronizzate tra dispositivi/coach-cliente). **Nota**: le sezioni "Allenamenti" nell'elenco tabelle piu' in alto in questo documento (`workout_templates`/`workout_plans`/`workout_days`/`exercises`/`workout_day_exercises`) erano una bozza di pianificazione del 2026-07-08 **mai implementata** e con una forma diversa (es. `exercises` come tabella con FK rigida da `workout_day_exercises`) — questa sezione descrive lo schema REALMENTE implementato in `docs/SUPABASE_SCHEMA.sql`, che la sostituisce.

- **`public.workout_templates`**: modelli personalizzati del coach (`id`, `coach_id`, `name`, `description`, `goal`, `level`, `created_at`, `updated_at`). Distinta dai 7 modelli predefiniti statici (`mobile/src/data/workout-plan-templates.ts`, non toccati): pronta per una futura UI "i miei modelli", non ancora costruita.
- **`public.workout_plans`**: una scheda/sessione (`id`, `coach_id`, `client_id`, `template_id` nullable, `name`, `status` — derivato dalla scadenza, ricalcolato ad ogni salvataggio ma mai l'unica fonte per la UI —, `start_date`, `expiry_date`, `scheduled_time`, `session_status`, `started_at`, `completed_at`, `duration_seconds`, `day_label`, `week_label`, `subscription_id` testuale libero — l'abbonamento locale demo non e' su Supabase, fuori scope —, `created_at`, `updated_at`).
- **`public.workout_days`**: un livello intermedio tra `workout_plans` e `workout_day_exercises`, richiesto dallo schema per un futuro multi-giorno — il modello TS `WorkoutPlan` resta pero' FLAT: il servizio mobile crea/gestisce sempre e solo UN `workout_days` implicito per piano (`day_order=1`), trasparente per l'app.
- **`public.workout_day_exercises`**: un esercizio dentro una scheda (`id`, `workout_day_id`, `exercise_id text` — **MAI una foreign key**: contiene sia gli id testuali dei 44 esercizi storici locali sia gli UUID di `public.exercises` (custom/ymove), risolti sempre da `mobile/src/hooks/use-exercise-resolver.ts` —, `exercise_order`, `sets`, `reps`, `reps_min`, `reps_max`, `target_weight`, `rest_seconds`, `notes`, `technique_type` (`normal`/`superset`/`stripping`/`circuit`), `superset_group_id`, `duration_seconds` (non ancora scritto dall'app, pronto per un futuro uso cardio-a-tempo), `completed`, `created_at`, `updated_at`).
- **Salvataggio atomico**: `public.save_workout_plan(payload jsonb)` (SECURITY DEFINER) fa upsert di piano+giorno+esercizi in un solo statement PL/pgSQL — o va tutto a buon fine o (eccezione) niente viene scritto, mai una scheda parzialmente salvata. Verifica esplicitamente che il chiamante sia il coach proprietario (o superadmin) e che il cliente indicato sia davvero collegato a lui (`is_coach_for_client`, gia' esistente per il limite clienti). Gli esercizi non ricomparsi nel payload vengono eliminati (l'editor invia sempre la lista completa, mai un delta).
- **Aggiornamento sessione**: `public.update_workout_session_progress(...)` (SECURITY DEFINER), chiamabile sia dal coach sia dal CLIENTE — tocca solo `session_status`/`started_at`/`completed_at`/`duration_seconds` su `workout_plans` e `completed` su `workout_day_exercises`. E' qui, non con un privilegio PostgreSQL a livello di colonna (mai usato in questo progetto), che si applica la regola "il cliente aggiorna solo i dati di sessione consentiti, mai serie/esercizi/peso/struttura": nessuna policy RLS di update diretta esiste per il cliente sulle tabelle.
- **RLS**: superadmin accesso completo; coach CRUD pieno solo sulle proprie schede e solo per i propri clienti reali (verificato anche nel `with check` della policy, non solo nella RPC); cliente SOLO lettura delle proprie schede (`client_id = auth.uid()`), nessuna riga di scrittura diretta. `workout_days`/`workout_day_exercises` non hanno colonne `coach_id`/`client_id` proprie: lo scoping passa sempre dalla riga `workout_plans` genitore tramite `EXISTS`/`JOIN`.
- **Realtime**: `workout_plans` aggiunta alla pubblicazione `supabase_realtime` (altrimenti nessun evento verrebbe mai consegnato, indipendentemente dal codice lato app) — sottoscrizione lato mobile sempre filtrata per `coach_id`/`client_id` dell'utente autenticato, mai globale.
- **Migrazione one-shot lato app** (`mobile/src/lib/workout-plan-migration.ts`): sposta su Supabase le schede locali di un coach reale, escludendo sempre piani gia' remoti (id gia' un UUID), gia' migrati (persistito per-coach in AsyncStorage, idempotente), piani demo/seed (`SEED_WORKOUT_PLANS`, MAI verso un account reale) e piani il cui cliente locale non risulti davvero collegato a quel coach (`coach_clients`).

## Note fiscali e fatturazione

- Questa struttura prepara la fatturazione automatica futura ma non genera fatture reali.
- IVA ordinaria Italia: 22% salvo diverso parere del commercialista o regime fiscale specifico.
- Fattura elettronica via SdI per soggetti italiani quando applicabile.
- Pagamenti mobile Apple/Google da gestire e riconciliare separatamente.
- Pagamenti web Stripe da collegare dopo, con webhook e riconciliazione prima dell'emissione.
- Calcoli fiscali, numerazione ufficiale, invio SdI, conservazione sostitutiva e storno devono essere implementati con provider e validazione fiscale prima della produzione.

## Email future (Supabase Auth)

Nessuna email viene inviata ora: login/registrazione restano locali (AsyncStorage), senza SMTP/provider collegato. Quando Supabase Auth sara' attivato, questi flussi email sono gia' previsti e andranno configurati (template + provider SMTP in dashboard Supabase, o provider esterno tipo Resend/Postmark dietro Auth):

- **Conferma registrazione**: email di verifica indirizzo all'iscrizione di coach e cliente (oggi l'account e' attivo subito, senza verifica).
- **Reset password**: link "Password dimenticata" in login (oggi presente ma disabilitato in UI) verra' collegato al flusso `resetPasswordForEmail` di Supabase Auth.
- **Invito cliente**: email al cliente quando il coach lo registra/collega (percorso alternativo alla condivisione manuale del codice coach), utile quando il coach crea l'account per conto del cliente invece che il cliente si registri da solo.
- **Conferma cambio email**: verifica del nuovo indirizzo quando un coach o cliente cambia l'email di accesso.

## Cosa manca per collegare Supabase reale

- Creare progetto Supabase.
- Eseguire `docs/SUPABASE_SCHEMA.sql` nel SQL editor o in una migration.
- Collegare `profiles.id` a `auth.users.id` quando si attiva Supabase Auth.
- Aggiungere `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Installare `@supabase/supabase-js` solo dopo conferma.
- Sostituire il login locale con Supabase Auth mantenendo i redirect: coach `/`, cliente `/cliente-home`, superadmin `/superadmin`.
- Validare RLS con utenti reali per i tre ruoli.

## Fase 1 collegata (2026-07-08): cosa e' cambiato davvero

Questa sezione documenta lo stato reale dopo il collegamento Supabase Fase 1 (`mobile/src/lib/supabase.ts`, `mobile/src/lib/auth-service.ts`). `docs/SUPABASE_SCHEMA.sql` e' stato aggiornato di conseguenza:

- `profiles.id` ora referenzia `auth.users(id) on delete cascade` (prima era una `uuid primary key` isolata).
- Nuovo trigger `public.handle_new_user()` su `auth.users` (after insert, security definer): crea automaticamente la riga `profiles` leggendo `role`/`full_name`/`phone` da `raw_user_meta_data`, passati da `supabase.auth.signUp({ options: { data: {...} } })`. Bypassa la RLS di `profiles` (nessuna policy self-insert necessaria).
- Funzione `public.increment_registration_code_usage(code_id uuid)` (security definer) presente nello schema ma non piu' chiamata da `auth-service.ts`: sostituita con un update diretto su `registration_codes` + nuova policy `registration_codes_increment_usage` (`status = 'active'`), piu' semplice da far funzionare su un progetto reale senza dipendere da una funzione SQL aggiuntiva con i permessi giusti. Stesso compromesso di sicurezza delle altre policy pubbliche di questa fase (vedi sotto).
- Nuove policy: `registration_codes_coach_insert_own` (il coach crea il proprio codice), `registration_codes_public_read_active` (lettura pubblica dei soli codici attivi, necessaria per validare un codice prima che il cliente abbia un account), `coach_profiles_public_read` (lettura pubblica per controllare se il coach puo' accettare clienti), `coach_clients_client_self_insert` (il cliente appena registrato collega se stesso al coach).
- **Semplificazione nota (non ideale, da rafforzare prima della produzione)**: la validazione del codice coach e il collegamento `coach_clients` avvengono lato app (`auth-service.ts`) con policy pubbliche/self-insert, non tramite una funzione `register_client_with_code()` security definer che validi tutto atomicamente lato server (quella funzione resta nell'elenco "Funzioni backend previste" sotto, non ancora implementata). Un utente autenticato potrebbe in teoria forzare un insert in `coach_clients` con un `coach_id` arbitrario bypassando il controllo app-side.
- **Requisito operativo Fase 1**: in Authentication → Providers → Email su Supabase, "Confirm email" va disattivato. Il flusso attuale scrive `coach_profiles`/`billing_profiles`/`registration_codes` (coach) o `client_profiles`/`coach_clients` (cliente) subito dopo `signUp`, nella stessa sessione: se la conferma email resta obbligatoria, `signUp` crea l'utente Auth ma non restituisce una sessione attiva, quindi questi insert falliscono per RLS (errore visibile in UI, gestito senza crash — non dato silenzioso). Vedi `docs/EMAIL_SETUP.md`.
- Il "limite clienti" per la registrazione reale usa oggi `registration_codes.max_uses`/`used_count` (non i piani/`plans`): e' una semplificazione voluta per la Fase 1, diversa dalla logica locale demo (`lib/coach-code.ts`, basata su piano/`clientLimit`). Da unificare quando `coach_billing`/`plans` saranno collegati alla registrazione reale.

---

# Supabase schema fase 1

Questo schema prepara il backend ufficiale senza migrare la demo locale da AsyncStorage. I nomi sono stabili per la fase 2, ma le policy RLS vanno validate su un progetto Supabase reale prima della migrazione.

## Ruoli

- `superadmin`: gestisce coach, piani, blocchi manuali, override e billing.
- `coach`: gestisce i propri clienti, schede, appuntamenti e messaggi.
- `cliente`: accede solo ai dati assegnati dal proprio coach.

## Tabelle core

### profiles

Profilo applicativo collegato a `auth.users`.

Campi principali: `id uuid primary key references auth.users(id)`, `role text check in ('superadmin','coach','cliente')`, `email text`, `full_name text`, `phone text`, `avatar_url text`, `is_active boolean default true`, `blocked_at timestamptz`, `blocked_reason text`, `created_at timestamptz`, `updated_at timestamptz`.

Indici: `role`, `email`.

### coach_clients

Relazione tra coach e clienti.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `status text check in ('invited','active','archived','blocked')`, `linked_by_code text null`, `started_at date`, `ended_at date`, `notes text`, `created_at timestamptz`.

Vincoli: unique `(coach_id, client_id)`.

### billing_profiles

Dati fiscali e intestazione fattura del coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id) unique`, `subject_type text check in ('private','freelancer','sole_proprietorship','company')`, `legal_name text`, `vat_number text`, `fiscal_code text`, `address text`, `postal_code text`, `city text`, `province text`, `country text`, `pec text`, `sdi_code text`, `billing_email text`, `created_at timestamptz`, `updated_at timestamptz`.

Regola minima: `legal_name`, `billing_email` e `country` obbligatori. Per partita IVA italiana serve PEC o codice SDI; `0000000` puo rappresentare codice SDI non comunicato quando ammesso dal processo fiscale.

### registration_codes

Codici ufficiali per collegare un cliente a un coach in fase di registrazione.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `code text unique not null`, `status text check in ('active','disabled','expired')`, `max_uses integer null`, `used_count integer default 0`, `expires_at timestamptz null`, `created_at timestamptz`, `updated_at timestamptz`.

Regole: un cliente puo registrarsi solo con un codice `active`, non scaduto e non oltre `max_uses`; dopo il collegamento `coach_clients.linked_by_code` conserva il codice usato.

### client_profiles

Dati estesi cliente, separati dal profilo auth.

Campi principali: `client_id uuid primary key references profiles(id)`, `coach_id uuid references profiles(id)`, `birth_date date`, `height_cm numeric`, `weight_kg numeric`, `goals text`, `injuries text`, `training_level text`, `nutrition_notes text`, `emergency_contact text`, `created_at timestamptz`, `updated_at timestamptz`.

### plans

Catalogo piani coach.

Campi principali: `id uuid primary key`, `code text unique`, `name text`, `description text`, `client_limit integer`, `features jsonb`, `is_active boolean`, `sort_order integer`, `created_at timestamptz`, `updated_at timestamptz`.

Esempio `features`: `{"workout_templates":true,"appointments":true,"messages_realtime":true,"push_notifications":false,"advanced_analytics":false}`.

### coach_billing

Stato billing corrente del coach.

Campi principali: `coach_id uuid primary key references profiles(id)`, `plan_id uuid references plans(id)`, `status text check in ('trialing','active','past_due','canceled','blocked','manual_override')`, `provider text check in ('revenuecat','apple','google','stripe','manual')`, `provider_customer_id text`, `provider_subscription_id text`, `current_period_start timestamptz`, `current_period_end timestamptz`, `cancel_at_period_end boolean`, `manual_override_until timestamptz`, `updated_by uuid references profiles(id)`, `updated_at timestamptz`.

### invoices

Testate fattura preparate per automazione futura. Non implica emissione reale.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `billing_profile_id uuid references billing_profiles(id)`, `invoice_number text unique`, `status text check in ('draft','ready','issued','void','paid')`, `currency text`, `subtotal_cents integer`, `tax_rate_basis_points integer`, `tax_cents integer`, `total_cents integer`, `issued_at timestamptz`, `due_at timestamptz`, `period_start date`, `period_end date`, `payment_provider text`, `payment_reference text`, `sdi_status text`, `pdf_url text`, `xml_url text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

### invoice_items

Righe fattura collegate a `invoices`.

Campi principali: `id uuid primary key`, `invoice_id uuid references invoices(id)`, `description text`, `quantity numeric`, `unit_amount_cents integer`, `tax_rate_basis_points integer`, `total_cents integer`, `sort_order integer`, `created_at timestamptz`, `updated_at timestamptz`.

### payment_events

Storico append-only degli eventi pagamento.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `provider text`, `event_type text`, `provider_event_id text`, `provider_subscription_id text`, `amount_cents integer`, `currency text`, `payload jsonb`, `created_at timestamptz`.

Vincoli: unique `(provider, provider_event_id)` quando disponibile.

### subscriptions

Abbonamenti cliente gestiti dal coach dentro l'app, distinti dal billing coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `name text`, `status text check in ('active','expiring','expired','paused','canceled')`, `starts_on date`, `ends_on date`, `price_cents integer`, `currency text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

## Allenamenti

### workout_templates

Modelli riutilizzabili dal coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `title text`, `description text`, `level text`, `tags text[]`, `is_archived boolean`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_plans

Schede assegnate ai clienti.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `template_id uuid references workout_templates(id)`, `title text`, `description text`, `starts_on date`, `ends_on date`, `status text check in ('draft','active','completed','archived')`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_days

Giorni di una scheda o template.

Campi principali: `id uuid primary key`, `workout_plan_id uuid references workout_plans(id)`, `template_id uuid references workout_templates(id)`, `title text`, `day_index integer`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

Vincolo: un giorno appartiene a un piano assegnato oppure a un template.

### exercises

Libreria esercizi ufficiale e custom coach.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id) null`, `name text`, `muscle_group text`, `equipment text`, `instructions text`, `video_url text`, `thumbnail_url text`, `is_public boolean`, `created_at timestamptz`, `updated_at timestamptz`.

### workout_day_exercises

Esercizi dentro un giorno allenamento.

Campi principali: `id uuid primary key`, `workout_day_id uuid references workout_days(id)`, `exercise_id uuid references exercises(id)`, `sort_order integer`, `sets integer`, `reps text`, `rest_seconds integer`, `tempo text`, `load_notes text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

## Operativita

### appointments

Appuntamenti coach-cliente.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `starts_at timestamptz`, `ends_at timestamptz`, `title text`, `location text`, `status text check in ('scheduled','completed','canceled','no_show')`, `notes text`, `created_at timestamptz`, `updated_at timestamptz`.

### conversations

Conversazioni tra coach e cliente.

Campi principali: `id uuid primary key`, `coach_id uuid references profiles(id)`, `client_id uuid references profiles(id)`, `last_message_at timestamptz`, `created_at timestamptz`.

Vincoli: unique `(coach_id, client_id)`.

### messages

Messaggi realtime.

Campi principali: `id uuid primary key`, `conversation_id uuid references conversations(id)`, `sender_id uuid references profiles(id)`, `body text`, `attachment_url text`, `read_at timestamptz`, `created_at timestamptz`.

Indici: `(conversation_id, created_at)`.

### push_tokens

Token push Expo/APNs/FCM per notifiche future.

Campi principali: `id uuid primary key`, `profile_id uuid references profiles(id)`, `token text unique`, `platform text check in ('ios','android','web')`, `device_id text`, `is_active boolean`, `last_seen_at timestamptz`, `created_at timestamptz`.

## Policy RLS iniziali

- `superadmin`: accesso completo a tutte le tabelle operative e billing.
- `coach`: legge/scrive solo righe con `coach_id = auth.uid()` o relazioni in `coach_clients`.
- `cliente`: legge solo il proprio `profiles`, `client_profiles`, schede assegnate, appuntamenti, conversazioni e messaggi.
- `registration_codes`: gestione completa solo superadmin; coach legge i propri codici; validazione registrazione cliente da implementare tramite funzione controllata.
- `billing_profiles`: superadmin gestisce tutti i profili; coach legge e aggiorna il proprio.
- `invoices` e `invoice_items`: superadmin gestisce tutto; coach legge le proprie fatture.
- `payment_events`: insert solo da service role/backend function, lettura solo superadmin e coach proprietario con campi filtrati via view.
- `plans`: lettura per coach autenticati, scrittura solo superadmin.
- `coach_billing`: lettura coach proprietario e superadmin, scrittura solo superadmin/backend function.

## Funzioni backend previste

- `get_coach_entitlements(coach_id uuid)`: ritorna piano, limiti, feature e stato billing.
- `can_add_client(coach_id uuid)`: controlla stato coach, billing e limite clienti.
- `validate_registration_code(code text)`: controlla codice attivo, scadenza, usi e possibilita del coach di accettare clienti.
- `register_client_with_code(code text, profile jsonb)`: crea profilo cliente e relazione `coach_clients` in modo atomico.
- `set_coach_plan(coach_id uuid, plan_id uuid, reason text)`: override superadmin.
- `block_coach(coach_id uuid, reason text)` e `unblock_coach(coach_id uuid)`.
- `record_payment_event(payload jsonb)`: normalizza webhook RevenueCat/Stripe.
