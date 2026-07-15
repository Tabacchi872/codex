import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { getCurrentSession } from './auth-service';
import { getSupabaseClientStatus, supabase } from './supabase';

// Video esercizi reali (fase Supabase Storage, 2026-07-11): un coach carica un
// video per un esercizio della libreria locale condivisa (mobile/src/data/
// exercise-library.ts — gli esercizi NON sono in Supabase, exercise_id e' un
// semplice id testuale, non una foreign key). Il video e' sempre scoped a
// (coach_id, exercise_id): vedi docs/SUPABASE_SCHEMA.sql (tabella
// exercise_videos) e docs/SUPABASE_STORAGE_VIDEO.md (bucket + policy Storage).
//
// Nessuna funzione qui lancia eccezioni non gestite: ritornano sempre
// { ok:false, code, message } se Supabase non e' configurato o in caso di
// errore, stesso pattern di auth-service.ts (AuthServiceResult).

export type VideoServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export const EXERCISE_VIDEO_BUCKET = 'exercise-videos';

const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'webm'];
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

function notConfigured<T>(): VideoServiceResult<T> {
  return {
    ok: false,
    code: 'not_configured',
    message:
      "Supabase non e' configurato su questo ambiente (mancano EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY).",
  };
}

function isReady() {
  return getSupabaseClientStatus().ready && supabase !== null;
}

function extensionOf(fileName: string | null | undefined, uri: string) {
  const source = fileName ?? uri;
  const match = source.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : '';
}

function contentTypeFor(extension: string, mimeType: string | null | undefined) {
  if (mimeType) return mimeType;
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  return 'application/octet-stream';
}

export type VideoAssetInput = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  // Oggetto File del browser (solo web, da ImagePickerAsset.file): necessario
  // per l'upload su web, dove non si puo' leggere il filesystem locale.
  webFile?: File | null;
};

// Validazione file: estensione SEMPRE richiesta (mp4/mov/webm — il segnale
// piu' affidabile cross-piattaforma, dato che mimeType puo' mancare su alcune
// piattaforme secondo la documentazione Expo); mimeType controllato solo se
// presente, come difesa aggiuntiva. Dimensione massima 100MB, controllata solo
// se fileSize e' disponibile (puo' mancare su web in alcuni browser).
export function validateVideoAsset(asset: VideoAssetInput): VideoServiceResult<null> {
  const extension = extensionOf(asset.fileName, asset.uri);
  const extensionOk = ALLOWED_EXTENSIONS.includes(extension);
  const mimeOk = asset.mimeType ? ALLOWED_MIME_TYPES.includes(asset.mimeType.toLowerCase()) : true;

  if (!extensionOk || !mimeOk) {
    return { ok: false, code: 'invalid_format', message: 'Formato non supportato. Usa un file MP4, MOV o WEBM.' };
  }
  if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
    return { ok: false, code: 'file_too_large', message: 'Il video supera i 100MB consentiti.' };
  }
  return { ok: true, data: null };
}

// Carica (o sostituisce, upsert) il video di un coach per un esercizio.
// coachId DEVE essere l'id reale della sessione Supabase (getCurrentSession(),
// mai useAuthStore().currentCoachId, che e' l'id del mirror demo locale e non
// coincide con auth.uid() — la RLS di exercise_videos rifiuterebbe l'insert).
export async function uploadExerciseVideo(
  coachId: string,
  exerciseId: string,
  asset: VideoAssetInput
): Promise<VideoServiceResult<{ videoUrl: string }>> {
  if (!isReady() || !supabase) return notConfigured();

  const validation = validateVideoAsset(asset);
  if (!validation.ok) return validation;

  const extension = extensionOf(asset.fileName, asset.uri) || 'mp4';
  const contentType = contentTypeFor(extension, asset.mimeType);
  const path = `${coachId}/${exerciseId}/${Date.now()}.${extension}`;

  try {
    let fileBody: File | ArrayBuffer;
    if (Platform.OS === 'web') {
      if (!asset.webFile) {
        return { ok: false, code: 'upload_error', message: 'File non disponibile per il caricamento su web.' };
      }
      fileBody = asset.webFile;
    } else {
      // Su native (Expo Go/build) supabase-js sconsiglia esplicitamente Blob/
      // File/FormData: si legge il file come base64 (expo-file-system/legacy,
      // l'API "next-gen" senza /legacy non espone piu' readAsStringAsync in
      // questa versione) e si decodifica in ArrayBuffer.
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      fileBody = decode(base64);
    }

    const { error: uploadError } = await supabase.storage
      .from(EXERCISE_VIDEO_BUCKET)
      .upload(path, fileBody, { contentType, upsert: true });
    if (uploadError) {
      return { ok: false, code: 'upload_error', message: uploadError.message };
    }

    const { data: publicUrlData } = supabase.storage.from(EXERCISE_VIDEO_BUCKET).getPublicUrl(path);
    const videoUrl = publicUrlData.publicUrl;

    // Best-effort: rimuove il vecchio file su storage se questo upload
    // sostituisce un video precedente con un path diverso (path include un
    // timestamp, quindi ogni upload e' un file nuovo — senza questa pulizia i
    // vecchi file resterebbero orfani nel bucket). Non blocca l'esito
    // dell'operazione se fallisce: il nuovo video e' comunque gia' salvato.
    const { data: previous } = await supabase
      .from('exercise_videos')
      .select('video_path')
      .eq('coach_id', coachId)
      .eq('exercise_id', exerciseId)
      .maybeSingle();

    const { error: dbError } = await supabase.from('exercise_videos').upsert(
      {
        coach_id: coachId,
        exercise_id: exerciseId,
        video_path: path,
        video_url: videoUrl,
        mime_type: contentType,
        size_bytes: asset.fileSize ?? null,
        // Un file caricato sostituisce sempre un eventuale collegamento
        // YMove precedente (2026-07-13): una riga rappresenta O un file O
        // un collegamento, mai entrambi (vedi exercise_videos_has_source).
        ymove_exercise_id: null,
        ymove_slug: null,
      },
      { onConflict: 'coach_id,exercise_id' }
    );
    if (dbError) {
      // Il file e' gia' su Storage (upload riuscito sopra) ma la riga DB non
      // e' stata scritta: senza questa pulizia resterebbe un file orfano, mai
      // referenziato da nessuna riga e mai piu' raggiungibile dall'app mentre
      // continua a occupare spazio/banda sul bucket. Best-effort: se anche la
      // rimozione fallisse, l'errore originale del DB resta comunque quello
      // mostrato all'utente (non lo si sostituisce con l'errore di pulizia).
      await supabase.storage.from(EXERCISE_VIDEO_BUCKET).remove([path]);
      return { ok: false, code: 'db_error', message: `Caricamento annullato: ${dbError.message}` };
    }

    if (previous?.video_path && previous.video_path !== path) {
      await supabase.storage.from(EXERCISE_VIDEO_BUCKET).remove([previous.video_path]);
    }

    return { ok: true, data: { videoUrl } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'upload_error', message: `Errore imprevisto durante il caricamento: ${message}` };
  }
}

// Struttura discriminata (2026-07-13): una riga exercise_videos rappresenta
// SEMPRE O un file caricato O un collegamento YMove, mai entrambi (vedi
// vincolo exercise_videos_has_source) — `source` lo rende esplicito a
// livello di tipo, cosi' il chiamante non puo' piu' leggere per sbaglio
// `videoUrl` (sempre null per un collegamento YMove) e concludere "nessun
// video": per `source: 'ymove'` l'URL vero va sempre richiesto live tramite
// ymove-service.ts/getYmoveExerciseDetail (mai salvato, scade).
export type ExerciseVideoInfo =
  | { source: 'upload'; videoUrl: string }
  | { source: 'ymove'; ymoveExerciseId: string; ymoveSlug: string | null };

// Legge il video visibile per l'utente autenticato corrente (coach: il
// proprio; cliente: quello del proprio coach) — la RLS di exercise_videos fa
// tutto il lavoro di scoping, questa funzione non deve sapere il ruolo di chi
// chiama. Ritorna null (non un errore) se nessuna riga esiste o se l'utente
// non ha alcun diritto di lettura su questo esercizio.
export async function getExerciseVideo(exerciseId: string): Promise<VideoServiceResult<ExerciseVideoInfo | null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercise_videos')
    .select('video_url,ymove_exercise_id,ymove_slug')
    .eq('exercise_id', exerciseId)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }
  if (!data) return { ok: true, data: null };

  // Il collegamento YMove ha sempre priorita' nel discriminare la sorgente:
  // in quel caso video_url resta sempre null nella riga, ma NON significa
  // "nessun video" — significa "il video e' su YMove, va richiesto live".
  if (data.ymove_exercise_id) {
    return { ok: true, data: { source: 'ymove', ymoveExerciseId: data.ymove_exercise_id, ymoveSlug: data.ymove_slug } };
  }
  if (data.video_url) {
    return { ok: true, data: { source: 'upload', videoUrl: data.video_url } };
  }
  // Riga senza alcuna sorgente valorizzata: non dovrebbe accadere (vincolo DB
  // exercise_videos_has_source lo impedisce), trattata onestamente come
  // "nessun video" invece di propagare un oggetto senza source valido.
  return { ok: true, data: null };
}

// Legge in UNA SOLA query tutte le righe exercise_videos del coach autenticato
// (2026-07-13, per l'associazione automatica dei video YMove,
// ymove-auto-link-service.ts): evita N query separate (una per esercizio) per
// scoprire quali esercizi hanno gia' un video/collegamento — la RLS
// (exercise_videos_coach_own_all) scopa gia' il risultato al solo coach
// chiamante, ma il filtro esplicito su coach_id resta comunque corretto e
// leggibile. Ritorna una mappa exerciseId -> ExerciseVideoInfo.
export async function listExerciseVideosForCoach(
  coachId: string,
): Promise<VideoServiceResult<Record<string, ExerciseVideoInfo>>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercise_videos')
    .select('exercise_id,video_url,ymove_exercise_id,ymove_slug')
    .eq('coach_id', coachId);
  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }

  const map: Record<string, ExerciseVideoInfo> = {};
  for (const row of data ?? []) {
    if (row.ymove_exercise_id) {
      map[row.exercise_id] = { source: 'ymove', ymoveExerciseId: row.ymove_exercise_id, ymoveSlug: row.ymove_slug };
    } else if (row.video_url) {
      map[row.exercise_id] = { source: 'upload', videoUrl: row.video_url };
    }
  }
  return { ok: true, data: map };
}

// Rimuove il video del coach autenticato per un esercizio (storage + riga DB,
// se esiste davvero un file caricato — un collegamento YMove non ha alcun
// file da rimuovere da Storage, vedi unlinkExerciseVideoFromYmove sotto per
// quel caso).
export async function deleteExerciseVideo(coachId: string, exerciseId: string): Promise<VideoServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data: existing, error: readError } = await supabase
    .from('exercise_videos')
    .select('video_path')
    .eq('coach_id', coachId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();
  if (readError) {
    return { ok: false, code: 'db_error', message: readError.message };
  }
  if (!existing) {
    return { ok: true, data: null };
  }

  const { error: deleteRowError } = await supabase
    .from('exercise_videos')
    .delete()
    .eq('coach_id', coachId)
    .eq('exercise_id', exerciseId);
  if (deleteRowError) {
    return { ok: false, code: 'db_error', message: deleteRowError.message };
  }

  // Difensivo: una riga puo' non avere alcun file caricato (solo un
  // collegamento YMove, video_path null) — niente da rimuovere da Storage.
  if (existing.video_path) {
    await supabase.storage.from(EXERCISE_VIDEO_BUCKET).remove([existing.video_path]);
  }
  return { ok: true, data: null };
}

export type ExistingYmoveVideoLink = { exerciseId: string; exerciseName: string | null };

// Controllo anti-duplicati (2026-07-13, richiesto esplicitamente): il coach
// non puo' collegare lo STESSO esercizio YMove a due esercizi diversi nella
// propria libreria. Va chiamata PRIMA di linkExerciseVideoToYmove, cosi' la
// UI puo' mostrare "questo video e' gia' associato a <esercizio>" invece di
// un fallimento generico del vincolo univoco DB (exercise_videos_coach_ymove_
// unique, docs/SUPABASE_SCHEMA.sql — la garanzia reale resta quella, questo
// e' solo per una UX onesta). exerciseName e' sempre null qui: il nome va
// risolto dal chiamante (che conosce sia la libreria locale sia quella
// Supabase, questo servizio no) tramite hooks/use-exercise-resolver.ts.
export async function findExerciseVideoLinkByYmoveId(
  coachId: string,
  ymoveExerciseId: string,
): Promise<VideoServiceResult<ExistingYmoveVideoLink | null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercise_videos')
    .select('exercise_id')
    .eq('coach_id', coachId)
    .eq('ymove_exercise_id', ymoveExerciseId)
    .maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }
  return { ok: true, data: data ? { exerciseId: data.exercise_id, exerciseName: null } : null };
}

// Associa (o sostituisce) il video di un esercizio ESISTENTE (locale storico
// o FitCoach custom/ymove) con un video del catalogo YMove — senza caricare
// alcun file: video_path/video_url restano null, l'URL vero viene sempre
// richiesto live (ymove-service.ts, getYmoveExerciseDetail), mai salvato qui.
// Se l'esercizio aveva un file caricato in precedenza, viene rimosso da
// Storage (stesso principio "nessun file orfano" di uploadExerciseVideo).
// NON controlla da sola i duplicati: il chiamante deve aver gia' chiamato
// findExerciseVideoLinkByYmoveId e deciso di procedere comunque (o l'utente
// sta ri-collegando lo stesso video allo stesso esercizio, caso idempotente).
export async function linkExerciseVideoToYmove(
  coachId: string,
  exerciseId: string,
  ymoveExerciseId: string,
  ymoveSlug: string | null,
): Promise<VideoServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data: previous } = await supabase
    .from('exercise_videos')
    .select('video_path')
    .eq('coach_id', coachId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();

  const { error } = await supabase.from('exercise_videos').upsert(
    {
      coach_id: coachId,
      exercise_id: exerciseId,
      video_path: null,
      video_url: null,
      mime_type: null,
      size_bytes: null,
      ymove_exercise_id: ymoveExerciseId,
      ymove_slug: ymoveSlug,
    },
    { onConflict: 'coach_id,exercise_id' },
  );
  if (error) {
    if (error.message.toLowerCase().includes('exercise_videos_coach_ymove_unique')) {
      return {
        ok: false,
        code: 'ymove_already_linked',
        message: 'Questo video YMove e\' gia\' collegato a un altro esercizio della tua libreria.',
      };
    }
    return { ok: false, code: 'db_error', message: `Errore collegamento video: ${error.message}` };
  }

  if (previous?.video_path) {
    await supabase.storage.from(EXERCISE_VIDEO_BUCKET).remove([previous.video_path]);
  }
  return { ok: true, data: null };
}

// Rimuove SOLO il collegamento YMove di un esercizio, lasciando invariato un
// eventuale file caricato separatamente (che in pratica non puo' coesistere,
// vedi linkExerciseVideoToYmove — ma la funzione resta corretta anche se in
// futuro cambiasse). Se dopo la rimozione la riga non ha piu' ne' un file ne'
// un collegamento, la riga stessa viene eliminata (pulizia, nessuna riga
// "vuota" lasciata in giro).
export async function unlinkExerciseVideoFromYmove(coachId: string, exerciseId: string): Promise<VideoServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data: existing, error: readError } = await supabase
    .from('exercise_videos')
    .select('video_path')
    .eq('coach_id', coachId)
    .eq('exercise_id', exerciseId)
    .maybeSingle();
  if (readError) {
    return { ok: false, code: 'db_error', message: readError.message };
  }
  if (!existing) {
    return { ok: true, data: null };
  }

  if (existing.video_path) {
    const { error } = await supabase
      .from('exercise_videos')
      .update({ ymove_exercise_id: null, ymove_slug: null })
      .eq('coach_id', coachId)
      .eq('exercise_id', exerciseId);
    if (error) {
      return { ok: false, code: 'db_error', message: `Errore rimozione collegamento: ${error.message}` };
    }
    return { ok: true, data: null };
  }

  const { error: deleteError } = await supabase
    .from('exercise_videos')
    .delete()
    .eq('coach_id', coachId)
    .eq('exercise_id', exerciseId);
  if (deleteError) {
    return { ok: false, code: 'db_error', message: `Errore rimozione collegamento: ${deleteError.message}` };
  }
  return { ok: true, data: null };
}

// Id reale del coach autenticato su Supabase (auth.uid()), da usare SEMPRE per
// coachId negli upload — mai useAuthStore().currentCoachId. Ritorna null se
// non c'e' una sessione Supabase attiva (account demo locale, o Supabase non
// configurato).
export async function getCurrentCoachIdForUpload(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return null;
  return session.data.user.id;
}
