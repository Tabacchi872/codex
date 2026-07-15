import { getExerciseVideo, type ExerciseVideoInfo, type VideoServiceResult } from './exercise-video-service';

// Cache globale in memoria per il risultato di getExerciseVideo, usata SOLO
// dalle card/miniature (components/exercise-thumbnail.tsx): una scheda con
// N esercizi che si rimonta scorrendo la lista, o la stessa scheda vista da
// coach e poi da cliente nella stessa sessione, non deve rifare la stessa
// query a exercise_videos per lo stesso exerciseId ogni volta.
//
// NON va usata per la schermata Dettaglio esercizio (app/esercizi/[id].tsx):
// li' la lettura deve restare sempre fresca (getExerciseVideo diretto), e
// dopo ogni associazione/sostituzione/rimozione di un video va chiamato
// invalidateExerciseVideoInfo cosi' le card che lo mostrano altrove si
// aggiornano al prossimo render invece di restare con un dato ormai vecchio.
type Entry =
  | { status: 'loading'; promise: Promise<VideoServiceResult<ExerciseVideoInfo | null>> }
  | { status: 'done'; result: VideoServiceResult<ExerciseVideoInfo | null> };

const cache = new Map<string, Entry>();

export function invalidateExerciseVideoInfo(exerciseId: string) {
  cache.delete(exerciseId);
}

export function fetchExerciseVideoInfoCached(exerciseId: string): Promise<VideoServiceResult<ExerciseVideoInfo | null>> {
  const existing = cache.get(exerciseId);
  if (existing) {
    return existing.status === 'done' ? Promise.resolve(existing.result) : existing.promise;
  }

  const promise = getExerciseVideo(exerciseId).then((result) => {
    cache.set(exerciseId, { status: 'done', result });
    return result;
  });

  cache.set(exerciseId, { status: 'loading', promise });
  return promise;
}
