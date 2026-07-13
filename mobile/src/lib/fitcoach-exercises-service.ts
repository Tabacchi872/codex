import { supabase, supabaseConfig } from './supabase';

import type { Exercise } from '@/types/training';
import type { YmoveExerciseDetail } from './ymove-service';

// Esercizi FitCoach su Supabase (public.exercises, docs/SUPABASE_SCHEMA.sql):
// coesistono con i 44 esercizi storici locali (data/exercise-library.ts), MAI
// li sostituiscono. Due origini: 'custom' (creato a mano da un coach, non
// implementato in questo intervento — solo lo schema/RLS lo prevedono) e
// 'ymove' (importato dal catalogo YMove, condiviso tra tutti i coach).

export type FitCoachExerciseServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_configured' | 'db_error'; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile leggere gli esercizi FitCoach.';

function notConfigured<T>(): FitCoachExerciseServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type ExerciseRow = {
  id: string;
  name: string;
  description: string | null;
  technical_notes: string | null;
  muscle_group: string | null;
  equipment: string | null;
  difficulty: string | null;
  source: 'custom' | 'ymove';
  ymove_exercise_id: string | null;
  ymove_slug: string | null;
};

const SELECT_COLUMNS =
  'id,name,description,technical_notes,muscle_group,equipment,difficulty,source,ymove_exercise_id,ymove_slug';

function mapRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group ?? '',
    description: row.description ?? '',
    technicalNotes: row.technical_notes ?? '',
    difficulty: row.difficulty ?? 'beginner',
    equipment: row.equipment ?? '',
    // Nessun significato per un esercizio Supabase: il video 'ymove' e'
    // sempre live (mai salvato), il video 'custom' passa da exercise_videos
    // (gia' esistente, invariato) — mai da questi due campi legacy.
    videoFile: '',
    videoStatus: 'missing',
    source: row.source,
    ymoveExerciseId: row.ymove_exercise_id ?? undefined,
    ymoveSlug: row.ymove_slug ?? undefined,
  };
}

// Usata dal resolver (hooks/use-exercise-resolver.ts) come fallback quando un
// id non e' tra i 44 esercizi locali: puo' essere un esercizio 'custom' del
// coach o un esercizio 'ymove' condiviso. La RLS decide cosa e' visibile.
export async function getFitCoachExerciseById(id: string): Promise<FitCoachExerciseServiceResult<Exercise | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase.from('exercises').select(SELECT_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura esercizio: ${error.message}` };
  }
  return { ok: true, data: data ? mapRow(data as ExerciseRow) : null };
}

// "Aggiungi a FitCoach" (opzione B): controlla se esiste gia' un esercizio
// FitCoach con lo stesso ymove_exercise_id (condiviso tra TUTTI i coach, mai
// duplicato) e lo riusa; altrimenti crea un nuovo esercizio copiando solo i
// metadati permanenti disponibili nell'API (mai video/thumbnail/URL, che
// scadono e vengono sempre richiesti live tramite ymove-service.ts).
export async function createOrReuseExerciseFromYmove(
  detail: YmoveExerciseDetail,
): Promise<FitCoachExerciseServiceResult<Exercise>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data: existing, error: existingError } = await supabase
    .from('exercises')
    .select(SELECT_COLUMNS)
    .eq('ymove_exercise_id', detail.id)
    .eq('source', 'ymove')
    .maybeSingle();
  if (existingError) {
    return { ok: false, code: 'db_error', message: `Errore verifica esercizio esistente: ${existingError.message}` };
  }
  if (existing) {
    return { ok: true, data: mapRow(existing as ExerciseRow) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('exercises')
    .insert({
      coach_id: null,
      name: detail.title,
      description: detail.description,
      technical_notes: detail.instructions,
      muscle_group: detail.muscleGroup,
      equipment: detail.equipment,
      difficulty: detail.difficulty,
      // exercise_type e' una singola colonna text, ma il campo ufficiale
      // YMove e' un array: uniamo con virgola invece di scartare i valori
      // extra o cambiare lo schema per un campo puramente informativo.
      // Array.isArray difensivo: ymove-service.ts normalizza gia' sempre a
      // string[], ma non ci si affida solo a quello (YMove non lo garantisce).
      exercise_type: Array.isArray(detail.exerciseType) && detail.exerciseType.length > 0
        ? detail.exerciseType.join(', ')
        : null,
      source: 'ymove',
      ymove_exercise_id: detail.id,
      ymove_slug: detail.slug,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (insertError) {
    // Race condition: un altro coach ha importato lo stesso esercizio nel
    // frattempo (vincolo univoco su ymove_exercise_id, codice 23505) — non e'
    // un errore reale, si rilegge e si riusa la riga di chi ci ha preceduto
    // invece di mostrare un fallimento all'utente.
    if (insertError.code === '23505') {
      const { data: raceExisting } = await supabase
        .from('exercises')
        .select(SELECT_COLUMNS)
        .eq('ymove_exercise_id', detail.id)
        .eq('source', 'ymove')
        .maybeSingle();
      if (raceExisting) return { ok: true, data: mapRow(raceExisting as ExerciseRow) };
    }
    return { ok: false, code: 'db_error', message: `Errore creazione esercizio: ${insertError.message}` };
  }

  return { ok: true, data: mapRow(inserted as ExerciseRow) };
}
