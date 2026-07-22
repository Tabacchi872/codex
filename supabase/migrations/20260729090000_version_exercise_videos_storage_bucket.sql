-- chore: versiona il bucket Storage "exercise-videos" e le sue policy.
--
-- Audit 2026-07-22: il bucket "exercise-videos" (video esercizi caricati dai
-- coach) e la tabella public.exercise_videos risultano creati manualmente sul
-- progetto Supabase reale eseguendo lo snippet SQL di
-- docs/SUPABASE_STORAGE_VIDEO.md — mai una migration datata. Prova indiretta
-- ma concreta: 20260719063205_complete_client_status_management.sql (gia'
-- confermata APPLICATA sul remoto via `supabase migration list`) esegue
-- `drop policy if exists ... on public.exercise_videos` — comando che
-- fallirebbe con "relation does not exist" se la tabella non fosse gia'
-- presente in quel momento. La tabella (e la sua RLS) sono quindi gia'
-- correttamente versionate (quella stessa migration ridefinisce
-- exercise_videos_client_read_own_coach con status='active', piu' stretta
-- della bozza 'active'/'invited' ancora presente nel solo file .md, ormai
-- superato). SOLO il bucket Storage e le policy su storage.objects non sono
-- mai state incluse in una migration: questo file colma quel gap in modo
-- idempotente, senza eliminare/ricreare nulla e senza toccare file gia'
-- caricati.
--
-- Bucket PUBBLICO in lettura: non e' una scorciatoia di comodita'. L'app non
-- usa MAI createSignedUrl per questo bucket, solo getPublicUrl (verificato
-- con grep su tutto mobile/src: l'unico punto che tocca questo bucket e'
-- mobile/src/lib/exercise-video-service.ts, funzioni uploadExerciseVideo/
-- deleteExerciseVideo/linkExerciseVideoToYmove/unlinkExerciseVideoFromYmove).
-- L'autorizzazione per-cliente resta comunque enforced a livello di tabella
-- (RLS exercise_videos_client_read_own_coach, gia' versionata): un cliente
-- riceve l'URL pubblico di un video SOLO se quella RLS lo consente. Il bucket
-- pubblico evita solo la gestione di URL firmati con scadenza — chi conosce
-- gia' l'URL esatto (percorso non enumerabile, include un timestamp) puo'
-- comunque scaricare il file direttamente, stesso compromesso gia' esplicito
-- in docs/SUPABASE_STORAGE_VIDEO.md ("Niente URL firmati/scadenza da
-- gestire in questa fase"), non introdotto ne' esteso da questa migration.
--
-- file_size_limit/allowed_mime_types aggiungono un controllo server-side
-- prima assente (il documento ammette esplicitamente "nessuna validazione
-- lato Storage/database, solo client-side"): stessi valori gia' imposti lato
-- client in exercise-video-service.ts (ALLOWED_MIME_TYPES,
-- MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024 = 104857600 byte) — nessun
-- comportamento nuovo per un upload gia' valido oggi, solo un secondo
-- livello di enforcement per un tentativo che bypassasse la validazione
-- client-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos',
  'exercise-videos',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Percorso reale usato dall'app (uploadExerciseVideo, exercise-video-service.ts):
-- {coachId}/{exerciseId}/{timestamp}.{ext} — (storage.foldername(name))[1] e'
-- quindi sempre il coachId, confrontato con auth.uid(): un coach puo'
-- scrivere/sostituire/eliminare solo dentro la propria cartella, mai in
-- quella di un altro coach. Nomi di policy IDENTICI allo snippet gia'
-- documentato in docs/SUPABASE_STORAGE_VIDEO.md: drop+create sostituisce la
-- riga eventualmente gia' presente sul progetto reale invece di lasciarne
-- una duplicata con un nome diverso.
--
-- Nessuna policy SELECT su storage.objects: il bucket pubblico rende gia' la
-- lettura funzionante tramite l'endpoint pubblico (getPublicUrl), che non
-- passa mai dalla RLS di storage.objects — nessun punto dell'app effettua
-- .list()/.download() autenticato su questo bucket (verificato con grep),
-- quindi una policy SELECT non servirebbe a nulla di reale e non viene
-- aggiunta (principio del minimo privilegio: nessuna policy in piu' di
-- quelle davvero usate).
--
-- with check aggiunto anche sulla policy UPDATE (assente nella bozza .md,
-- presente invece nell'analogo bucket privato client-avatars, stesso
-- progetto, stesso schema) per chiudere lo stesso gap li' gia' evitato:
-- senza un with check simmetrico a using, un UPDATE su storage.objects
-- potrebbe in teoria spostare un oggetto fuori dalla cartella del
-- proprietario. Nessun impatto sull'uso reale dell'app: upload/sostituzione
-- (upsert:true) non cambia mai `name` a meta' operazione.
drop policy if exists exercise_videos_storage_coach_insert on storage.objects;
create policy exercise_videos_storage_coach_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists exercise_videos_storage_coach_update on storage.objects;
create policy exercise_videos_storage_coach_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists exercise_videos_storage_coach_delete on storage.objects;
create policy exercise_videos_storage_coach_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
