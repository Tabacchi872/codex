// 'bia_pdf' resta un valore valido SOLO per leggere correttamente le righe
// storiche create quando il flusso BIA esisteva ancora (mai piu' scritto
// dall'app dopo la rimozione del flusso BIA): vedi client-metrics-service.ts.
export type ClientMeasurementSource = 'manual' | 'bia_pdf' | 'imported';

export type MetricQuality = 'recognized' | 'review' | 'missing';

export type MetricValueKey =
  | 'weightKg'
  | 'heightCm'
  | 'bmi'
  | 'bodyFatPercent'
  | 'bodyFatKg'
  | 'leanMassKg'
  | 'muscleMassKg'
  | 'skeletalMuscleMassKg'
  | 'totalBodyWaterPercent'
  | 'totalBodyWaterL'
  | 'intracellularWaterL'
  | 'extracellularWaterL'
  | 'visceralFat'
  | 'basalMetabolicRateKcal'
  | 'phaseAngle'
  | 'waistCm'
  | 'hipsCm'
  | 'chestCm'
  | 'leftArmCm'
  | 'rightArmCm'
  | 'leftThighCm'
  | 'rightThighCm'
  | 'leftCalfCm'
  | 'rightCalfCm';

export type ClientMeasurement = {
  id: string;
  coachId: string;
  clientId: string;
  biaReportId?: string | null;
  source: ClientMeasurementSource;
  measuredAt: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  bodyFatKg?: number | null;
  leanMassKg?: number | null;
  muscleMassKg?: number | null;
  skeletalMuscleMassKg?: number | null;
  totalBodyWaterPercent?: number | null;
  totalBodyWaterL?: number | null;
  intracellularWaterL?: number | null;
  extracellularWaterL?: number | null;
  visceralFat?: number | null;
  basalMetabolicRateKcal?: number | null;
  phaseAngle?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  chestCm?: number | null;
  leftArmCm?: number | null;
  rightArmCm?: number | null;
  leftThighCm?: number | null;
  rightThighCm?: number | null;
  leftCalfCm?: number | null;
  rightCalfCm?: number | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  measurementLocation?: string | null;
  coachComment?: string | null;
  clientVisibleComment?: string | null;
  rawOptionalMetrics?: Record<string, unknown> | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MeasurementDraft = Omit<ClientMeasurement, 'id' | 'coachId' | 'clientId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;

export type MetricDefinition = {
  key: MetricValueKey;
  label: string;
  unit: string;
  positiveDirection: 'increase' | 'decrease' | 'neutral';
};
