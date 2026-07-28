import { supabase, supabaseConfig } from './supabase';

import { getExerciseById } from '@/data/exercise-library';
import type { CurrentCycleExercise, MonthlyCheckinPayload } from '@/types/client-monthly-checkin';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_SAVE_ERROR = 'Non è stato possibile salvare il check-in. Riprova.';
const GENERIC_READ_ERROR = 'Non è stato possibile leggere la scheda corrente.';

function describeSaveError(message: string): string {
  if (message.includes('CLIENT_PRO_REQUIRED')) return 'Serve un piano Client Pro attivo per inviare il check-in.';
  if (message.includes('FORBIDDEN')) return 'Il check-in mensile non è disponibile per il tuo account.';
  if (message.includes('INVALID_CYCLE_STATE')) return 'Il ciclo non è nello stato corretto per ricevere un check-in ora.';
  if (message.includes('ALREADY_REVIEWED')) return 'Questo ciclo ha già ricevuto una decisione: aggiorna la pagina.';
  if (message.includes('CHECKIN_LOCKED')) return 'Il check-in è già stato elaborato e non è più modificabile.';
  if (message.includes('FORBIDDEN_OR_NOT_FOUND')) return 'Ciclo non trovato.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Sessione scaduta: effettua di nuovo il login.';
  return GENERIC_SAVE_ERROR;
}

// p_submit distingue bozza (false, modificabile finche' non parte la
// revisione) da invio definitivo (true): stesso identico payload, la RPC
// server-side (submit_monthly_checkin) e' l'unica fonte di verita' su cosa
// e' consentito, mai una validazione duplicata qui oltre ai campi
// obbligatori dell'RPC stessa.
export async function submitMonthlyCheckin(
  payload: MonthlyCheckinPayload,
  submit: boolean,
): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('submit_monthly_checkin', {
    p_cycle_id: payload.cycleId,
    p_perceived_difficulty: payload.perceivedDifficulty,
    p_sessions_completed_estimate: payload.sessionsCompletedEstimate ?? null,
    p_has_pain_or_limitation: payload.hasPainOrLimitation,
    p_pain_areas: payload.painAreas,
    p_pain_notes: payload.painNotes ?? null,
    p_requires_professional_supervision: payload.requiresProfessionalSupervision,
    p_wants_to_continue: payload.wantsToContinue,
    p_available_minutes: payload.availableMinutes ?? null,
    p_goal_changed_to: payload.goalChangedTo ?? null,
    p_disliked_exercise_ids: payload.dislikedExerciseIds,
    p_notes: payload.notes ?? null,
    p_available_days_per_week: payload.availableDaysPerWeek ?? null,
    p_location: payload.location ?? null,
    p_equipment_level: payload.equipmentLevel ?? null,
    p_submit: submit,
  });

  if (error) {
    if (__DEV__) console.warn('MONTHLY_CHECKIN_SAVE_ERROR', error.message);
    return { ok: false, message: describeSaveError(error.message) };
  }

  return { ok: true, data: null };
}

type WorkoutDayExerciseRow = { exercise_id: string };
type WorkoutDayRow = { workout_day_exercises: WorkoutDayExerciseRow[] | null };
type PlanRow = { workout_plan_id: string; workout_plans: { workout_days: WorkoutDayRow[] | null } | null };

// Esercizi realmente presenti nel ciclo corrente (per la selezione "esercizi
// sgraditi" del check-in): mai un elenco statico come nel questionario
// iniziale (li' non esisteva ancora un programma assegnato), qui il
// programma esiste davvero e va letto da li'.
export async function getCurrentCycleExercises(cycleId: string): Promise<ServiceResult<CurrentCycleExercise[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from('client_program_cycle_plans')
    .select('workout_plan_id,workout_plans(workout_days(workout_day_exercises(exercise_id)))')
    .eq('cycle_id', cycleId)
    .returns<PlanRow[]>();

  if (error) {
    if (__DEV__) console.warn('MONTHLY_CHECKIN_CYCLE_EXERCISES_ERROR', error.message);
    return { ok: false, message: GENERIC_READ_ERROR };
  }

  const ids = new Set<string>();
  for (const plan of data ?? []) {
    for (const day of plan.workout_plans?.workout_days ?? []) {
      for (const exercise of day.workout_day_exercises ?? []) {
        ids.add(exercise.exercise_id);
      }
    }
  }

  const exercises = Array.from(ids)
    .map((id) => ({ exerciseId: id, name: getExerciseById(id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, data: exercises };
}
