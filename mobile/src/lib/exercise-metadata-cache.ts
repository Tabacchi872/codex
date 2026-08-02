import { getExerciseById } from '@/data/exercise-library';
import { getFitCoachExercisesByIds } from './fitcoach-exercises-service';
import { supabaseConfig } from './supabase';
import type { Exercise } from '@/types/training';

// Cache di modulo (in memoria, per tutta la sessione app finche' resta
// aperta la scheda/tab del browser — MAI persistita su disco/AsyncStorage):
// evita di rifare la query batch ogni volta che una schermata che risolve
// esercizi Supabase (custom/ymove) viene rimontata (es. Scheda modello ->
// dettaglio esercizio -> indietro). Contiene solo metadati statici
// (nome/descrizione/muscoli/ecc.), MAI url video firmate YMove (quelle
// restano sempre richieste live da ymove-service.ts, mai salvate qui ne'
// altrove — vedi anche exercise-video-service.ts).
const cache = new Map<string, Exercise>();

// Risoluzione sincrona: prima i 44 esercizi storici locali (sempre gia'
// disponibili, nessun fetch), poi la cache Supabase sopra. Ritorna
// undefined se l'id non e' ancora stato risolto — il chiamante decide come
// mostrarlo (skeleton mentre il batch e' in corso, "Esercizio non
// disponibile" se il batch e' gia' completato e l'id resta assente).
export function getCachedExerciseMetadata(id: string): Exercise | undefined {
  return getExerciseById(id) ?? cache.get(id);
}

// 'ok': batch riuscito (anche se alcuni id restano genuinamente assenti dal
// catalogo — il chiamante lo distingue confrontando getCachedExerciseMetadata
// dopo). 'error': la query e' fallita (rete/DB) — nessun id e' stato scritto
// in cache, quindi NON equivale a "esercizio inesistente": il chiamante deve
// mostrare uno stato di errore distinto e permettere un retry, mai
// "Esercizio non disponibile" (quello e' riservato a un batch riuscito che
// semplicemente non trova quell'id).
export type MetadataLoadStatus = 'ok' | 'error';

// Carica in UNA query batch tutti gli id Supabase non ancora risolti (mai
// una query per esercizio). Gli id gia' locali o gia' in cache vengono
// esclusi prima di interrogare Supabase. Su errore la cache resta invariata
// (nessuna scrittura parziale/di comodo): un retry successivo (nuovo mount o
// chiamata esplicita) ritenta esattamente gli stessi id mancanti.
export async function ensureExerciseMetadataLoaded(ids: string[]): Promise<MetadataLoadStatus> {
  const missing = [...new Set(ids)].filter((id) => id && !getExerciseById(id) && !cache.has(id));
  if (missing.length === 0 || !supabaseConfig.isConfigured) return 'ok';

  const result = await getFitCoachExercisesByIds(missing);
  if (result.ok) {
    for (const [id, exercise] of Object.entries(result.data)) {
      cache.set(id, exercise);
    }
    return 'ok';
  }
  if (__DEV__) {
    console.warn('EXERCISE_METADATA_BATCH_FETCH_FAILED', { ids: missing, message: result.message });
  }
  return 'error';
}
