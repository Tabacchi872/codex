import { supabase, supabaseConfig } from './supabase';
import { translateYmoveTexts } from './ymove-service';

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

type TextOverrideRow = {
  name: string;
  description: string | null;
  technical_notes: string | null;
};

// Usata dal resolver (hooks/use-exercise-resolver.ts) come fallback quando un
// id non e' tra i 44 esercizi locali: puo' essere un esercizio 'custom' del
// coach o un esercizio 'ymove' condiviso. La RLS decide cosa e' visibile.
//
// 2026-07-13 (correzione): il testo restituito NON e' piu' semplicemente
// quello globale di public.exercises. Si legge SEMPRE anche l'eventuale
// personalizzazione per-coach in exercise_text_overrides (RLS-scoped: il
// coach vede solo la propria, il cliente solo quella del proprio coach) e,
// se presente, SOSTITUISCE name/description/technical_notes globali — mai il
// contrario. Cosi' un coach puo' correggere il proprio testo senza mai
// toccare (ne' essere toccato da) cio' che vedono gli altri coach.
export async function getFitCoachExerciseById(id: string): Promise<FitCoachExerciseServiceResult<Exercise | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase.from('exercises').select(SELECT_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura esercizio: ${error.message}` };
  }
  if (!data) return { ok: true, data: null };

  const base = mapRow(data as ExerciseRow);

  const { data: overrideRow } = await supabase
    .from('exercise_text_overrides')
    .select('name,description,technical_notes')
    .eq('exercise_id', id)
    .maybeSingle();

  if (!overrideRow) {
    return { ok: true, data: base };
  }
  const override = overrideRow as TextOverrideRow;
  return {
    ok: true,
    data: {
      ...base,
      name: override.name,
      description: override.description ?? '',
      technicalNotes: override.technical_notes ?? '',
    },
  };
}

// Elenca tutti gli esercizi 'custom' del coach autenticato (2026-07-13, per
// l'associazione automatica dei video YMove, ymove-auto-link-service.ts):
// oggi non esiste ancora una schermata che li crea (solo lo schema/RLS lo
// prevedono, vedi commento in cima al file), quindi in pratica ritorna un
// elenco vuoto finche' quella funzione non verra' costruita — la query resta
// comunque corretta e pronta per quando esisteranno righe reali.
export async function listCustomExercisesForCoach(coachId: string): Promise<FitCoachExerciseServiceResult<Exercise[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercises')
    .select(SELECT_COLUMNS)
    .eq('coach_id', coachId)
    .eq('source', 'custom');
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura esercizi custom: ${error.message}` };
  }
  return { ok: true, data: (data as ExerciseRow[]).map(mapRow) };
}

// "Aggiungi a FitCoach" (opzione B): controlla se esiste gia' un esercizio
// FitCoach con lo stesso ymove_exercise_id (condiviso tra TUTTI i coach, mai
// duplicato) e lo riusa (nessuna nuova traduzione: gia' fatta la prima
// volta); altrimenti crea un nuovo esercizio copiando i metadati permanenti
// disponibili nell'API (mai video/thumbnail/URL, che scadono e vengono
// sempre richiesti live tramite ymove-service.ts) e traducendo UNA SOLA
// VOLTA title/description/instructions in italiano (se un servizio di
// traduzione e' configurato — altrimenti si importano i testi originali,
// mai una traduzione finta), conservando comunque l'originale YMove
// separatamente in ymove_original_*.
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

  const originalTitle = detail.title;
  const originalDescription = detail.description ?? '';
  const originalInstructions = detail.instructions ?? '';

  // Traduzione una tantum: se AZURE_TRANSLATOR_KEY/REGION non sono
  // configurate lato Edge Function, o la chiamata fallisce per qualunque
  // motivo, translated resta null e si importano i testi originali cosi'
  // come sono — MAI una
  // traduzione inventata. L'originale viene comunque sempre conservato
  // separatamente in ymove_original_* qui sotto, a prescindere dall'esito.
  const translationResult = await translateYmoveTexts({
    title: originalTitle,
    description: originalDescription,
    instructions: originalInstructions,
  });
  const translated = translationResult.ok ? translationResult.data : null;

  const { data: inserted, error: insertError } = await supabase
    .from('exercises')
    .insert({
      coach_id: null,
      name: translated?.title || originalTitle,
      description: translated?.description || detail.description,
      technical_notes: translated?.instructions || detail.instructions,
      ymove_original_title: originalTitle,
      ymove_original_description: detail.description,
      ymove_original_instructions: detail.instructions,
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

export type ExerciseItalianTextInput = {
  name: string;
  description: string;
  technicalNotes: string;
};

// Modifica diretta del testo di un esercizio 'custom' — SOLO per 'custom'
// (l'esercizio appartiene davvero a quel coach, exercises_coach_own_all lo
// permette). Non usare mai per un esercizio 'ymove': la RLS lo impedirebbe
// comunque (solo il superadmin puo' modificare il testo globale condiviso,
// vedi docs/DECISIONS.md, 2026-07-13) — per 'ymove' usare
// upsertExerciseTextOverride sotto.
export async function updateCustomExerciseText(
  exerciseId: string,
  input: ExerciseItalianTextInput,
): Promise<FitCoachExerciseServiceResult<Exercise>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('exercises')
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      technical_notes: input.technicalNotes.trim() || null,
    })
    .eq('id', exerciseId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento testi: ${error.message}` };
  }
  return { ok: true, data: mapRow(data as ExerciseRow) };
}

// Crea/aggiorna la personalizzazione PER-COACH del testo italiano di un
// esercizio 'ymove' condiviso (mai il testo globale di public.exercises,
// mai visibile/modificato da altri coach) — docs/SUPABASE_SCHEMA.sql,
// tabella exercise_text_overrides. coachId deve essere l'id reale della
// sessione Supabase (getCurrentCoachIdForUpload in exercise-video-service.ts,
// stesso principio gia' documentato per l'upload video), mai il mirror
// locale demo.
export async function upsertExerciseTextOverride(
  coachId: string,
  exerciseId: string,
  input: ExerciseItalianTextInput,
): Promise<FitCoachExerciseServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { error } = await supabase.from('exercise_text_overrides').upsert(
    {
      coach_id: coachId,
      exercise_id: exerciseId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      technical_notes: input.technicalNotes.trim() || null,
    },
    { onConflict: 'coach_id,exercise_id' },
  );
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore salvataggio personalizzazione: ${error.message}` };
  }
  return { ok: true, data: null };
}
