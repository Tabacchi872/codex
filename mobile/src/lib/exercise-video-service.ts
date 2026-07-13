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

// Legge il video visibile per l'utente autenticato corrente (coach: il
// proprio; cliente: quello del proprio coach) — la RLS di exercise_videos fa
// tutto il lavoro di scoping, questa funzione non deve sapere il ruolo di chi
// chiama. Ritorna { videoUrl: null } (non un errore) se nessun video esiste o
// se l'utente non ha alcun diritto di lettura su questo esercizio.
export async function getExerciseVideo(exerciseId: string): Promise<VideoServiceResult<{ videoUrl: string } | null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercise_videos')
    .select('video_url')
    .eq('exercise_id', exerciseId)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: error.message };
  }
  return { ok: true, data: data ? { videoUrl: data.video_url } : null };
}

// Rimuove il video del coach autenticato per un esercizio (storage + riga DB).
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

  await supabase.storage.from(EXERCISE_VIDEO_BUCKET).remove([existing.video_path]);
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
