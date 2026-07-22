import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';

import type { ClientMeasurement, MeasurementDraft } from '@/types/client-metrics';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const MEASUREMENT_COLUMNS =
  'id,coach_id,client_id,bia_report_id,source,measured_at,weight_kg,height_cm,bmi,body_fat_percent,body_fat_kg,lean_mass_kg,' +
  'muscle_mass_kg,skeletal_muscle_mass_kg,total_body_water_percent,total_body_water_l,intracellular_water_l,extracellular_water_l,' +
  'visceral_fat,basal_metabolic_rate_kcal,phase_angle,waist_cm,hips_cm,chest_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,' +
  'left_calf_cm,right_calf_cm,device_brand,device_model,measurement_location,coach_comment,client_visible_comment,raw_optional_metrics,' +
  'created_by,updated_by,created_at,updated_at';

export async function listClientMeasurements(clientId: string): Promise<ServiceResult<ClientMeasurement[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase
    .from('client_measurements')
    .select(MEASUREMENT_COLUMNS)
    .eq('client_id', clientId)
    .order('measured_at', { ascending: true });
  if (error) return dbError('measurements_load_failed', 'Impossibile caricare le metriche cliente.', error);
  return { ok: true, data: ((data ?? []) as unknown as MeasurementRow[]).map(mapMeasurementRow) };
}

export async function createClientMeasurement(clientId: string, draft: MeasurementDraft): Promise<ServiceResult<ClientMeasurement>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  const actor = await resolveMetricsActor(session.data.user.id, clientId);
  if (!actor.ok) return actor;

  const payload = measurementDraftToRow(draft, actor.data.coachId, clientId, session.data.user.id);
  const { data, error } = await supabase.from('client_measurements').insert(payload).select(MEASUREMENT_COLUMNS).single();
  if (error || !data) return dbError('measurement_create_failed', 'Impossibile salvare la misurazione.', error);
  return { ok: true, data: mapMeasurementRow(data as unknown as MeasurementRow) };
}

export async function updateClientMeasurement(measurement: ClientMeasurement): Promise<ServiceResult<ClientMeasurement>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  const { data, error } = await supabase
    .from('client_measurements')
    .update({ ...measurementDraftToRow(measurement, measurement.coachId, measurement.clientId, measurement.createdBy ?? session.data.user.id), updated_by: session.data.user.id })
    .eq('id', measurement.id)
    .select(MEASUREMENT_COLUMNS)
    .single();
  if (error || !data) return dbError('measurement_update_failed', 'Impossibile aggiornare la misurazione.', error);
  return { ok: true, data: mapMeasurementRow(data as unknown as MeasurementRow) };
}

export async function deleteClientMeasurement(id: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error } = await supabase.from('client_measurements').delete().eq('id', id);
  if (error) return dbError('measurement_delete_failed', 'Impossibile eliminare la misurazione.', error);
  return { ok: true, data: null };
}

async function verifyCoachClient(coachId: string, clientId: string): Promise<ServiceResult<null>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return dbError('client_link_check_failed', 'Impossibile verificare il collegamento cliente.', error);
  if (!data) return { ok: false, code: 'client_not_linked', message: 'Il cliente non risulta collegato al tuo account.' };
  return { ok: true, data: null };
}

// Chi scrive puo' essere il coach (che crea una misurazione per un proprio
// cliente, verificato tramite verifyCoachClient) oppure il cliente stesso
// (auto-inserimento, userId === clientId): in quel caso coach_id sulla riga
// resta comunque il coach realmente collegato (letto da coach_clients, mai
// dal client), cosi' le viste/RLS che leggono client_measurements per coach_id
// continuano a funzionare identiche indipendentemente da chi ha scritto la riga.
async function resolveMetricsActor(userId: string, clientId: string): Promise<ServiceResult<{ coachId: string; isClientSelfEntry: boolean }>> {
  if (!supabase) return notConfigured();
  if (userId !== clientId) {
    const link = await verifyCoachClient(userId, clientId);
    if (!link.ok) return link;
    return { ok: true, data: { coachId: userId, isClientSelfEntry: false } };
  }

  const { data, error } = await supabase
    .from('coach_clients')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) return dbError('client_link_lookup_failed', 'Non è stato possibile salvare la misurazione.', error);
  if (!data?.coach_id) {
    return { ok: false, code: 'client_not_linked', message: 'Non è stato possibile salvare la misurazione.' };
  }
  return { ok: true, data: { coachId: String(data.coach_id), isClientSelfEntry: true } };
}

function measurementDraftToRow(draft: MeasurementDraft, coachId: string, clientId: string, userId: string) {
  return {
    coach_id: coachId,
    client_id: clientId,
    bia_report_id: draft.biaReportId ?? null,
    source: draft.source,
    measured_at: draft.measuredAt,
    weight_kg: draft.weightKg ?? null,
    height_cm: draft.heightCm ?? null,
    bmi: draft.bmi ?? null,
    body_fat_percent: draft.bodyFatPercent ?? null,
    body_fat_kg: draft.bodyFatKg ?? null,
    lean_mass_kg: draft.leanMassKg ?? null,
    muscle_mass_kg: draft.muscleMassKg ?? null,
    skeletal_muscle_mass_kg: draft.skeletalMuscleMassKg ?? null,
    total_body_water_percent: draft.totalBodyWaterPercent ?? null,
    total_body_water_l: draft.totalBodyWaterL ?? null,
    intracellular_water_l: draft.intracellularWaterL ?? null,
    extracellular_water_l: draft.extracellularWaterL ?? null,
    visceral_fat: draft.visceralFat ?? null,
    basal_metabolic_rate_kcal: draft.basalMetabolicRateKcal ?? null,
    phase_angle: draft.phaseAngle ?? null,
    waist_cm: draft.waistCm ?? null,
    hips_cm: draft.hipsCm ?? null,
    chest_cm: draft.chestCm ?? null,
    left_arm_cm: draft.leftArmCm ?? null,
    right_arm_cm: draft.rightArmCm ?? null,
    left_thigh_cm: draft.leftThighCm ?? null,
    right_thigh_cm: draft.rightThighCm ?? null,
    left_calf_cm: draft.leftCalfCm ?? null,
    right_calf_cm: draft.rightCalfCm ?? null,
    device_brand: draft.deviceBrand ?? null,
    device_model: draft.deviceModel ?? null,
    measurement_location: draft.measurementLocation ?? null,
    coach_comment: draft.coachComment ?? null,
    client_visible_comment: draft.clientVisibleComment ?? null,
    raw_optional_metrics: draft.rawOptionalMetrics ?? null,
    created_by: userId,
  };
}

type MeasurementRow = Record<string, unknown>;

function mapMeasurementRow(row: MeasurementRow): ClientMeasurement {
  return {
    id: String(row.id),
    coachId: String(row.coach_id),
    clientId: String(row.client_id),
    biaReportId: nullableString(row.bia_report_id),
    source: row.source === 'bia_pdf' || row.source === 'imported' ? row.source : 'manual',
    measuredAt: String(row.measured_at),
    weightKg: nullableNumber(row.weight_kg),
    heightCm: nullableNumber(row.height_cm),
    bmi: nullableNumber(row.bmi),
    bodyFatPercent: nullableNumber(row.body_fat_percent),
    bodyFatKg: nullableNumber(row.body_fat_kg),
    leanMassKg: nullableNumber(row.lean_mass_kg),
    muscleMassKg: nullableNumber(row.muscle_mass_kg),
    skeletalMuscleMassKg: nullableNumber(row.skeletal_muscle_mass_kg),
    totalBodyWaterPercent: nullableNumber(row.total_body_water_percent),
    totalBodyWaterL: nullableNumber(row.total_body_water_l),
    intracellularWaterL: nullableNumber(row.intracellular_water_l),
    extracellularWaterL: nullableNumber(row.extracellular_water_l),
    visceralFat: nullableNumber(row.visceral_fat),
    basalMetabolicRateKcal: nullableNumber(row.basal_metabolic_rate_kcal),
    phaseAngle: nullableNumber(row.phase_angle),
    waistCm: nullableNumber(row.waist_cm),
    hipsCm: nullableNumber(row.hips_cm),
    chestCm: nullableNumber(row.chest_cm),
    leftArmCm: nullableNumber(row.left_arm_cm),
    rightArmCm: nullableNumber(row.right_arm_cm),
    leftThighCm: nullableNumber(row.left_thigh_cm),
    rightThighCm: nullableNumber(row.right_thigh_cm),
    leftCalfCm: nullableNumber(row.left_calf_cm),
    rightCalfCm: nullableNumber(row.right_calf_cm),
    deviceBrand: nullableString(row.device_brand),
    deviceModel: nullableString(row.device_model),
    measurementLocation: nullableString(row.measurement_location),
    coachComment: nullableString(row.coach_comment),
    clientVisibleComment: nullableString(row.client_visible_comment),
    rawOptionalMetrics: typeof row.raw_optional_metrics === 'object' && row.raw_optional_metrics ? row.raw_optional_metrics as Record<string, unknown> : null,
    createdBy: nullableString(row.created_by),
    updatedBy: nullableString(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function notConfigured(): ServiceResult<never> {
  return { ok: false, code: 'not_configured', message: 'Supabase non configurato in questo ambiente.' };
}

function dbError(code: string, message: string, error: unknown): ServiceResult<never> {
  logSupabaseError(`CLIENT_METRICS_${code.toUpperCase()}`, error);
  const info = readError(error);
  if (info.message.toLowerCase().includes('row-level security') || info.code === '42501') {
    return { ok: false, code: 'rls_denied', message: 'Permessi insufficienti per questa operazione.' };
  }
  if (info.message.toLowerCase().includes('network') || info.message.toLowerCase().includes('failed to fetch')) {
    return { ok: false, code: 'network_error', message: 'Errore di rete. Riprova tra poco.' };
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
