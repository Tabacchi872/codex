import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';
import { isValidUuid } from './workout-plan-service';
import { isWorkoutExerciseCompleted, isWorkoutExerciseLockedByLibraryId, isWorkoutSessionCompleted } from './workout-progress';
import { getWorkoutPlanById } from './workout-plan-service';

import type { ExerciseProgressHistory } from '@/types/training';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export type ExerciseProgressEntryInput = {
  clientId: string;
  exerciseId: string;
  workoutExerciseId: string;
  workoutPlanId: string;
  setNumber: number;
  repsCompleted: number;
  weightKg: number;
  restSeconds?: number | null;
  notes?: string;
  perceivedEffort?: number | null;
  performedAt?: string;
  sessionDate?: string;
};

type ProgressRow = {
  id: string;
  client_id: string;
  coach_id: string;
  exercise_id: string;
  workout_plan_id: string;
  workout_exercise_id: string | null;
  performed_at: string;
  session_date: string;
  set_number: number;
  reps_completed: number;
  weight_kg: number | string;
  rest_seconds: number | null;
  notes: string | null;
  perceived_effort: number | string | null;
  created_by: string;
  created_by_role: 'coach' | 'client';
  created_at: string;
  updated_at: string;
};

type WorkoutPlanOwnerRow = {
  id: string;
  coach_id: string;
  client_id: string;
};

const SELECT_PROGRESS_COLUMNS =
  'id,client_id,coach_id,exercise_id,workout_plan_id,workout_exercise_id,performed_at,session_date,set_number,reps_completed,weight_kg,rest_seconds,notes,perceived_effort,created_by,created_by_role,created_at,updated_at';

export async function listClientExerciseProgress(clientId: string): Promise<ServiceResult<ExerciseProgressHistory[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (!isValidUuid(clientId)) return { ok: false, code: 'invalid_client', message: 'Cliente non valido.' };

  const { data, error } = await supabase
    .from('exercise_progress_history')
    .select(SELECT_PROGRESS_COLUMNS)
    .eq('client_id', clientId)
    .order('performed_at', { ascending: false });

  if (error) return dbError('progress_load_failed', 'Impossibile caricare lo storico carichi.', error);
  return { ok: true, data: ((data ?? []) as unknown as ProgressRow[]).map(mapProgressRow) };
}

export async function createExerciseProgressEntries(
  entries: ExerciseProgressEntryInput[],
): Promise<ServiceResult<ExerciseProgressHistory[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (entries.length === 0) return { ok: false, code: 'empty_entries', message: 'Inserisci almeno una serie valida.' };

  const session = await getCurrentSession();
  const authUserId = session.ok ? (session.data?.user.id ?? null) : null;
  if (!authUserId) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };

  const first = entries[0];
  if (!isValidUuid(first.clientId) || (first.workoutPlanId && !isValidUuid(first.workoutPlanId))) {
    return { ok: false, code: 'invalid_payload', message: 'Scheda non sincronizzata: riapri la scheda e riprova.' };
  }
  if (entries.some((entry) => entry.clientId !== first.clientId || entry.workoutPlanId !== first.workoutPlanId)) {
    return { ok: false, code: 'mixed_entries', message: 'Le serie devono appartenere alla stessa scheda.' };
  }
  if (!isValidUuid(first.workoutExerciseId)) {
    return { ok: false, code: 'invalid_payload', message: 'Esercizio non valido: riapri la scheda e riprova.' };
  }

  const actor = await resolveProgressActor(authUserId, first.clientId, first.workoutPlanId || null);
  if (!actor.ok) {
    // Ramo self-guided esplicito: un cliente senza coach non ha mai una riga
    // coach_clients (resolveProgressActor ritorna sempre 'client_not_linked'
    // per lui), ma resta legittimo che registri i propri progressi su una
    // scheda automatica. Tutta l'autorizzazione reale (nessun coach, entitlement,
    // proprietà scheda, origine, ciclo, esercizio, WORKOUT_LOCKED) è verificata
    // server-side dalla RPC, mai qui: questo ramo si limita a instradare la
    // stessa identica chiamata verso il percorso corretto.
    if (actor.code === 'client_not_linked' && authUserId === first.clientId) {
      return createSelfGuidedExerciseProgressEntries(entries, first);
    }
    return actor;
  }

  const workoutPlan = await getWorkoutPlanById(first.workoutPlanId);
  if (!workoutPlan.ok) return { ok: false, code: workoutPlan.code, message: workoutPlan.message };
  if (!workoutPlan.data) return { ok: false, code: 'workout_not_found', message: 'Scheda non trovata o non accessibile.' };
  if (isWorkoutSessionCompleted(workoutPlan.data)) {
    return { ok: false, code: 'workout_locked', message: 'Questo workout è già completato e non può essere modificato.' };
  }
  if (isWorkoutExerciseCompleted(workoutPlan.data, first.workoutExerciseId)) {
    return { ok: false, code: 'exercise_locked', message: 'Questo esercizio è già completato e non può essere modificato.' };
  }

  const nowIso = new Date().toISOString();
  const payload = entries.map((entry) => ({
    client_id: first.clientId,
    coach_id: actor.data.coachId,
    exercise_id: entry.exerciseId,
    workout_plan_id: entry.workoutPlanId || null,
    workout_exercise_id: entry.workoutExerciseId || null,
    performed_at: entry.performedAt ?? nowIso,
    session_date: entry.sessionDate ?? nowIso.slice(0, 10),
    set_number: entry.setNumber,
    reps_completed: entry.repsCompleted,
    weight_kg: entry.weightKg,
    rest_seconds: entry.restSeconds ?? null,
    notes: entry.notes?.trim() || null,
    perceived_effort: entry.perceivedEffort ?? null,
    created_by: authUserId,
    created_by_role: actor.data.role,
  }));

  const { data, error } = await supabase
    .from('exercise_progress_history')
    .insert(payload)
    .select(SELECT_PROGRESS_COLUMNS);

  if (error) return dbError('progress_insert_failed', 'Impossibile salvare i carichi. Riprova.', error);
  return { ok: true, data: ((data ?? []) as unknown as ProgressRow[]).map(mapProgressRow) };
}

export async function deleteExerciseProgressEntry(id: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  if (!isValidUuid(id)) return { ok: true, data: null };

  const { data: entry, error: loadError } = await supabase
    .from('exercise_progress_history')
    .select('id,client_id,coach_id,exercise_id,workout_plan_id,created_by,created_by_role')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return dbError('progress_delete_load_failed', 'Impossibile verificare il carico da eliminare.', loadError);
  if (!entry) return { ok: true, data: null };
  if (!entry.workout_plan_id) return { ok: false, code: 'workout_not_found', message: 'Scheda non trovata o non accessibile.' };

  const session = await getCurrentSession();
  const authUserId = session.ok ? (session.data?.user.id ?? null) : null;
  if (!authUserId) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };

  const actor = await resolveProgressActor(authUserId, String(entry.client_id), String(entry.workout_plan_id));
  if (!actor.ok) {
    if (actor.code === 'client_not_linked' && authUserId === String(entry.client_id)) {
      return deleteSelfGuidedExerciseProgressEntry(id);
    }
    return actor;
  }

  if (String(entry.created_by) !== authUserId || String(entry.created_by_role) !== actor.data.role) {
    return { ok: false, code: 'forbidden', message: 'Non sei autorizzato a eliminare questo carico.' };
  }

  const workoutPlan = await getWorkoutPlanById(String(entry.workout_plan_id));
  if (!workoutPlan.ok) return { ok: false, code: workoutPlan.code, message: workoutPlan.message };
  if (!workoutPlan.data) return { ok: false, code: 'workout_not_found', message: 'Scheda non trovata o non accessibile.' };
  if (isWorkoutSessionCompleted(workoutPlan.data)) {
    return { ok: false, code: 'workout_locked', message: 'Questo workout è già completato e non può essere modificato.' };
  }
  if (isWorkoutExerciseLockedByLibraryId(workoutPlan.data, String(entry.exercise_id))) {
    return { ok: false, code: 'exercise_locked', message: 'Questo esercizio è già completato e non può essere modificato.' };
  }

  const { error } = await supabase.from('exercise_progress_history').delete().eq('id', id);
  if (error) return dbError('progress_delete_failed', 'Impossibile eliminare il carico.', error);
  return { ok: true, data: null };
}

async function resolveProgressActor(
  authUserId: string,
  clientId: string,
  workoutPlanId: string | null,
): Promise<ServiceResult<{ coachId: string; role: 'coach' | 'client' }>> {
  if (!supabase) return notConfigured();
  const isClientActor = authUserId === clientId;
  const relationQuery = supabase
    .from('coach_clients')
    .select('coach_id,client_id')
    .eq('status', 'active')
    .eq('client_id', clientId);

  const relation = isClientActor
    ? await relationQuery.limit(1).maybeSingle()
    : await relationQuery.eq('coach_id', authUserId).maybeSingle();

  if (relation.error) return dbError('client_link_check_failed', 'Impossibile verificare il collegamento coach-cliente.', relation.error);
  if (!relation.data) return { ok: false, code: 'client_not_linked', message: 'Cliente non collegato al coach.' };

  const coachId = String((relation.data as { coach_id: string }).coach_id);
  const role: 'coach' | 'client' = isClientActor ? 'client' : 'coach';

  if (!workoutPlanId) return { ok: true, data: { coachId, role } };

  const { data, error } = await supabase
    .from('workout_plans')
    .select('id,coach_id,client_id')
    .eq('id', workoutPlanId)
    .eq('client_id', clientId)
    .eq('coach_id', coachId)
    .maybeSingle();

  if (error) return dbError('workout_owner_load_failed', 'Impossibile verificare la scheda.', error);
  if (!data) return { ok: false, code: 'workout_not_found', message: 'Scheda non trovata o non accessibile.' };

  const row = data as WorkoutPlanOwnerRow;
  return { ok: true, data: { coachId: row.coach_id, role } };
}

// Percorso self-guided (sotto-blocco 2.0): un cliente senza coach non ha mai
// una riga coach_clients, quindi resolveProgressActor ritorna sempre
// 'client_not_linked' per lui. Qui NON si duplica alcuna logica di
// autorizzazione: la RPC log_self_guided_exercise_progress (SECURITY
// DEFINER, sempre auth.uid(), mai un client_id/coach_id/origine passati dal
// client) verifica server-side, in ordine: ruolo cliente, assenza di coach,
// entitlement Client Pro attivo, proprietà reale della scheda, origine
// auto_system/superadmin_override, stato del ciclo collegato (nessun ciclo ->
// NO_ACTIVE_PROGRAM, sospeso/in revisione -> PROGRAM_PAUSED), appartenenza
// dell'esercizio alla scheda (INVALID_EXERCISE), e riusa
// exercise_progress_entry_writable() — la stessa funzione già usata dalle RLS
// del percorso coach — per WORKOUT_LOCKED.
async function createSelfGuidedExerciseProgressEntries(
  entries: ExerciseProgressEntryInput[],
  first: ExerciseProgressEntryInput,
): Promise<ServiceResult<ExerciseProgressHistory[]>> {
  if (!supabase) return notConfigured();

  const payload = entries.map((entry) => ({
    set_number: entry.setNumber,
    reps_completed: entry.repsCompleted,
    weight_kg: entry.weightKg,
    rest_seconds: entry.restSeconds ?? null,
    notes: entry.notes?.trim() || null,
    perceived_effort: entry.perceivedEffort ?? null,
    performed_at: entry.performedAt ?? new Date().toISOString(),
    session_date: entry.sessionDate ?? new Date().toISOString().slice(0, 10),
  }));

  const { data, error } = await supabase.rpc('log_self_guided_exercise_progress', {
    p_workout_plan_id: first.workoutPlanId,
    p_workout_exercise_id: first.workoutExerciseId,
    p_exercise_id: first.exerciseId,
    p_entries: payload,
  });

  if (error) return selfGuidedRpcError('progress_insert_failed', error);
  return { ok: true, data: ((data ?? []) as unknown as ProgressRow[]).map(mapProgressRow) };
}

async function deleteSelfGuidedExerciseProgressEntry(id: string): Promise<ServiceResult<null>> {
  if (!supabase) return notConfigured();

  const { error } = await supabase.rpc('delete_self_guided_exercise_progress', { p_entry_id: id });
  if (error) return selfGuidedRpcError('progress_delete_failed', error);
  return { ok: true, data: null };
}

// Traduce i codici stabili sollevati dalle due RPC self-guided (RAISE
// EXCEPTION 'CODICE: messaggio tecnico') in un messaggio leggibile in
// italiano, mai il messaggio Postgres grezzo. Stesso principio di
// describeAssignError (auto-program-service.ts).
function selfGuidedRpcError(fallbackCode: string, error: unknown): ServiceResult<never> {
  logSupabaseError(`EXERCISE_PROGRESS_${fallbackCode.toUpperCase()}`, error);
  const info = readError(error);
  const raw = info.message || '';
  if (raw.includes('SUBSCRIPTION_REQUIRED')) {
    return { ok: false, code: 'subscription_required', message: 'Serve un piano Client Pro attivo per registrare i tuoi progressi.' };
  }
  if (raw.includes('NO_ACTIVE_PROGRAM')) {
    return { ok: false, code: 'no_active_program', message: 'Non risulta alcun programma automatico attivo collegato a questa scheda.' };
  }
  if (raw.includes('PROGRAM_PAUSED')) {
    return { ok: false, code: 'program_paused', message: 'Il tuo programma è in attesa di revisione: riprova più tardi.' };
  }
  if (raw.includes('WORKOUT_LOCKED')) {
    return { ok: false, code: 'workout_locked', message: 'Questo workout o questo esercizio è già completato e non può essere modificato.' };
  }
  if (raw.includes('INVALID_EXERCISE')) {
    return { ok: false, code: 'invalid_exercise', message: 'Questo esercizio non appartiene a questa scheda.' };
  }
  if (raw.includes('INVALID_SESSION')) {
    return { ok: false, code: 'invalid_session', message: 'Scheda non trovata o non accessibile.' };
  }
  if (raw.includes('FORBIDDEN')) {
    return { ok: false, code: 'forbidden', message: 'Non sei autorizzato a questa operazione.' };
  }
  if (raw.includes('NOT_AUTHENTICATED')) {
    return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  }
  if (raw.includes('INVALID_PAYLOAD')) {
    return { ok: false, code: 'invalid_payload', message: 'Dati non validi: controlla peso e ripetizioni inserite.' };
  }
  return dbError(fallbackCode, 'Impossibile completare l\'operazione. Riprova.', error);
}

function mapProgressRow(row: ProgressRow): ExerciseProgressHistory {
  return {
    id: row.id,
    coachId: row.coach_id,
    clientId: row.client_id,
    exerciseId: row.exercise_id,
    workoutPlanId: row.workout_plan_id,
    workoutExerciseId: row.workout_exercise_id ?? undefined,
    date: row.session_date,
    setNumber: row.set_number,
    setsCompleted: 1,
    repsCompleted: row.reps_completed,
    weightUsed: readNumber(row.weight_kg),
    restUsed: row.rest_seconds ?? 0,
    notes: row.notes ?? '',
    perceivedEffort: row.perceived_effort === null ? undefined : readNumber(row.perceived_effort),
    createdBy: row.created_by,
    createdByRole: row.created_by_role,
    createdAt: row.performed_at ?? row.created_at,
  };
}

function readNumber(value: number | string) {
  return typeof value === 'number' ? value : Number(value);
}

function notConfigured(): ServiceResult<never> {
  return { ok: false, code: 'not_configured', message: 'Storico carichi remoto non disponibile in questo ambiente.' };
}

function dbError(code: string, message: string, error: unknown): ServiceResult<never> {
  logSupabaseError(`EXERCISE_PROGRESS_${code.toUpperCase()}`, error);
  const info = readError(error);
  const lower = info.message.toLowerCase();
  if (lower.includes('row-level security') || info.code === '42501') {
    return { ok: false, code: 'rls_denied', message: 'Permessi insufficienti per questa operazione.' };
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return { ok: false, code: 'network_error', message: 'Errore di rete. Riprova tra poco.' };
  }
  if (lower.includes('violates foreign key')) {
    return { ok: false, code: 'invalid_link', message: 'La scheda non risulta valida per questo cliente.' };
  }
  return { ok: false, code, message };
}

function logSupabaseError(label: string, error: unknown) {
  if (!__DEV__) return;
  const info = readError(error);
  console.error(label, { code: info.code, message: info.message, details: info.details, hint: info.hint });
}

function readError(error: unknown) {
  const item = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof item.code === 'string' ? item.code : undefined,
    message: typeof item.message === 'string' ? item.message : '',
    details: typeof item.details === 'string' ? item.details : '',
    hint: typeof item.hint === 'string' ? item.hint : '',
  };
}
