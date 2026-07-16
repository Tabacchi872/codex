import type { ClientMeasurement, MetricDefinition, MetricValueKey } from '@/types/client-metrics';

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: 'weightKg', label: 'Peso', unit: 'kg', positiveDirection: 'neutral' },
  { key: 'bodyFatPercent', label: 'Massa grassa', unit: '%', positiveDirection: 'decrease' },
  { key: 'bodyFatKg', label: 'Massa grassa', unit: 'kg', positiveDirection: 'decrease' },
  { key: 'leanMassKg', label: 'Massa magra', unit: 'kg', positiveDirection: 'increase' },
  { key: 'muscleMassKg', label: 'Massa muscolare', unit: 'kg', positiveDirection: 'increase' },
  { key: 'skeletalMuscleMassKg', label: 'Muscolo scheletrico', unit: 'kg', positiveDirection: 'increase' },
  { key: 'waistCm', label: 'Girovita', unit: 'cm', positiveDirection: 'decrease' },
  { key: 'hipsCm', label: 'Fianchi', unit: 'cm', positiveDirection: 'neutral' },
  { key: 'visceralFat', label: 'Grasso viscerale', unit: '', positiveDirection: 'decrease' },
  { key: 'totalBodyWaterPercent', label: 'Acqua corporea', unit: '%', positiveDirection: 'neutral' },
  { key: 'phaseAngle', label: 'Angolo di fase', unit: '', positiveDirection: 'increase' },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basale', unit: 'kcal', positiveDirection: 'neutral' },
];

export type MetricComparison = {
  key: MetricValueKey;
  label: string;
  unit: string;
  from: number;
  to: number;
  delta: number;
  percentDelta: number | null;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  fromDate: string;
  toDate: string;
};

export function sortMeasurements(measurements: ClientMeasurement[]) {
  return [...measurements].sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
}

export function getLatestMeasurements(measurements: ClientMeasurement[]) {
  const ordered = sortMeasurements(measurements);
  return {
    first: ordered[0] ?? null,
    previous: ordered.length > 1 ? ordered[ordered.length - 2] : null,
    latest: ordered.at(-1) ?? null,
  };
}

export function compareMeasurements(from: ClientMeasurement | null, to: ClientMeasurement | null): MetricComparison[] {
  if (!from || !to) return [];
  return METRIC_DEFINITIONS.flatMap((definition) => {
    const fromValue = readMetric(from, definition.key);
    const toValue = readMetric(to, definition.key);
    if (fromValue === null || toValue === null) return [];
    const delta = roundMetric(toValue - fromValue);
    const percentDelta = fromValue !== 0 ? roundMetric((delta / Math.abs(fromValue)) * 100) : null;
    return [{
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      from: fromValue,
      to: toValue,
      delta,
      percentDelta,
      tone: interpretDelta(definition, delta),
      fromDate: from.measuredAt,
      toDate: to.measuredAt,
    }];
  });
}

export function readMetric(measurement: ClientMeasurement, key: MetricValueKey): number | null {
  const value = measurement[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatMetricValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const digits = Math.abs(value) >= 100 ? 0 : 1;
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
}

export function devicesDiffer(a: ClientMeasurement | null, b: ClientMeasurement | null) {
  if (!a || !b) return false;
  const left = `${a.deviceBrand ?? ''} ${a.deviceModel ?? ''}`.trim().toLowerCase();
  const right = `${b.deviceBrand ?? ''} ${b.deviceModel ?? ''}`.trim().toLowerCase();
  return Boolean(left && right && left !== right);
}

export function calculateBmi(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return roundMetric(weightKg / (meters * meters));
}

function interpretDelta(definition: MetricDefinition, delta: number): MetricComparison['tone'] {
  if (Math.abs(delta) < 0.05 || definition.positiveDirection === 'neutral') return 'neutral';
  if (definition.positiveDirection === 'increase') return delta > 0 ? 'positive' : 'warning';
  return delta < 0 ? 'positive' : 'negative';
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
