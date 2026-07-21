import { supabase, supabaseConfig } from './supabase';
import { isWorkoutSessionCompleted } from './workout-progress';

import type { TechniqueType, WorkoutExercise, WorkoutPlan, WorkoutSessionStatus } from '@/types/training';

// Servizio Supabase per schede/allenamenti (2026-07-14): sostituisce
// Zustand/AsyncStorage (store/training-store.ts) come fonte principale dei
// dati tra coach e cliente — vedi docs/SUPABASE_SCHEMA.sql (sezione
// "Migrazione schede e allenamenti a Supabase") per lo schema completo
// (workout_plans/workout_days/workout_day_exercises/workout_templates) e le
// RPC atomiche (save_workout_plan, update_workout_session_progress).
//
// Il modello TS (WorkoutPlan.exercises, array piatto) resta INVARIATO: il
// livello "workout_days" e' gestito qui in modo trasparente (sempre un solo
// giorno implicito, day_order=1) — nessuna schermata deve sapere che esiste.

export type WorkoutPlanServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile leggere/salvare le schede.';

function notConfigured<T>(): WorkoutPlanServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un WorkoutPlan/WorkoutExercise creato lato client PRIMA del primo
// salvataggio ha un id placeholder testuale o numerico (es. "1", "we-1",
// "plan-1730000000") — MAI un UUID valido, perche' non e' ancora stato
// generato da Postgres. Distinguere questo caso e' essenziale in OGNI punto
// che invia un id a Supabase: sia alla RPC save_workout_plan (che fa
// `::uuid` sull'id per decidere insert/update) sia a una query diretta
// (`.eq('id', ...)`, `.rpc(..., { p_plan_id: ... })` con un parametro tipato
// `uuid`) — un id placeholder in uno qualunque di questi punti fa fallire la
// chiamata con "invalid input syntax for type uuid" (bug reale corretto
// 2026-07-14: il controllo esisteva solo nel payload di save_workout_plan,
// non in deleteWorkoutPlan ne' in updateWorkoutSessionProgress).
export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

type WorkoutDayExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_order: number;
  sets: number;
  reps: number;
  reps_min: number | null;
  reps_max: number | null;
  target_weight: number | null;
  rest_seconds: number;
  notes: string | null;
  technique_type: string;
  superset_group_id: string | null;
  completed: boolean;
};

type WorkoutDayRow = {
  id: string;
  day_order: number;
  workout_day_exercises: WorkoutDayExerciseRow[];
};

type WorkoutPlanRow = {
  id: string;
  coach_id: string;
  client_id: string;
  template_id: string | null;
  sequence_order: number | null;
  name: string;
  start_date: string;
  expiry_date: string;
  scheduled_time: string | null;
  session_status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  day_label: string | null;
  week_label: string | null;
  subscription_id: string | null;
  workout_days: WorkoutDayRow[];
};

// day_order/workout_day_exercises: il "giorno" e' un dettaglio implementativo
// (vedi commento in cima al file) — non esposto nel tipo WorkoutPlan, TRANNE
// il suo id (workout_days.id), esposto come workoutDayId: serve
// all'agenda per collegare un appuntamento al giorno esatto (vedi
// types/training.ts). template_id/sequence_order servono a raggruppare i
// giorni di uno stesso programma e a proporre il prossimo pending
// (lib/workout-sequence.ts) — mai scritti da questo file (solo letti: il
// salvataggio resta esclusivamente via save_workout_template/
// assign_workout_template_to_client, non toccati).
const SELECT_WORKOUT_PLAN =
  'id,coach_id,client_id,template_id,sequence_order,name,start_date,expiry_date,scheduled_time,session_status,started_at,completed_at,duration_seconds,day_label,week_label,subscription_id,' +
  'workout_days(id,day_order,workout_day_exercises(id,exercise_id,exercise_order,sets,reps,reps_min,reps_max,target_weight,rest_seconds,notes,technique_type,superset_group_id,completed))';

function mapRowToPlan(row: WorkoutPlanRow): WorkoutPlan {
  const day = row.workout_days.find((d) => d.day_order === 1) ?? row.workout_days[0];
  const dayExercises = day?.workout_day_exercises ?? [];
  const sorted = [...dayExercises].sort((a, b) => a.exercise_order - b.exercise_order);
  const completedExerciseIds = dayExercises.filter((e) => e.completed).map((e) => e.id);

  const exercises: WorkoutExercise[] = sorted.map((e) => ({
    id: e.id,
    exerciseId: e.exercise_id,
    sets: e.sets,
    reps: e.reps,
    repsMin: e.reps_min ?? undefined,
    repsMax: e.reps_max ?? undefined,
    targetWeight: e.target_weight,
    restSeconds: e.rest_seconds,
    notes: e.notes ?? '',
    order: e.exercise_order,
    techniqueType: (e.technique_type as TechniqueType) || 'normal',
    supersetGroupId: e.superset_group_id ?? undefined,
  }));

  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    coachId: row.coach_id,
    templateId: row.template_id,
    sequenceOrder: row.sequence_order,
    workoutDayId: day?.id,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    scheduledTime: row.scheduled_time ?? undefined,
    dayLabel: row.day_label ?? undefined,
    weekLabel: row.week_label ?? undefined,
    subscriptionId: row.subscription_id ?? undefined,
    sessionStatus: (row.session_status as WorkoutSessionStatus) || 'todo',
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    completedExerciseIds,
    exercises,
  };
}

function buildSavePayload(plan: WorkoutPlan) {
  return {
    id: isValidUuid(plan.id) ? plan.id : null,
    coach_id: plan.coachId ?? null,
    client_id: plan.clientId,
    name: plan.name,
    start_date: plan.startDate,
    expiry_date: plan.expiryDate,
    scheduled_time: plan.scheduledTime ?? null,
    session_status: plan.sessionStatus ?? 'todo',
    day_label: plan.dayLabel ?? null,
    week_label: plan.weekLabel ?? null,
    subscription_id: plan.subscriptionId ?? null,
    exercises: plan.exercises.map((e) => ({
      id: isValidUuid(e.id) ? e.id : null,
      exercise_id: e.exerciseId,
      exercise_order: e.order,
      sets: e.sets,
      reps: e.reps,
      reps_min: e.repsMin ?? null,
      reps_max: e.repsMax ?? null,
      target_weight: e.targetWeight,
      rest_seconds: e.restSeconds,
      notes: e.notes ?? '',
      technique_type: e.techniqueType ?? 'normal',
      superset_group_id: e.supersetGroupId ?? null,
    })),
  };
}

// Messaggi/codici della RPC save_workout_plan (docs/SUPABASE_SCHEMA.sql):
// sempre "CODICE: messaggio", stesso pattern gia' usato da
// register_client_with_code in auth-service.ts.
function describeSaveError(message: string): { code: string; friendly: string } {
  if (message.includes('NOT_YOUR_CLIENT')) {
    return { code: 'not_your_client', friendly: 'Questo cliente non risulta collegato al tuo account coach.' };
  }
  if (message.includes('FORBIDDEN')) {
    return { code: 'forbidden', friendly: 'Non sei autorizzato a modificare questa scheda.' };
  }
  if (message.includes('NOT_FOUND')) {
    return { code: 'not_found', friendly: 'Scheda non trovata (potrebbe essere stata eliminata).' };
  }
  if (message.includes('INVALID_PAYLOAD')) {
    return { code: 'invalid_payload', friendly: 'Dati della scheda non validi.' };
  }
  if (message.includes('NOT_AUTHENTICATED')) {
    return { code: 'not_authenticated', friendly: 'Sessione scaduta: effettua di nuovo il login.' };
  }
  return { code: 'db_error', friendly: `Errore durante il salvataggio della scheda: ${message}` };
}

async function saveWorkoutPlanInternal(plan: WorkoutPlan): Promise<WorkoutPlanServiceResult<WorkoutPlan>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (!plan.coachId) {
    return { ok: false, code: 'invalid_payload', message: 'Coach mancante: impossibile salvare la scheda.' };
  }

  console.log('WORKOUT_REMOTE_SAVE_START', {});
  const payload = buildSavePayload(plan);
  const { data, error } = await supabase.rpc('save_workout_plan', { payload });
  if (error) {
    console.error('WORKOUT_REMOTE_SAVE_ERROR', { message: error.message });
    const { code, friendly } = describeSaveError(error.message);
    return { ok: false, code, message: friendly };
  }

  const planId = data as string;
  const fetched = await getWorkoutPlanById(planId);
  if (!fetched.ok) return fetched;
  if (!fetched.data) {
    return { ok: false, code: 'not_found', message: 'Scheda salvata ma non piu\' leggibile subito dopo.' };
  }
  console.log('WORKOUT_REMOTE_SAVE_SUCCESS', {});
  return { ok: true, data: fetched.data };
}

// Crea una nuova scheda: se plan.id NON e' un UUID (caso normale, generato
// solo lato client come placeholder — vedi isValidUuid sopra), Postgres ne genera
// uno nuovo; il valore ritornato (fetched.data.id) e' SEMPRE quello reale.
export async function createWorkoutPlan(plan: WorkoutPlan): Promise<WorkoutPlanServiceResult<WorkoutPlan>> {
  return saveWorkoutPlanInternal(plan);
}

// Aggiorna la struttura di una scheda esistente (nome/date/esercizi/serie/
// ripetizioni/ecc.). Per il solo avanzamento di sessione (stato/timer/
// completamento esercizi, anche lato CLIENTE) usare
// updateWorkoutSessionProgress sotto, mai questa funzione.
export async function updateWorkoutPlan(plan: WorkoutPlan): Promise<WorkoutPlanServiceResult<WorkoutPlan>> {
  return saveWorkoutPlanInternal(plan);
}

export async function deleteWorkoutPlan(id: string): Promise<WorkoutPlanServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (!isValidUuid(id)) {
    // Bug reale corretto (2026-07-14): un piano con un id placeholder locale
    // (mai salvato su Supabase) non ha alcuna riga remota da eliminare —
    // `.eq('id', id)` su una colonna uuid con un valore come "1" farebbe
    // fallire la query con "invalid input syntax for type uuid" prima
    // ancora di poter verificare che la riga semplicemente non esiste.
    // Successo no-op: il chiamante rimuove comunque la voce dallo store
    // locale (mobile/src/app/schede/[id].tsx, handleDelete).
    return { ok: true, data: null };
  }
  const { error } = await supabase.from('workout_plans').delete().eq('id', id);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore eliminazione scheda: ${error.message}` };
  }
  return { ok: true, data: null };
}

// Legge TUTTE le schede visibili all'utente autenticato corrente — nessun
// filtro esplicito lato client: la RLS (workout_plans_coach_scope per il
// coach, workout_plans_client_read per il cliente, docs/SUPABASE_SCHEMA.sql)
// decide da sola cosa restituire, in base al ruolo di chi chiama.
export async function listWorkoutPlansForCurrentUser(): Promise<WorkoutPlanServiceResult<WorkoutPlan[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  console.log('WORKOUT_REMOTE_LOAD', {});
  const { data, error } = await supabase.from('workout_plans').select(SELECT_WORKOUT_PLAN);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore caricamento schede: ${error.message}` };
  }
  return { ok: true, data: (data as unknown as WorkoutPlanRow[]).map(mapRowToPlan) };
}

export async function getWorkoutPlanById(id: string): Promise<WorkoutPlanServiceResult<WorkoutPlan | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('workout_plans').select(SELECT_WORKOUT_PLAN).eq('id', id).maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore caricamento scheda: ${error.message}` };
  }
  if (!data) return { ok: true, data: null };
  return { ok: true, data: mapRowToPlan(data as unknown as WorkoutPlanRow) };
}

export type WorkoutSessionProgressUpdate = {
  sessionStatus?: WorkoutSessionStatus;
  // null = azzera esplicitamente (richiesto da "Fine allenamento"),
  // undefined = non toccare, una stringa ISO = imposta quel valore.
  startedAt?: string | null;
  completedAt?: string;
  durationSeconds?: number;
  // Sostituisce l'INTERO insieme di esercizi completati (stesso semantica di
  // WorkoutPlan.completedExerciseIds): mai un delta additivo.
  completedExerciseIds?: string[];
};

// Unica funzione per gli aggiornamenti di sessione consentiti ANCHE al
// cliente (stato Da fare/Completato/Saltato/Annullato, timer Inizia/Fine
// allenamento, checkbox esercizio completato/cardio) — passa sempre dalla
// RPC update_workout_session_progress (security definer): mai una scrittura
// diretta su serie/ripetizioni/peso/struttura da questa funzione.
export async function updateWorkoutSessionProgress(
  planId: string,
  update: WorkoutSessionProgressUpdate,
): Promise<WorkoutPlanServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (!isValidUuid(planId)) {
    // Bug reale corretto (2026-07-14): il parametro p_plan_id della RPC e'
    // tipato `uuid` — passare un id placeholder locale (mai salvato su
    // Supabase) fa fallire la chiamata con "invalid input syntax for type
    // uuid" ancora PRIMA che il corpo della funzione venga eseguito. Non
    // c'e' nulla da sincronizzare per un piano che non esiste ancora
    // remotamente: successo no-op, l'aggiornamento ottimistico locale
    // (mobile/src/app/schede/[id].tsx) resta comunque valido.
    return { ok: true, data: null };
  }

  const { data: planRow, error: loadError } = await supabase.from('workout_plans').select(SELECT_WORKOUT_PLAN).eq('id', planId).maybeSingle();
  if (loadError) {
    return { ok: false, code: 'db_error', message: `Errore caricamento scheda: ${loadError.message}` };
  }
  if (!planRow) {
    return { ok: false, code: 'not_found', message: 'Scheda non trovata o non accessibile.' };
  }
  if (isWorkoutSessionCompleted(mapRowToPlan(planRow as unknown as WorkoutPlanRow))) {
    return { ok: false, code: 'workout_locked', message: 'Questo workout è già completato e non può essere modificato.' };
  }

  const clearStartedAt = update.startedAt === null;
  const { error } = await supabase.rpc('update_workout_session_progress', {
    p_plan_id: planId,
    p_session_status: update.sessionStatus ?? null,
    p_started_at: clearStartedAt ? null : (update.startedAt ?? null),
    p_clear_started_at: clearStartedAt,
    p_completed_at: update.completedAt ?? null,
    p_duration_seconds: update.durationSeconds ?? null,
    p_completed_exercise_ids: update.completedExerciseIds ? update.completedExerciseIds.filter(isValidUuid) : null,
  });
  if (error) {
    if (error.message.includes('WORKOUT_LOCKED')) {
      return { ok: false, code: 'workout_locked', message: 'Questo workout è già completato e non può essere modificato.' };
    }
    if (error.message.includes('CLIENT_NOT_ACTIVE')) {
      return { ok: false, code: 'client_not_active', message: 'Questo cliente non è più attivo: non puoi modificare la sua scheda.' };
    }
    return { ok: false, code: 'db_error', message: `Errore aggiornamento sessione: ${error.message}` };
  }
  return { ok: true, data: null };
}

// --- Libreria globale di modelli del coach (cartelle + workout_templates) -
// Sostituisce il precedente scaffold morto (mai usato da alcuna schermata):
// ora comprende cartelle/sottocartelle (template_folders), esercizi del
// modello (workout_template_exercises) e l'assegnazione a un cliente come
// COPIA indipendente (RPC assign_workout_template_to_client). Vedi
// types/template-library.ts per la distinzione da WorkoutPlan (scheda reale
// assegnata) e WorkoutPlanTemplate (i 7 modelli statici predefiniti,
// invariati).
import type { TemplateExercise, TemplateFolder, TemplateFolderDeleteMode, WorkoutTemplate, WorkoutTemplateSummary } from '@/types/template-library';

type TemplateFolderRow = {
  id: string;
  parent_folder_id: string | null;
  name: string;
  sort_order: number;
};

function mapFolderRow(row: TemplateFolderRow): TemplateFolder {
  return { id: row.id, parentFolderId: row.parent_folder_id, name: row.name, sortOrder: row.sort_order };
}

const SELECT_FOLDER_COLUMNS = 'id,parent_folder_id,name,sort_order';

function describeTemplateLibraryError(message: string, fallback: string): { code: string; friendly: string } {
  if (message.includes('NOT_AUTHENTICATED')) {
    return { code: 'not_authenticated', friendly: 'Sessione scaduta: effettua di nuovo il login.' };
  }
  if (message.includes('FORBIDDEN')) {
    return { code: 'forbidden', friendly: 'Non sei autorizzato per questa operazione.' };
  }
  if (message.includes('NOT_FOUND')) {
    return { code: 'not_found', friendly: 'Elemento non trovato (potrebbe essere stato eliminato).' };
  }
  if (message.includes('INVALID_PAYLOAD')) {
    return { code: 'invalid_payload', friendly: fallback };
  }
  if (message.includes('CLIENT_NOT_ACTIVE')) {
    return { code: 'client_not_active', friendly: 'Puoi assegnare una scheda modello solo a un cliente active.' };
  }
  return { code: 'db_error', friendly: `${fallback}: ${message}` };
}

// Tutte le cartelle del coach corrente (RLS-scoped): le schermate filtrano
// client-side per parentFolderId per mostrare un livello alla volta, e usano
// l'elenco completo per il selettore "Sposta in altra cartella".
export async function listTemplateFolders(): Promise<WorkoutPlanServiceResult<TemplateFolder[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('template_folders').select(SELECT_FOLDER_COLUMNS).order('name');
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura cartelle: ${error.message}` };
  }
  return { ok: true, data: (data as TemplateFolderRow[]).map(mapFolderRow) };
}

export async function createTemplateFolder(
  coachId: string,
  input: { name: string; parentFolderId: string | null },
): Promise<WorkoutPlanServiceResult<TemplateFolder>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase
    .from('template_folders')
    .insert({ coach_id: coachId, parent_folder_id: input.parentFolderId, name: input.name })
    .select(SELECT_FOLDER_COLUMNS)
    .single();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore creazione cartella: ${error.message}` };
  }
  return { ok: true, data: mapFolderRow(data as TemplateFolderRow) };
}

export async function renameTemplateFolder(id: string, name: string): Promise<WorkoutPlanServiceResult<TemplateFolder>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('template_folders').update({ name }).eq('id', id).select(SELECT_FOLDER_COLUMNS).single();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore rinomina cartella: ${error.message}` };
  }
  return { ok: true, data: mapFolderRow(data as TemplateFolderRow) };
}

export async function deleteTemplateFolder(id: string, mode: TemplateFolderDeleteMode): Promise<WorkoutPlanServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error } = await supabase.rpc('delete_template_folder', { p_folder_id: id, p_mode: mode });
  if (error) {
    const { code, friendly } = describeTemplateLibraryError(error.message, 'Errore eliminazione cartella');
    return { ok: false, code, message: friendly };
  }
  return { ok: true, data: null };
}

type TemplateExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_order: number;
  sets: number;
  reps: number;
  reps_min: number | null;
  reps_max: number | null;
  target_weight: number | null;
  rest_seconds: number;
  notes: string | null;
  technique_type: string;
  superset_group_id: string | null;
  rpe_rir: string | null;
};

type TemplateDayRow = {
  id: string;
  name: string;
  focus: string | null;
  sort_order: number;
  estimated_duration_minutes: number | null;
  workout_template_exercises: TemplateExerciseRow[];
};

type WorkoutTemplateRow = {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  sort_order: number;
  duration_weeks: number | null;
  sessions_per_week: number | null;
  estimated_session_minutes: number | null;
  equipment: string | null;
  location: string | null;
  training_style: string | null;
  muscle_focus: string | null;
  intensity: string | null;
  progression_notes: string | null;
  deload_week: boolean;
  is_system: boolean;
  source_template_id: string | null;
  workout_template_days: TemplateDayRow[];
};

type WorkoutTemplateSummaryRow = {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  goal: string | null;
  level: string | null;
  sort_order: number;
  duration_weeks: number | null;
  sessions_per_week: number | null;
  estimated_session_minutes: number | null;
  equipment: string | null;
  location: string | null;
  training_style: string | null;
  muscle_focus: string | null;
  intensity: string | null;
  is_system: boolean;
  workout_template_days: { id: string; workout_template_exercises: { exercise_id: string }[] }[];
};

const TEMPLATE_METADATA_COLUMNS =
  'id,folder_id,name,description,goal,level,sort_order,duration_weeks,sessions_per_week,estimated_session_minutes,' +
  'equipment,location,training_style,muscle_focus,intensity,progression_notes,deload_week,is_system,source_template_id';

const SELECT_TEMPLATE_DETAIL =
  `${TEMPLATE_METADATA_COLUMNS},` +
  'workout_template_days(id,name,focus,sort_order,estimated_duration_minutes,' +
  'workout_template_exercises(id,exercise_id,exercise_order,sets,reps,reps_min,reps_max,target_weight,rest_seconds,notes,technique_type,superset_group_id,rpe_rir))';

// workout_template_exercises(exercise_id) invece di (count): serve il
// filtro/ricerca per esercizio nella libreria (template-library-screen.tsx),
// che deve poter cercare per nome esercizio senza scaricare l'intero
// modello (serie/reps/note) per ogni riga della lista.
const SELECT_TEMPLATE_SUMMARY =
  'id,folder_id,name,description,goal,level,sort_order,duration_weeks,sessions_per_week,estimated_session_minutes,' +
  'equipment,location,training_style,muscle_focus,intensity,is_system,workout_template_days(id,workout_template_exercises(exercise_id))';

function mapTemplateExerciseRow(e: TemplateExerciseRow): TemplateExercise {
  return {
    id: e.id,
    exerciseId: e.exercise_id,
    order: e.exercise_order,
    sets: e.sets,
    reps: e.reps,
    repsMin: e.reps_min ?? undefined,
    repsMax: e.reps_max ?? undefined,
    targetWeight: e.target_weight,
    restSeconds: e.rest_seconds,
    notes: e.notes ?? '',
    rpeRir: e.rpe_rir ?? undefined,
    techniqueType: (e.technique_type as TechniqueType) || 'normal',
    supersetGroupId: e.superset_group_id ?? undefined,
  };
}

function mapTemplateRow(row: WorkoutTemplateRow): WorkoutTemplate {
  const sortedDays = [...row.workout_template_days].sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description ?? '',
    goal: row.goal ?? '',
    level: row.level ?? '',
    sortOrder: row.sort_order,
    durationWeeks: row.duration_weeks ?? undefined,
    sessionsPerWeek: row.sessions_per_week ?? undefined,
    estimatedSessionMinutes: row.estimated_session_minutes ?? undefined,
    equipment: row.equipment ?? '',
    location: row.location ?? '',
    trainingStyle: row.training_style ?? '',
    muscleFocus: row.muscle_focus ?? '',
    intensity: row.intensity ?? '',
    progressionNotes: row.progression_notes ?? '',
    deloadWeek: row.deload_week,
    isSystem: row.is_system,
    sourceTemplateId: row.source_template_id,
    days: sortedDays.map((d) => ({
      id: d.id,
      name: d.name,
      focus: d.focus ?? undefined,
      sortOrder: d.sort_order,
      estimatedDurationMinutes: d.estimated_duration_minutes ?? undefined,
      exercises: [...d.workout_template_exercises].sort((a, b) => a.exercise_order - b.exercise_order).map(mapTemplateExerciseRow),
    })),
  };
}

function mapTemplateSummaryRow(row: WorkoutTemplateSummaryRow): WorkoutTemplateSummary {
  const exerciseIds = row.workout_template_days.flatMap((day) => day.workout_template_exercises.map((e) => e.exercise_id));
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description ?? '',
    goal: row.goal ?? '',
    level: row.level ?? '',
    sortOrder: row.sort_order,
    durationWeeks: row.duration_weeks ?? undefined,
    sessionsPerWeek: row.sessions_per_week ?? undefined,
    estimatedSessionMinutes: row.estimated_session_minutes ?? undefined,
    equipment: row.equipment ?? '',
    location: row.location ?? '',
    trainingStyle: row.training_style ?? '',
    muscleFocus: row.muscle_focus ?? '',
    intensity: row.intensity ?? '',
    isSystem: row.is_system,
    dayCount: row.workout_template_days.length,
    exerciseCount: exerciseIds.length,
    exerciseIds,
  };
}

// Tutti i modelli visibili al coach corrente (RLS-scoped: propri + tutti i
// modelli di sistema), senza esercizi: le schermate filtrano client-side per
// folderId/isSystem (stesso pattern gia' usato per workoutPlans in
// schede/index.tsx). Con folderId=null in un risultato di un modello
// personale, il modello vive nella cartella virtuale "Senza categoria" — i
// modelli di sistema hanno sempre folderId null (non vivono in alcuna
// cartella di alcun coach).
export async function listWorkoutTemplateSummaries(): Promise<WorkoutPlanServiceResult<WorkoutTemplateSummary[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('workout_templates').select(SELECT_TEMPLATE_SUMMARY).order('name');
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura modelli: ${error.message}` };
  }
  return { ok: true, data: (data as unknown as WorkoutTemplateSummaryRow[]).map(mapTemplateSummaryRow) };
}

export async function getWorkoutTemplateById(id: string): Promise<WorkoutPlanServiceResult<WorkoutTemplate | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('workout_templates').select(SELECT_TEMPLATE_DETAIL).eq('id', id).maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura modello: ${error.message}` };
  }
  if (!data) return { ok: true, data: null };
  return { ok: true, data: mapTemplateRow(data as unknown as WorkoutTemplateRow) };
}

export type WorkoutTemplateSaveInput = {
  id?: string;
  folderId: string | null;
  name: string;
  description?: string;
  goal?: string;
  level?: string;
  durationWeeks?: number;
  sessionsPerWeek?: number;
  estimatedSessionMinutes?: number;
  equipment?: string;
  location?: string;
  trainingStyle?: string;
  muscleFocus?: string;
  intensity?: string;
  progressionNotes?: string;
  deloadWeek?: boolean;
  sourceTemplateId?: string;
  days: {
    id?: string;
    name: string;
    focus?: string;
    sortOrder: number;
    estimatedDurationMinutes?: number;
    exercises: {
      id?: string;
      exerciseId: string;
      order: number;
      sets: number;
      reps: number;
      repsMin?: number;
      repsMax?: number;
      targetWeight: number | null;
      restSeconds: number;
      notes: string;
      rpeRir?: string;
      techniqueType?: TechniqueType;
      supersetGroupId?: string;
    }[];
  }[];
};

// Salvataggio atomico (create o update) di un modello + i suoi giorni + i
// loro esercizi via RPC save_workout_template: coach_id NON viene mai
// inviato, la funzione lo ricava sempre da auth.uid() lato server. Non puo'
// mai creare o modificare un modello di sistema (is_system non e' un
// parametro esposto qui: la RPC inserisce sempre is_system=false).
export async function saveWorkoutTemplate(input: WorkoutTemplateSaveInput): Promise<WorkoutPlanServiceResult<WorkoutTemplate>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const payload = {
    id: input.id && isValidUuid(input.id) ? input.id : null,
    folder_id: input.folderId,
    name: input.name,
    description: input.description ?? '',
    goal: input.goal ?? '',
    level: input.level ?? '',
    duration_weeks: input.durationWeeks ?? null,
    sessions_per_week: input.sessionsPerWeek ?? null,
    estimated_session_minutes: input.estimatedSessionMinutes ?? null,
    equipment: input.equipment ?? '',
    location: input.location ?? '',
    training_style: input.trainingStyle ?? '',
    muscle_focus: input.muscleFocus ?? '',
    intensity: input.intensity ?? '',
    progression_notes: input.progressionNotes ?? '',
    deload_week: input.deloadWeek ?? false,
    source_template_id: input.sourceTemplateId && isValidUuid(input.sourceTemplateId) ? input.sourceTemplateId : null,
    days: input.days.map((d) => ({
      id: d.id && isValidUuid(d.id) ? d.id : null,
      name: d.name,
      focus: d.focus ?? '',
      sort_order: d.sortOrder,
      estimated_duration_minutes: d.estimatedDurationMinutes ?? null,
      exercises: d.exercises.map((e) => ({
        id: e.id && isValidUuid(e.id) ? e.id : null,
        exercise_id: e.exerciseId,
        exercise_order: e.order,
        sets: e.sets,
        reps: e.reps,
        reps_min: e.repsMin ?? null,
        reps_max: e.repsMax ?? null,
        target_weight: e.targetWeight,
        rest_seconds: e.restSeconds,
        notes: e.notes ?? '',
        rpe_rir: e.rpeRir ?? null,
        technique_type: e.techniqueType ?? 'normal',
        superset_group_id: e.supersetGroupId ?? null,
      })),
    })),
  };
  const { data, error } = await supabase.rpc('save_workout_template', { payload });
  if (error) {
    const { code, friendly } = describeTemplateLibraryError(error.message, 'Errore salvataggio scheda modello');
    return { ok: false, code, message: friendly };
  }
  const fetched = await getWorkoutTemplateById(data as string);
  if (!fetched.ok) return fetched;
  if (!fetched.data) {
    return { ok: false, code: 'not_found', message: 'Modello salvato ma non piu\' leggibile subito dopo.' };
  }
  return { ok: true, data: fetched.data };
}

// Duplica un modello (con tutti i suoi giorni ed esercizi) come nuova scheda
// modello indipendente di PROPRIETA' DEL COACH CHIAMANTE — mai un
// riferimento condiviso: giorni/esercizi vengono re-inseriti senza id, cosi'
// save_workout_template li tratta come righe nuove. Funziona identicamente
// sia per duplicare un proprio modello personale sia per "Duplica nella mia
// libreria" da un modello di sistema (save_workout_template imposta sempre
// coach_id=auth.uid()/is_system=false sull'inserimento, indipendentemente
// dalla provenienza) — source_template_id conserva il riferimento
// all'originale.
export async function duplicateWorkoutTemplate(id: string): Promise<WorkoutPlanServiceResult<WorkoutTemplate>> {
  const source = await getWorkoutTemplateById(id);
  if (!source.ok) return source;
  if (!source.data) {
    return { ok: false, code: 'not_found', message: 'Modello da duplicare non trovato.' };
  }
  const original = source.data;
  return saveWorkoutTemplate({
    folderId: original.isSystem ? null : original.folderId,
    name: original.isSystem ? original.name : `${original.name} (copia)`,
    description: original.description,
    goal: original.goal,
    level: original.level,
    durationWeeks: original.durationWeeks,
    sessionsPerWeek: original.sessionsPerWeek,
    estimatedSessionMinutes: original.estimatedSessionMinutes,
    equipment: original.equipment,
    location: original.location,
    trainingStyle: original.trainingStyle,
    muscleFocus: original.muscleFocus,
    intensity: original.intensity,
    progressionNotes: original.progressionNotes,
    deloadWeek: original.deloadWeek,
    sourceTemplateId: original.id,
    days: original.days.map((d) => ({
      name: d.name,
      focus: d.focus,
      sortOrder: d.sortOrder,
      estimatedDurationMinutes: d.estimatedDurationMinutes,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        order: e.order,
        sets: e.sets,
        reps: e.reps,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        targetWeight: e.targetWeight,
        restSeconds: e.restSeconds,
        notes: e.notes,
        rpeRir: e.rpeRir,
        techniqueType: e.techniqueType,
        supersetGroupId: e.supersetGroupId,
      })),
    })),
  });
}

export async function moveWorkoutTemplateToFolder(id: string, folderId: string | null): Promise<WorkoutPlanServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error } = await supabase.from('workout_templates').update({ folder_id: folderId }).eq('id', id);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore spostamento modello: ${error.message}` };
  }
  return { ok: true, data: null };
}

// RLS blocca comunque un tentativo su un modello di sistema (using clause
// "not is_system"): questa chiamata su un id di sistema restituisce 0 righe
// toccate, nessun errore esplicito — la UI non offre mai questa azione per
// un modello di sistema (vedi schede/modello/[templateId].tsx).
export async function deleteWorkoutTemplate(id: string): Promise<WorkoutPlanServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error } = await supabase.from('workout_templates').delete().eq('id', id);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore eliminazione modello: ${error.message}` };
  }
  return { ok: true, data: null };
}

// Assegna una COPIA indipendente del modello a un cliente ACTIVE del coach
// (mai 'invited'/'suspended'/'removed': controllo esplicito nella RPC, piu'
// stretto di is_coach_for_client che accetta anche 'invited'). Un modello
// con piu' giorni (Workout A/B/C) crea una scheda reale PER OGNI giorno,
// tutte assegnate in un colpo solo. Ritorna le schede reali (WorkoutPlan)
// appena create, gia' pronte per essere mostrate come conferma — MAI aperte
// automaticamente sul logger dal chiamante.
export async function assignWorkoutTemplateToClient(
  templateId: string,
  clientId: string,
): Promise<WorkoutPlanServiceResult<WorkoutPlan[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.rpc('assign_workout_template_to_client', {
    p_template_id: templateId,
    p_client_id: clientId,
  });
  if (error) {
    const { code, friendly } = describeTemplateLibraryError(error.message, 'Errore assegnazione scheda modello');
    return { ok: false, code, message: friendly };
  }
  const planIds = data as string[];
  const plans: WorkoutPlan[] = [];
  for (const planId of planIds) {
    const fetched = await getWorkoutPlanById(planId);
    if (!fetched.ok) return fetched;
    if (fetched.data) plans.push(fetched.data);
  }
  if (plans.length === 0) {
    return { ok: false, code: 'not_found', message: 'Scheda assegnata ma non piu\' leggibile subito dopo.' };
  }
  return { ok: true, data: plans };
}
