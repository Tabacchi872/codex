import { normalizeCoachCode } from './coach-code';
import { joinCoachByInviteCode } from './client-coach-service';
import { supabase, supabaseConfig } from './supabase';

import type { BmiCategory, ClientOnboardingExperience, ClientOnboardingGender, ClientOnboardingMode, CompletedClientOnboardingProfile, SelfGuidedOnboardingPayload } from '@/types/client-onboarding';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };
type OnboardingStatus = {
  exists: boolean;
  completed: boolean;
  mode: ClientOnboardingMode | null;
};

const GENERIC_SAVE_ERROR = 'Non è stato possibile salvare i dati. Riprova.';
const GENERIC_VERIFY_ERROR = 'Non è stato possibile verificare il profilo.';

export async function getClientOnboardingStatus(clientId: string): Promise<ServiceResult<OnboardingStatus>> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: true, data: { exists: false, completed: true, mode: null } };
  }

  const { data, error } = await supabase
    .from('client_onboarding')
    .select('client_mode,onboarding_completed')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.error('CLIENT_ONBOARDING_STATUS_ERROR', error.message);
    return { ok: false, message: GENERIC_VERIFY_ERROR };
  }

  if (!data) {
    return { ok: true, data: { exists: false, completed: true, mode: null } };
  }

  return {
    ok: true,
    data: {
      exists: true,
      completed: data.onboarding_completed === true,
      mode: data.client_mode ?? null,
    },
  };
}

export async function ensureClientOnboardingDraft(
  userId: string,
  metadata: Record<string, unknown> | null | undefined,
): Promise<ServiceResult<OnboardingStatus>> {
  const existing = await getClientOnboardingStatus(userId);
  if (!existing.ok) return existing;
  if (existing.data.exists) return existing;

  if (metadata?.requires_client_onboarding !== true) {
    return { ok: true, data: { exists: false, completed: true, mode: null } };
  }

  const created = await createPendingClientOnboarding(userId);
  if (!created.ok) {
    if (__DEV__) console.error('CLIENT_ONBOARDING_DRAFT_BOOTSTRAP_ERROR', created.message);
    return { ok: false, message: GENERIC_VERIFY_ERROR };
  }

  return { ok: true, data: { exists: true, completed: false, mode: null } };
}

export async function createPendingClientOnboarding(clientId: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.from('client_onboarding').upsert(
    {
      client_id: clientId,
      onboarding_completed: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id', ignoreDuplicates: true },
  );

  if (error) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_CREATE_PENDING_ERROR', error.message);
    return { ok: false, message: GENERIC_SAVE_ERROR };
  }

  return { ok: true, data: null };
}

export async function getCompletedClientOnboardingProfile(): Promise<ServiceResult<CompletedClientOnboardingProfile | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_VERIFY_ERROR };

  const { data, error } = await supabase
    .from('client_onboarding')
    .select(
      'client_mode,gender,goals,focus_areas,training_reasons,experience_level,training_days_per_week,weight_kg,height_cm,bmi,bmi_category,completed_at,onboarding_completed',
    )
    .eq('client_id', clientId)
    .eq('onboarding_completed', true)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_PROFILE_READ_ERROR', error.message);
    return { ok: false, message: GENERIC_VERIFY_ERROR };
  }

  if (!data) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      clientMode: (data.client_mode ?? 'self_guided') as ClientOnboardingMode,
      gender: nullableString(data.gender) as ClientOnboardingGender | null,
      goals: arrayOfStrings(data.goals),
      focusAreas: arrayOfStrings(data.focus_areas),
      trainingReasons: arrayOfStrings(data.training_reasons),
      experienceLevel: nullableString(data.experience_level) as ClientOnboardingExperience | null,
      trainingDaysPerWeek: nullableNumber(data.training_days_per_week),
      weightKg: nullableNumber(data.weight_kg),
      heightCm: nullableNumber(data.height_cm),
      bmi: nullableNumber(data.bmi),
      bmiCategory: nullableString(data.bmi_category) as BmiCategory | null,
      completedAt: nullableString(data.completed_at),
    },
  };
}

export async function completeCoachGuidedOnboarding(coachCode: string): Promise<ServiceResult<{ linked: boolean }>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_SAVE_ERROR };

  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_SAVE_ERROR };

  const normalizedCode = normalizeCoachCode(coachCode);
  let linkedToCoach = false;
  if (normalizedCode.length > 0) {
    const linkResult = await joinCoachByInviteCode(normalizedCode);
    if (!linkResult.ok) return { ok: false, message: linkResult.message };
    linkedToCoach = true;

    const linkCheck = await verifyActiveCoachLink(clientId);
    if (!linkCheck.ok) return linkCheck;
  }

  const existing = await getClientOnboardingStatus(clientId);
  if (!existing.ok) return existing;
  if (existing.data.completed) return { ok: true, data: { linked: linkedToCoach } };

  const draft = await createPendingClientOnboarding(clientId);
  if (!draft.ok) return draft;

  const { data: savedOnboarding, error } = await supabase
    .from('client_onboarding')
    .update({
      client_mode: 'coach_guided',
      onboarding_completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
    .select('client_id,onboarding_completed,client_mode')
    .maybeSingle();

  if (error || !savedOnboarding?.client_id || savedOnboarding.onboarding_completed !== true || savedOnboarding.client_mode !== 'coach_guided') {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_COACH_GUIDED_SAVE_ERROR', error?.message ?? 'missing saved onboarding row');
    return { ok: false, message: GENERIC_SAVE_ERROR };
  }

  return { ok: true, data: { linked: linkedToCoach } };
}

export async function saveSelfGuidedOnboarding(payload: SelfGuidedOnboardingPayload): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_SAVE_ERROR };

  const normalizedPayload = normalizeSelfGuidedPayload(payload);
  if (!normalizedPayload) return { ok: false, message: GENERIC_SAVE_ERROR };

  const existing = await getClientOnboardingStatus(clientId);
  if (!existing.ok) return existing;
  if (existing.data.completed) return { ok: true, data: null };

  const draft = await createPendingClientOnboarding(clientId);
  if (!draft.ok) return draft;

  const now = new Date().toISOString();
  const { data: savedOnboarding, error: onboardingError } = await supabase
    .from('client_onboarding')
    .update({
      client_mode: 'self_guided',
      onboarding_completed: true,
      gender: normalizedPayload.gender,
      goals: normalizedPayload.goals,
      focus_areas: normalizedPayload.focusAreas,
      training_reasons: normalizedPayload.trainingReasons,
      experience_level: normalizedPayload.experienceLevel,
      training_days_per_week: normalizedPayload.trainingDaysPerWeek,
      weight_kg: normalizedPayload.weightKg,
      height_cm: normalizedPayload.heightCm,
      bmi: normalizedPayload.bmi,
      bmi_category: normalizedPayload.bmiCategory,
      completed_at: now,
      updated_at: now,
    })
    .eq('client_id', clientId)
    .select('client_id,onboarding_completed,client_mode')
    .maybeSingle();

  if (onboardingError || !savedOnboarding?.client_id || savedOnboarding.onboarding_completed !== true) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_SELF_SAVE_ERROR', onboardingError?.message ?? 'missing saved onboarding row');
    return { ok: false, message: GENERIC_SAVE_ERROR };
  }

  await updateClientProfileMeasurements(clientId, normalizedPayload.weightKg, normalizedPayload.heightCm, normalizedPayload.goals);
  await maybeInsertInitialMeasurement(clientId, normalizedPayload);

  return { ok: true, data: null };
}

async function verifyActiveCoachLink(clientId: string): Promise<ServiceResult<null>> {
  if (!supabase) return { ok: false, message: GENERIC_SAVE_ERROR };

  const { data, error } = await supabase
    .from('coach_clients')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error || !data?.coach_id) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_ACTIVE_COACH_LINK_VERIFY_ERROR', error?.message ?? 'missing active coach link');
    return { ok: false, message: GENERIC_SAVE_ERROR };
  }

  return { ok: true, data: null };
}

function normalizeSelfGuidedPayload(payload: SelfGuidedOnboardingPayload): SelfGuidedOnboardingPayload | null {
  const goals = cleanStringArray(payload.goals);
  const focusAreas = cleanStringArray(payload.focusAreas);
  const trainingReasons = cleanStringArray(payload.trainingReasons);
  const weightKg = roundToOne(payload.weightKg);
  const heightCm = roundToOne(payload.heightCm);
  const bmi = calculateBmi(weightKg, heightCm);
  const bmiCategory = getBmiCategory(bmi);

  if (!['male', 'female', 'unspecified'].includes(payload.gender)) return null;
  if (!['beginner', 'novice', 'intermediate', 'advanced', 'competitive'].includes(payload.experienceLevel)) return null;
  if (goals.length === 0 || focusAreas.length === 0 || trainingReasons.length === 0) return null;
  if (!Number.isInteger(payload.trainingDaysPerWeek) || payload.trainingDaysPerWeek < 1 || payload.trainingDaysPerWeek > 7) return null;
  if (weightKg < 30 || weightKg > 300) return null;
  if (heightCm < 120 || heightCm > 230) return null;

  return {
    gender: payload.gender,
    goals,
    focusAreas,
    trainingReasons,
    experienceLevel: payload.experienceLevel,
    trainingDaysPerWeek: payload.trainingDaysPerWeek,
    weightKg,
    heightCm,
    bmi,
    bmiCategory,
  };
}

function cleanStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

async function updateClientProfileMeasurements(clientId: string, weightKg: number, heightCm: number, goals: string[]) {
  if (!supabase) return;
  const { error } = await supabase
    .from('client_profiles')
    .upsert({
      user_id: clientId,
      weight: weightKg,
      height: heightCm,
      goal: goals.join(', '),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error && __DEV__) console.warn('CLIENT_ONBOARDING_CLIENT_PROFILE_UPDATE_ERROR', error.message);
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function maybeInsertInitialMeasurement(clientId: string, payload: SelfGuidedOnboardingPayload) {
  if (!supabase) return;

  const { data: coachLink } = await supabase
    .from('coach_clients')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!coachLink?.coach_id) return;

  const { data: existing, error: existingError } = await supabase
    .from('client_measurements')
    .select('id')
    .eq('client_id', clientId)
    .eq('source', 'imported')
    .limit(1)
    .maybeSingle();
  if (existingError) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_MEASUREMENT_LOOKUP_ERROR', existingError.message);
    return;
  }
  if (existing) return;

  const { error } = await supabase.from('client_measurements').insert({
    coach_id: coachLink.coach_id,
    client_id: clientId,
    source: 'imported',
    measured_at: new Date().toISOString(),
    weight_kg: payload.weightKg,
    height_cm: payload.heightCm,
    bmi: payload.bmi,
    created_by: clientId,
  });
  if (error && __DEV__) console.warn('CLIENT_ONBOARDING_INITIAL_MEASUREMENT_ERROR', error.message);
}

export function calculateBmi(weightKg: number, heightCm: number) {
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  return Math.round(bmi * 10) / 10;
}

export function getBmiCategory(bmi: number) {
  if (bmi < 18.5) return 'Sottopeso';
  if (bmi < 25) return 'Normopeso';
  if (bmi < 30) return 'Sovrappeso';
  return 'Obesita';
}

async function getAuthenticatedClientId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.warn('CLIENT_ONBOARDING_SESSION_ERROR', error.message);
    return null;
  }
  return data.session?.user.id ?? null;
}
