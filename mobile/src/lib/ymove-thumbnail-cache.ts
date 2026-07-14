import { getYmoveExerciseDetail } from './ymove-service';

// Cache globale in memoria (module-level, condivisa da OGNI istanza di
// ExerciseThumbnail nell'app, non solo per componente) per la miniatura live
// di un esercizio YMove: la Edge Function ymove-exercises non salva mai
// thumbnailUrl nel database (e' un link firmato che scade), quindi ogni card
// che deve mostrarla la richiederebbe di persona — questa cache evita una
// chiamata ripetuta per lo stesso ymoveExerciseId nella stessa sessione app
// (una lista di 10 esercizi con lo stesso video non fa 10 chiamate) e
// deduplica richieste concorrenti (piu' card dello stesso esercizio montate
// insieme condividono la stessa Promise in volo, invece di partire in
// parallelo).
//
// Nessuna scadenza esplicita: la miniatura resta valida per tutta la sessione
// (coerente con "evita una chiamata ripetuta... nella stessa sessione"
// richiesto esplicitamente). Un refresh completo dell'app resetta la cache.
type CacheEntry = { status: 'loading'; promise: Promise<string | null> } | { status: 'done'; value: string | null };

const cache = new Map<string, CacheEntry>();

// Limite di concorrenza globale (2, richiesto esplicitamente) per le
// richieste di dettaglio usate SOLO per ottenere thumbnailUrl: una lista di
// risultati YMove con molte card non deve sparare N chiamate a getDetail in
// parallelo, ne' consumare piu' del necessario del limite mensile YMove.
const MAX_CONCURRENT_THUMBNAIL_FETCHES = 2;
let activeThumbnailFetches = 0;
const thumbnailFetchQueue: Array<() => void> = [];

function acquireThumbnailFetchSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activeThumbnailFetches < MAX_CONCURRENT_THUMBNAIL_FETCHES) {
        activeThumbnailFetches += 1;
        resolve();
      } else {
        thumbnailFetchQueue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function releaseThumbnailFetchSlot(): void {
  activeThumbnailFetches -= 1;
  const next = thumbnailFetchQueue.shift();
  if (next) next();
}

// Lettura sincrona: `undefined` = non ancora richiesta/risolta (il chiamante
// deve mostrare il fallback lettera e avviare fetchYmoveThumbnail), `null` =
// gia' richiesta ma YMove non ha una thumbnail per questo esercizio.
export function getCachedYmoveThumbnail(ymoveExerciseId: string): string | null | undefined {
  const entry = cache.get(ymoveExerciseId);
  return entry?.status === 'done' ? entry.value : undefined;
}

export function fetchYmoveThumbnail(ymoveExerciseId: string): Promise<string | null> {
  const existing = cache.get(ymoveExerciseId);
  if (existing) {
    return existing.status === 'done' ? Promise.resolve(existing.value) : existing.promise;
  }

  const promise = acquireThumbnailFetchSlot()
    .then(() => getYmoveExerciseDetail(ymoveExerciseId))
    .then((result) => {
      const value = result.ok ? result.data.thumbnailUrl : null;
      cache.set(ymoveExerciseId, { status: 'done', value });
      return value;
    })
    .catch(() => {
      cache.set(ymoveExerciseId, { status: 'done', value: null });
      return null;
    })
    .finally(() => releaseThumbnailFetchSlot());

  cache.set(ymoveExerciseId, { status: 'loading', promise });
  return promise;
}
