import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';

import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';

import type { BiaReport, ClientMeasurement, MeasurementDraft } from '@/types/client-metrics';

export const BIA_REPORTS_BUCKET = 'bia-reports';
const MAX_BIA_PDF_BYTES = 18 * 1024 * 1024;

type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const MEASUREMENT_COLUMNS =
  'id,coach_id,client_id,bia_report_id,source,measured_at,weight_kg,height_cm,bmi,body_fat_percent,body_fat_kg,lean_mass_kg,' +
  'muscle_mass_kg,skeletal_muscle_mass_kg,total_body_water_percent,total_body_water_l,intracellular_water_l,extracellular_water_l,' +
  'visceral_fat,basal_metabolic_rate_kcal,phase_angle,waist_cm,hips_cm,chest_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,' +
  'left_calf_cm,right_calf_cm,device_brand,device_model,measurement_location,coach_comment,client_visible_comment,raw_optional_metrics,' +
  'created_by,updated_by,created_at,updated_at';

const REPORT_COLUMNS =
  'id,coach_id,client_id,storage_path,original_filename,mime_type,file_size,file_hash,status,extracted_text,extracted_data,' +
  'extraction_confidence,extraction_provider,error_code,error_message,uploaded_at,processed_at,confirmed_at,confirmed_by,created_at,updated_at';

export async function pickBiaPdf() {
  return DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
}

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

export async function listClientBiaReports(clientId: string): Promise<ServiceResult<BiaReport[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase
    .from('bia_reports')
    .select(REPORT_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) return dbError('reports_load_failed', 'Impossibile caricare i PDF BIA.', error);
  return { ok: true, data: ((data ?? []) as unknown as ReportRow[]).map(mapReportRow) };
}

export async function uploadBiaReport(clientId: string, asset: DocumentPicker.DocumentPickerAsset): Promise<ServiceResult<BiaReport>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  const coachId = session.data.user.id;

  if (!isPdfAsset(asset)) return { ok: false, code: 'invalid_pdf', message: 'Seleziona un file PDF valido.' };
  if (asset.size && asset.size > MAX_BIA_PDF_BYTES) return { ok: false, code: 'file_too_large', message: 'PDF troppo grande.' };

  const link = await verifyCoachClient(coachId, clientId);
  if (!link.ok) return link;

  try {
    const body = await readDocumentBody(asset);
    const fileHash = hashBytes(body.hashSource);
    const duplicate = await findDuplicateReport(coachId, clientId, fileHash);
    if (!duplicate.ok) return duplicate;
    if (duplicate.data) {
      return { ok: false, code: 'duplicate', message: 'Questo PDF BIA risulta gia caricato per il cliente.' };
    }

    const reportId = randomUuid();
    const storagePath = `${coachId}/${clientId}/${reportId}.pdf`;
    const { error: uploadError } = await supabase.storage.from(BIA_REPORTS_BUCKET).upload(storagePath, body.uploadBody, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) return dbError('upload_failed', 'Caricamento PDF fallito.', uploadError);

    const { data, error } = await supabase
      .from('bia_reports')
      .insert({
        id: reportId,
        coach_id: coachId,
        client_id: clientId,
        storage_path: storagePath,
        original_filename: asset.name ?? null,
        mime_type: asset.mimeType ?? 'application/pdf',
        file_size: asset.size ?? null,
        file_hash: fileHash,
        status: 'uploaded',
      })
      .select(REPORT_COLUMNS)
      .single();

    if (error || !data) {
      await supabase.storage.from(BIA_REPORTS_BUCKET).remove([storagePath]);
      return dbError('report_create_failed', 'PDF caricato, ma registrazione BIA non creata.', error);
    }

    const parsed = await requestBiaParsing(reportId);
    if (!parsed.ok && __DEV__) {
      console.warn('BIA_PARSE_REQUEST_FAILED', parsed.code, parsed.message);
    }
    return getBiaReport(reportId);
  } catch (error) {
    return thrownError('upload_failed', 'Caricamento PDF fallito.', error);
  }
}

export async function getBiaReport(reportId: string): Promise<ServiceResult<BiaReport>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.from('bia_reports').select(REPORT_COLUMNS).eq('id', reportId).single();
  if (error || !data) return dbError('report_load_failed', 'Impossibile caricare il report BIA.', error);
  return { ok: true, data: mapReportRow(data as unknown as ReportRow) };
}

export async function requestBiaParsing(reportId: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error } = await supabase.functions.invoke('parse-bia-report', { body: { report_id: reportId } });
  if (error) return dbError('parse_failed', 'Analisi BIA non disponibile. Puoi procedere con revisione manuale.', error);
  return { ok: true, data: null };
}

export async function createClientMeasurement(clientId: string, draft: MeasurementDraft): Promise<ServiceResult<ClientMeasurement>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  const coachId = session.data.user.id;
  const link = await verifyCoachClient(coachId, clientId);
  if (!link.ok) return link;

  const payload = measurementDraftToRow(draft, coachId, clientId, session.data.user.id);
  const { data, error } = await supabase.from('client_measurements').insert(payload).select(MEASUREMENT_COLUMNS).single();
  if (error || !data) return dbError('measurement_create_failed', 'Impossibile salvare la misurazione.', error);

  if (draft.biaReportId) {
    const { error: reportError } = await supabase
      .from('bia_reports')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: session.data.user.id })
      .eq('id', draft.biaReportId)
      .eq('client_id', clientId);
    if (reportError) logSupabaseError('BIA_REPORT_CONFIRM_UPDATE_ERROR', reportError);
  }

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

export async function deleteBiaReport(report: BiaReport): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { error: storageError } = await supabase.storage.from(BIA_REPORTS_BUCKET).remove([report.storagePath]);
  if (storageError) return dbError('report_file_delete_failed', 'Impossibile eliminare il PDF BIA.', storageError);
  const { error } = await supabase.from('bia_reports').delete().eq('id', report.id);
  if (error) return dbError('report_delete_failed', 'PDF eliminato, ma riga BIA non rimossa.', error);
  return { ok: true, data: null };
}

export async function createBiaReportSignedUrl(storagePath: string): Promise<ServiceResult<string>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.storage.from(BIA_REPORTS_BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) return dbError('signed_url_failed', 'Impossibile aprire il PDF originale.', error);
  return { ok: true, data: data.signedUrl };
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

async function findDuplicateReport(coachId: string, clientId: string, fileHash: string): Promise<ServiceResult<boolean>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('bia_reports')
    .select('id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .eq('file_hash', fileHash)
    .neq('status', 'failed')
    .maybeSingle();
  if (error) return dbError('duplicate_check_failed', 'Impossibile verificare duplicati BIA.', error);
  return { ok: true, data: Boolean(data) };
}

function isPdfAsset(asset: DocumentPicker.DocumentPickerAsset) {
  const name = asset.name?.toLowerCase() ?? '';
  return asset.mimeType === 'application/pdf' || name.endsWith('.pdf');
}

async function readDocumentBody(asset: DocumentPicker.DocumentPickerAsset): Promise<{ uploadBody: File | ArrayBuffer; hashSource: Uint8Array | string }> {
  const file = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
  if (Platform.OS === 'web' && file) {
    const buffer = await file.arrayBuffer();
    return { uploadBody: file, hashSource: new Uint8Array(buffer) };
  }
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return { uploadBody: decode(base64), hashSource: base64 };
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
type ReportRow = Record<string, unknown>;

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

function mapReportRow(row: ReportRow): BiaReport {
  return {
    id: String(row.id),
    coachId: String(row.coach_id),
    clientId: String(row.client_id),
    storagePath: String(row.storage_path),
    originalFilename: nullableString(row.original_filename),
    mimeType: nullableString(row.mime_type),
    fileSize: nullableNumber(row.file_size),
    fileHash: nullableString(row.file_hash),
    status: typeof row.status === 'string' ? row.status as BiaReport['status'] : 'uploaded',
    extractedText: nullableString(row.extracted_text),
    extractedData: typeof row.extracted_data === 'object' && row.extracted_data ? row.extracted_data as BiaReport['extractedData'] : null,
    extractionConfidence: typeof row.extraction_confidence === 'object' && row.extraction_confidence ? row.extraction_confidence as BiaReport['extractionConfidence'] : null,
    extractionProvider: nullableString(row.extraction_provider),
    errorCode: nullableString(row.error_code),
    errorMessage: nullableString(row.error_message),
    uploadedAt: String(row.uploaded_at),
    processedAt: nullableString(row.processed_at),
    confirmedAt: nullableString(row.confirmed_at),
    confirmedBy: nullableString(row.confirmed_by),
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

function hashBytes(input: Uint8Array | string) {
  let hash = 2166136261;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i += 1) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  } else {
    for (const byte of input) hash = Math.imul(hash ^ byte, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function randomUuid() {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
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

function thrownError(code: string, message: string, error: unknown): ServiceResult<never> {
  logSupabaseError(`CLIENT_METRICS_${code.toUpperCase()}`, error);
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
