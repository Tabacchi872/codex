# Video esercizi reali — Supabase Storage

Questo documento spiega come attivare l'upload/visualizzazione di video esercizi reali: bucket Storage, tabella `exercise_videos`, policy, e come testare il flusso coach → cliente. Fino a quando questo setup non viene eseguito su un progetto Supabase reale, l'app resta sul fallback esistente (video demo statico in `mobile/src/data/exercise-library.ts`, o la card "Nessun video disponibile").

## Architettura (perché è fatta così)

- **Gli esercizi NON sono in Supabase.** La libreria di 44 esercizi (`mobile/src/data/exercise-library.ts`) resta un array TypeScript locale condiviso da tutta l'app — non è stata creata una tabella `exercises`, per non forzare una migrazione più grande del necessario per questa fase. `exercise_id` nella nuova tabella `exercise_videos` è quindi un **testo semplice** (lo stesso id locale, es. `"petto-panca-piana"`), non una foreign key verso una tabella che non esiste.
- **Un video è sempre scoped a `(coach_id, exercise_id)`**, non solo a `exercise_id`. Questo significa che coach diversi possono caricare video diversi per lo stesso esercizio globale (ognuno filma nella propria palestra, con la propria attrezzatura). Un cliente vede **solo** il video caricato dal proprio coach (tramite `coach_clients`), mai quello di un coach a cui non è collegato.
- **Il bucket è pubblico in lettura.** Niente URL firmati/scadenza da gestire in questa fase: una volta caricato, il video è raggiungibile da `video_url` (URL pubblico Supabase Storage) senza bisogno di autenticazione per la sola visualizzazione. La scrittura resta invece ristretta al coach proprietario (vedi policy sotto).
- **`coach_id` deve sempre essere l'id reale della sessione Supabase** (`auth.uid()`, ottenuto con `getCurrentSession()` in `mobile/src/lib/auth-service.ts`), **mai** `useAuthStore().currentCoachId` — quest'ultimo è l'id del mirror locale demo (`superadmin-store`) e non coincide con l'utente Supabase autenticato. Se venisse usato per errore, gli insert fallirebbero silenziosamente contro la RLS (`coach_id = auth.uid()` non troverebbe corrispondenza). `mobile/src/lib/exercise-video-service.ts` espone `getCurrentCoachIdForUpload()` apposta per questo.
- **Nessun file orfano su un fallimento parziale (fix 2026-07-11).** L'upload avviene in due passi: (1) il file va su Storage, (2) la riga va sul database. Se il passo 2 fallisce (es. tabella non ancora creata, come nel bug originale di questa nota) il file caricato al passo 1 viene rimosso automaticamente prima di restituire l'errore — `uploadExerciseVideo` in `mobile/src/lib/exercise-video-service.ts`. Best-effort: se anche la rimozione fallisse, l'errore mostrato all'utente resta quello originale del database, non quello di pulizia.

## Cosa configurare su Supabase

### 1. Tabella `exercise_videos` + RLS

Già inclusa nello snippet completo di `docs/SUPABASE_SCHEMA.sql` (sezione finale "Video esercizi"). Eseguibile da solo, senza rieseguire tutto il file:

```sql
create table if not exists public.exercise_videos (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  video_path text not null,
  video_url text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, exercise_id)
);

create index if not exists exercise_videos_exercise_id_idx on public.exercise_videos(exercise_id);
create index if not exists exercise_videos_coach_id_idx on public.exercise_videos(coach_id);

drop trigger if exists exercise_videos_set_updated_at on public.exercise_videos;
create trigger exercise_videos_set_updated_at before update on public.exercise_videos
for each row execute function public.set_updated_at();

alter table public.exercise_videos enable row level security;

drop policy if exists exercise_videos_superadmin_all on public.exercise_videos;
create policy exercise_videos_superadmin_all on public.exercise_videos
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists exercise_videos_coach_own_all on public.exercise_videos;
create policy exercise_videos_coach_own_all on public.exercise_videos
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists exercise_videos_client_read_own_coach on public.exercise_videos;
create policy exercise_videos_client_read_own_coach on public.exercise_videos
  for select using (
    exists (
      select 1 from public.coach_clients
      where coach_clients.client_id = auth.uid()
        and coach_clients.coach_id = exercise_videos.coach_id
        and coach_clients.status in ('active', 'invited')
    )
  );

-- Forza PostgREST a rileggere subito lo schema (vedi nota "Could not find the
-- table... in the schema cache" sotto): di norma non serve, PostgREST si
-- aggiorna da solo dopo una DDL, ma eseguirlo esplicitamente evita di dover
-- aspettare se la tabella non risultasse subito visibile all'API.
notify pgrst, 'reload schema';
```

> Richiede la funzione `public.set_updated_at()` e la tabella `public.coach_clients`, già presenti se `docs/SUPABASE_SCHEMA.sql` è stato eseguito in precedenza (fasi Supabase precedenti). Lo snippet è pensato per essere rieseguibile senza errori (drop-if-exists su ogni policy, `create table/index if not exists`).

> **Errore "Could not find the table 'public.exercise_videos' in the schema cache"**: significa una di due cose — (a) questo snippet non è mai stato eseguito sul progetto (causa più comune), oppure (b) è stato eseguito ma PostgREST (il layer API di Supabase) non ha ancora ricaricato lo schema. Per (b): Supabase → Settings → API → pulsante "Reload schema" (oppure eseguire di nuovo solo la riga `notify pgrst, 'reload schema';` sopra, oppure attendere qualche secondo/minuto — PostgREST si ricarica anche da solo periodicamente). Se l'errore persiste dopo entrambi i tentativi, verificare in Table editor che `exercise_videos` esista davvero nello schema `public`.

### 2. Bucket Storage `exercise-videos`

**Da dashboard** (consigliato, più semplice da verificare a colpo d'occhio): Supabase → Storage → New bucket → nome `exercise-videos`, **Public bucket: ON**.

**Oppure via SQL Editor** (equivalente, utile se preferisci un solo posto da cui eseguire tutto):

```sql
insert into storage.buckets (id, name, public)
values ('exercise-videos', 'exercise-videos', true)
on conflict (id) do update set public = true;
```

### 3. Policy sul bucket (`storage.objects`)

Il bucket pubblico rende la **lettura** già funzionante senza policy aggiuntive (Supabase serve gli oggetti di un bucket pubblico tramite URL pubblico senza controllare RLS). Servono comunque policy per **scrittura/sostituzione/cancellazione**, ristrette alla propria cartella (`{coach_id}/...`), altrimenti nessun coach autenticato potrebbe caricare nulla (o, peggio, un coach potrebbe scrivere nella cartella di un altro):

```sql
drop policy if exists exercise_videos_storage_coach_insert on storage.objects;
create policy exercise_videos_storage_coach_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists exercise_videos_storage_coach_update on storage.objects;
create policy exercise_videos_storage_coach_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists exercise_videos_storage_coach_delete on storage.objects;
create policy exercise_videos_storage_coach_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

`(storage.foldername(name))[1]` è il primo segmento del path dell'oggetto: l'app carica sempre su `{coach_id}/{exercise_id}/{timestamp}.{ext}` (vedi `uploadExerciseVideo` in `mobile/src/lib/exercise-video-service.ts`), quindi questo confronto garantisce che un coach possa scrivere solo dentro la propria cartella.

## File dell'app coinvolti

- `mobile/src/lib/exercise-video-service.ts` (nuovo): `validateVideoAsset`, `uploadExerciseVideo`, `getExerciseVideo`, `deleteExerciseVideo`, `getCurrentCoachIdForUpload`.
- `mobile/src/components/exercise-video-upload.tsx` (nuovo): controllo di upload per il coach (picker, stati caricamento/errore/successo).
- `mobile/src/components/exercise-video-player.tsx` (esistente, non modificato in questa fase): riproduce `videoUrl` se presente, altrimenti ricade sul vecchio sistema locale (`videoFile`), altrimenti mostra il fallback con icona Play.
- `mobile/src/app/esercizi/[id].tsx`: recupera il video reale (`getExerciseVideo`) all'apertura della schermata; se il ruolo corrente è coach e Supabase è configurato, mostra anche `ExerciseVideoUploadControl`.

## Validazione file (lato app, prima dell'upload)

- Estensione: solo `.mp4`, `.mov`, `.webm` (controllo sempre attivo, è il segnale più affidabile — `mimeType` può mancare su alcune piattaforme).
- `mimeType`: controllato solo se presente (difesa aggiuntiva, non blocca se assente).
- Dimensione: massimo 100MB, controllata solo se il picker restituisce `fileSize` (può mancare in alcuni browser).
- Nessuna validazione lato Storage/database oltre a queste (nessun trigger SQL che rifiuta file — la validazione è solo client-side, in `validateVideoAsset`).

## Come testare — caricamento coach

0. **Se hai già provato l'upload prima di eseguire lo snippet SQL** (errore "Could not find the table 'public.exercise_videos' in the schema cache"): il video era comunque stato caricato con successo su Storage prima che l'insert DB fallisse. Con il fix del 2026-07-11 (vedi sotto), i tentativi futuri puliscono da soli il file in caso di errore DB — ma i file caricati **prima** di questo fix potrebbero essere rimasti orfani nel bucket. Controllare manualmente Storage → `exercise-videos` e rimuovere eventuali file senza una riga corrispondente in `exercise_videos` (Table editor).
1. Eseguire gli snippet SQL sopra (tabella + policy + bucket) su un progetto Supabase reale con `mobile/.env` configurato.
2. Fare login come coach con un account Supabase reale (non demo locale — l'upload richiede una sessione Supabase vera, vedi nota su `coach_id` sopra).
3. Aprire un esercizio dalla libreria (`/esercizi` → un esercizio qualsiasi) o dal dettaglio scheda.
4. Sotto il player video deve comparire il bottone **"Carica video"**.
5. Selezionare un file `.mp4`/`.mov`/`.webm` sotto i 100MB.
6. Verificare: bottone in stato di caricamento (spinner), poi messaggio "Video caricato correttamente." e il player che mostra subito il nuovo video (nessun refresh manuale necessario).
7. Su Supabase: Table editor → `exercise_videos` deve mostrare una riga con `coach_id` = l'uid del coach, `exercise_id` = l'id dell'esercizio, `video_url` valorizzato. Storage → bucket `exercise-videos` → cartella `{coach_id}/{exercise_id}/` deve contenere il file.
8. Ripetere l'upload sullo stesso esercizio: il bottone deve mostrare **"Sostituisci video"**; dopo il secondo upload, verificare che la riga in `exercise_videos` sia stata aggiornata (stesso `id`, nuovo `video_path`/`video_url`) e che il **vecchio file nello Storage sia stato rimosso** (pulizia automatica, evita file orfani).
9. Provare a caricare un file non valido (es. `.pdf` o `.avi`): deve comparire un messaggio di errore ("Formato non supportato...") **senza** tentare l'upload.

## Come testare — visualizzazione cliente

1. Fare login come cliente collegato (tramite `coach_clients`) al coach che ha caricato il video al punto precedente.
2. Aprire lo stesso esercizio (dalla propria scheda assegnata, o da `/esercizi/{id}` se raggiungibile).
3. Il video deve essere visibile e riproducibile (controlli nativi), senza alcun bottone di upload (il cliente non vede mai `ExerciseVideoUploadControl`).
4. Con un secondo cliente collegato a un **coach diverso** che non ha caricato nulla per lo stesso esercizio: verificare che veda il fallback ("Nessun video disponibile" o il video demo statico se quell'esercizio lo aveva) — mai il video del primo coach.

## Compatibilità Web + Expo Go

- **Web**: il picker restituisce un oggetto `File` del browser (`ImagePickerAsset.file`), caricato direttamente su Supabase Storage.
- **Native (Expo Go)**: Supabase sconsiglia esplicitamente `Blob`/`File`/`FormData` su React Native — il file viene letto come stringa base64 (`expo-file-system/legacy`, l'unica API che espone ancora `readAsStringAsync` in questa versione di Expo) e decodificato in `ArrayBuffer` (`base64-arraybuffer`) prima dell'upload.
- Nessun video viene mai incluso nel repository: tutti i file restano solo su Supabase Storage.

## Cosa NON è ancora fatto (onesto, fuori scope di questa fase)

- Nessuna compressione/transcodifica lato server: un video da 100MB viene caricato così com'è.
- Nessuna anteprima/thumbnail generata automaticamente.
- Nessuna eliminazione dall'interfaccia (solo sostituzione tramite ri-caricamento); `deleteExerciseVideo` esiste nel service ma non è ancora collegato a un bottone "Rimuovi video".
- Nessun limite al numero di video totali per coach (solo il limite dei 100MB per singolo file).
- La libreria esercizi resta locale/condivisa: non esiste un flusso per "creare un nuovo esercizio" da Supabase, solo per caricare un video su un esercizio della lista esistente.
