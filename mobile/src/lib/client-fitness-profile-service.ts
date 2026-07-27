import { supabase, supabaseConfig } from './supabase';

import type { InitialFitnessQuestionnairePayload } from '@/types/client-fitness-profile';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_SAVE_ERROR = 'Non è stato possibile salvare il questionario. Riprova.';
const GENERIC_VERIFY_ERROR = 'Non è stato possibile verificare il questionario.';

export type FitnessProfileStatus = {
  exists: boolean;
  completed: boolean;
};

// Senza Supabase configurato (dev locale senza .env) il gating in auth-gate.tsx
// non deve mai bloccare l'app: stesso comportamento onesto di
// getClientOnboardingStatus (client-onboarding-service.ts), "completed: true"
// = nessun questionario da mostrare.
export async function getClientFitnessProfileStatus(): Promise<ServiceResult<FitnessProfileStatus>> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: true, data: { exists: false, completed: true } };
  }

  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_VERIFY_ERROR };

  const { data, error } = await supabase
    .from('client_fitness_profile')
    .select('completed')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('CLIENT_FITNESS_PROFILE_STATUS_ERROR', error.message);
    return { ok: false, message: GENERIC_VERIFY_ERROR };
  }

  if (!data) return { ok: true, data: { exists: false, completed: false } };

  return { ok: true, data: { exists: true, completed: data.completed === true } };
}

function describeSaveError(message: string): string {
  if (message.includes('INVALID_PAYLOAD')) return 'Alcune risposte non sono valide: controlla il questionario.';
  if (message.includes('FORBIDDEN')) return 'Solo un account cliente può salvare questo questionario.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Sessione scaduta: effettua di nuovo il login.';
  return GENERIC_SAVE_ERROR;
}

// client_id e' sempre auth.uid() lato RPC (save_initial_fitness_profile),
// mai passato dal client: nessun campo id in questo payload.
export async function saveInitialFitnessQuestionnaire(
  payload: InitialFitnessQuestionnairePayload,
): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('save_initial_fitness_profile', {
    payload: {
      age: payload.age,
      location: payload.location,
      equipment_level: payload.equipmentLevel,
      session_duration_minutes: payload.sessionDurationMinutes,
      preferred_training_style: payload.preferredTrainingStyle,
      has_pain_or_limitation: payload.hasPainOrLimitation,
      pain_areas: payload.painAreas,
      pain_notes: payload.painNotes ?? null,
      requires_professional_supervision: payload.requiresProfessionalSupervision,
      excluded_exercise_ids: payload.excludedExerciseIds,
    },
  });

  if (error) {
    if (__DEV__) console.warn('CLIENT_FITNESS_PROFILE_SAVE_ERROR', error.message);
    return { ok: false, message: describeSaveError(error.message) };
  }

  return { ok: true, data: null };
}

async function getAuthenticatedClientId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.warn('CLIENT_FITNESS_PROFILE_SESSION_ERROR', error.message);
    return null;
  }
  return data.session?.user.id ?? null;
}
