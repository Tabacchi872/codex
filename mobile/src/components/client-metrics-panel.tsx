import { FileText, Pencil, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';

import { AppButton, AppCard, AppTextField } from '@/components/ui';
import { useClientMetrics } from '@/hooks/use-client-metrics';
import {
  calculateBmi,
  compareMeasurements,
  devicesDiffer,
  formatMetricValue,
  getLatestMeasurements,
  METRIC_DEFINITIONS,
  readMetric,
  sortMeasurements,
} from '@/lib/client-metrics-comparison';
import {
  createBiaReportSignedUrl,
  createClientMeasurement,
  deleteBiaReport,
  deleteClientMeasurement,
  pickBiaPdf,
  updateClientMeasurement,
  uploadBiaReport,
} from '@/lib/client-metrics-service';
import { formatDayMonth } from '@/lib/format-date';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { BiaReport, ClientMeasurement, MeasurementDraft, MetricValueKey } from '@/types/client-metrics';

type ClientMetricsPanelProps = {
  clientId: string;
  clientName: string;
  readOnly?: boolean;
};

type FieldConfig = { key: MetricValueKey; label: string; unit: string };

const FIELD_GROUPS: { title: string; fields: FieldConfig[] }[] = [
  {
    title: 'Composizione corporea',
    fields: [
      { key: 'weightKg', label: 'Peso', unit: 'kg' },
      { key: 'heightCm', label: 'Altezza', unit: 'cm' },
      { key: 'bmi', label: 'BMI / IMC', unit: '' },
      { key: 'bodyFatPercent', label: 'Massa grassa', unit: '%' },
      { key: 'bodyFatKg', label: 'Massa grassa', unit: 'kg' },
      { key: 'leanMassKg', label: 'Massa magra', unit: 'kg' },
      { key: 'muscleMassKg', label: 'Massa muscolare', unit: 'kg' },
      { key: 'skeletalMuscleMassKg', label: 'Muscolo scheletrico', unit: 'kg' },
    ],
  },
  {
    title: 'Idratazione e metabolismo',
    fields: [
      { key: 'totalBodyWaterPercent', label: 'Acqua corporea', unit: '%' },
      { key: 'totalBodyWaterL', label: 'Acqua corporea', unit: 'L' },
      { key: 'intracellularWaterL', label: 'Acqua intracellulare', unit: 'L' },
      { key: 'extracellularWaterL', label: 'Acqua extracellulare', unit: 'L' },
      { key: 'visceralFat', label: 'Grasso viscerale', unit: '' },
      { key: 'basalMetabolicRateKcal', label: 'Metabolismo basale', unit: 'kcal' },
      { key: 'phaseAngle', label: 'Angolo di fase', unit: '' },
    ],
  },
  {
    title: 'Circonferenze',
    fields: [
      { key: 'waistCm', label: 'Girovita', unit: 'cm' },
      { key: 'hipsCm', label: 'Fianchi', unit: 'cm' },
      { key: 'chestCm', label: 'Torace', unit: 'cm' },
      { key: 'leftArmCm', label: 'Braccio sinistro', unit: 'cm' },
      { key: 'rightArmCm', label: 'Braccio destro', unit: 'cm' },
      { key: 'leftThighCm', label: 'Coscia sinistra', unit: 'cm' },
      { key: 'rightThighCm', label: 'Coscia destra', unit: 'cm' },
      { key: 'leftCalfCm', label: 'Polpaccio sinistro', unit: 'cm' },
      { key: 'rightCalfCm', label: 'Polpaccio destro', unit: 'cm' },
    ],
  },
];

const EMPTY_FORM = {
  measuredAt: new Date().toISOString().slice(0, 16),
  deviceBrand: '',
  deviceModel: '',
  measurementLocation: '',
  coachComment: '',
  clientVisibleComment: '',
};

export function ClientMetricsPanel({ clientId, clientName, readOnly = false }: ClientMetricsPanelProps) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { measurements, reports, loading, error, reload } = useClientMetrics(clientId, !readOnly);
  const ordered = useMemo(() => sortMeasurements(measurements), [measurements]);
  const { first, previous, latest } = useMemo(() => getLatestMeasurements(measurements), [measurements]);
  const fromStart = useMemo(() => compareMeasurements(first, latest), [first, latest]);
  const fromPrevious = useMemo(() => compareMeasurements(previous, latest), [previous, latest]);
  const [formMode, setFormMode] = useState<'closed' | 'manual' | 'review'>('closed');
  const [editingMeasurement, setEditingMeasurement] = useState<ClientMeasurement | null>(null);
  const [reviewReport, setReviewReport] = useState<BiaReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function handleUploadPdf() {
    if (uploading) return;
    setActionMessage(null);
    const picked = await pickBiaPdf();
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const confirmed = await confirmAction(`Caricare "${asset.name}" per ${clientName}?`);
    if (!confirmed) return;
    setUploading(true);
    const result = await uploadBiaReport(clientId, asset);
    setUploading(false);
    if (!result.ok) {
      setActionMessage(result.message);
      return;
    }
    setReviewReport(result.data);
    setEditingMeasurement(null);
    setFormMode('review');
    await reload();
  }

  async function handleOpenPdf(report: BiaReport) {
    const result = await createBiaReportSignedUrl(report.storagePath);
    if (!result.ok) {
      setActionMessage(result.message);
      return;
    }
    await Linking.openURL(result.data);
  }

  async function handleDeleteMeasurement(measurement: ClientMeasurement) {
    const confirmed = await confirmAction('Eliminare questa rilevazione dallo storico?');
    if (!confirmed) return;
    const result = await deleteClientMeasurement(measurement.id);
    setActionMessage(result.ok ? 'Rilevazione eliminata.' : result.message);
    if (result.ok) await reload();
  }

  async function handleDeleteReport(report: BiaReport) {
    const confirmed = await confirmAction('Eliminare soltanto il PDF BIA collegato?');
    if (!confirmed) return;
    const result = await deleteBiaReport(report);
    setActionMessage(result.ok ? 'PDF BIA eliminato.' : result.message);
    if (result.ok) await reload();
  }

  if (formMode !== 'closed') {
    return (
      <MeasurementReviewForm
        clientId={clientId}
        clientName={clientName}
        report={reviewReport}
        measurement={editingMeasurement}
        onCancel={() => {
          setFormMode('closed');
          setEditingMeasurement(null);
          setReviewReport(null);
        }}
        onSaved={async () => {
          setFormMode('closed');
          setEditingMeasurement(null);
          setReviewReport(null);
          await reload();
        }}
      />
    );
  }

  return (
    <View style={styles.panel}>
      {loading ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento metriche...</Text> : null}
      {error ? <Text style={[styles.smallText, { color: colors.rust }]}>{error}</Text> : null}
      {actionMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{actionMessage}</Text> : null}

      {!readOnly ? (
        <View style={[styles.actionsRow, compact && styles.actionsColumn]}>
          <AppButton label="Aggiungi misurazione" onPress={() => setFormMode('manual')} fullWidth={compact} />
          <AppButton label={uploading ? 'Caricamento...' : 'Carica PDF BIA'} onPress={handleUploadPdf} loading={uploading} disabled={uploading} variant="outline" fullWidth={compact} />
        </View>
      ) : null}

      <AppCard style={styles.cardGap}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Ultimo controllo</Text>
        {latest ? (
          <>
            <Text style={[styles.sectionValue, { color: colors.ink }]}>{formatDayMonth(latest.measuredAt)}</Text>
            <View style={styles.metricGrid}>
              <MetricTile label="Peso" value={formatMetricValue(latest.weightKg, 'kg')} />
              <MetricTile label="Massa grassa" value={formatMetricValue(latest.bodyFatPercent ?? latest.bodyFatKg, latest.bodyFatPercent ? '%' : 'kg')} />
              <MetricTile label="Girovita" value={formatMetricValue(latest.waistCm, 'cm')} />
            </View>
            {latest.clientVisibleComment ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{latest.clientVisibleComment}</Text> : null}
          </>
        ) : (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessuna rilevazione confermata.</Text>
        )}
      </AppCard>

      <ComparisonCard title="Ultimo controllo" comparisons={fromPrevious} from={previous} to={latest} />
      <ComparisonCard title="Dall'inizio" comparisons={fromStart} from={first} to={latest} />

      {devicesDiffer(previous, latest) || devicesDiffer(first, latest) ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.rust }]}>Confronto indicativo: rilevazioni effettuate con dispositivi differenti.</Text>
        </AppCard>
      ) : null}

      <AppCard style={styles.cardGap}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Grafici temporali</Text>
        <MetricChart measurements={ordered} metricKey="weightKg" label="Peso" unit="kg" />
        <MetricChart measurements={ordered} metricKey="bodyFatPercent" label="Massa grassa" unit="%" />
        <MetricChart measurements={ordered} metricKey="waistCm" label="Girovita" unit="cm" />
      </AppCard>

      <AppCard style={styles.cardGap}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Storico misurazioni</Text>
        {ordered.length === 0 ? (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessuna misurazione salvata.</Text>
        ) : (
          ordered.slice().reverse().map((measurement) => (
            <View key={measurement.id} style={[styles.historyRow, { borderColor: colors.border }]}>
              <View style={styles.historyText}>
                <Text style={[styles.historyTitle, { color: colors.ink }]}>{formatDayMonth(measurement.measuredAt)}</Text>
                <Text style={[styles.smallText, { color: colors.inkSoft }]}>
                  Peso {formatMetricValue(measurement.weightKg, 'kg')} · Grasso {formatMetricValue(measurement.bodyFatPercent, '%')} · Girovita {formatMetricValue(measurement.waistCm, 'cm')}
                </Text>
                {measurement.deviceBrand || measurement.deviceModel ? (
                  <Text style={[styles.smallText, { color: colors.inkSoft }]}>{`${measurement.deviceBrand ?? ''} ${measurement.deviceModel ?? ''}`.trim()}</Text>
                ) : null}
              </View>
              {!readOnly ? (
                <View style={styles.iconActions}>
                  <Pressable onPress={() => { setEditingMeasurement(measurement); setFormMode('manual'); }} hitSlop={8}>
                    <Pencil size={18} color={colors.moss} />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteMeasurement(measurement)} hitSlop={8}>
                    <Trash2 size={18} color={colors.rust} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </AppCard>

      {!readOnly ? (
        <AppCard style={styles.cardGap}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>PDF BIA</Text>
          {reports.length === 0 ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun PDF caricato.</Text> : null}
          {reports.map((report) => (
            <View key={report.id} style={[styles.reportRow, { borderColor: colors.border }]}>
              <FileText size={18} color={colors.moss} />
              <View style={styles.historyText}>
                <Text style={[styles.historyTitle, { color: colors.ink }]} numberOfLines={1}>{report.originalFilename ?? 'BIA.pdf'}</Text>
                <Text style={[styles.smallText, { color: colors.inkSoft }]}>Stato: {report.status}</Text>
              </View>
              <AppButton label="Apri" size="sm" variant="ghost" onPress={() => handleOpenPdf(report)} />
              <Pressable onPress={() => handleDeleteReport(report)} hitSlop={8}>
                <Trash2 size={18} color={colors.rust} />
              </Pressable>
            </View>
          ))}
        </AppCard>
      ) : null}
    </View>
  );
}

function MeasurementReviewForm({
  clientId,
  clientName,
  report,
  measurement,
  onCancel,
  onSaved,
}: {
  clientId: string;
  clientName: string;
  report: BiaReport | null;
  measurement: ClientMeasurement | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => buildInitialForm(report, measurement));

  useEffect(() => {
    const weight = parseNumber(form.weightKg);
    const height = parseNumber(form.heightCm);
    if (form.bmi.trim()) return;
    const bmi = calculateBmi(weight, height);
    if (bmi) setForm((current) => ({ ...current, bmi: String(bmi).replace('.', ',') }));
  }, [form.weightKg, form.heightCm, form.bmi]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const draft = buildDraft(form, report);
    const result = measurement
      ? await updateClientMeasurement({ ...measurement, ...draft, updatedAt: measurement.updatedAt })
      : await createClientMeasurement(clientId, draft);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    await onSaved();
  }

  return (
    <View style={styles.panel}>
      <AppCard style={styles.cardGap}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Controlla dati BIA</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{clientName}</Text>
        {report ? (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>
            File: {report.originalFilename ?? 'PDF BIA'} · Stato {report.status}
          </Text>
        ) : (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Inserimento manuale</Text>
        )}
        {report?.errorMessage ? <Text style={[styles.smallText, { color: colors.rust }]}>{report.errorMessage}</Text> : null}
      </AppCard>

      <AppTextField label="Data e ora rilevazione" value={form.measuredAt} onChangeText={(value) => patchForm(setForm, 'measuredAt', value)} placeholder="2026-07-16T10:30" />

      {FIELD_GROUPS.map((group) => (
        <AppCard key={group.title} style={styles.cardGap}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>{group.title}</Text>
          <View style={styles.formGrid}>
            {group.fields.map((field) => (
              <View key={field.key} style={styles.formField}>
                <AppTextField
                  label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`}
                  value={form[field.key] ?? ''}
                  onChangeText={(value) => patchForm(setForm, field.key, value)}
                  keyboardType="decimal-pad"
                />
                <MetricReviewState report={report} fieldKey={field.key} value={form[field.key]} />
              </View>
            ))}
          </View>
        </AppCard>
      ))}

      <AppCard style={styles.cardGap}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Dispositivo e note</Text>
        <AppTextField label="Marca dispositivo" value={form.deviceBrand} onChangeText={(value) => patchForm(setForm, 'deviceBrand', value)} />
        <AppTextField label="Modello dispositivo" value={form.deviceModel} onChangeText={(value) => patchForm(setForm, 'deviceModel', value)} />
        <AppTextField label="Luogo misurazione" value={form.measurementLocation} onChangeText={(value) => patchForm(setForm, 'measurementLocation', value)} />
        <AppTextField label="Commento interno coach" value={form.coachComment} onChangeText={(value) => patchForm(setForm, 'coachComment', value)} multiline />
        <AppTextField label="Commento visibile al cliente" value={form.clientVisibleComment} onChangeText={(value) => patchForm(setForm, 'clientVisibleComment', value)} multiline />
      </AppCard>

      {message ? <Text style={[styles.smallText, { color: colors.rust }]}>{message}</Text> : null}
      <View style={styles.actionsColumn}>
        <AppButton label="Conferma e aggiorna progressi" onPress={handleSave} loading={saving} disabled={saving} fullWidth />
        <AppButton label="Annulla" onPress={onCancel} variant="outline" fullWidth />
      </View>
    </View>
  );
}

function ComparisonCard({ title, comparisons, from, to }: { title: string; comparisons: ReturnType<typeof compareMeasurements>; from: ClientMeasurement | null; to: ClientMeasurement | null }) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.cardGap}>
      <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text>
      {comparisons.length === 0 ? (
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Servono almeno due rilevazioni comparabili.</Text>
      ) : (
        comparisons.slice(0, 6).map((item) => (
          <View key={item.key} style={styles.comparisonRow}>
            <View style={styles.historyText}>
              <Text style={[styles.historyTitle, { color: colors.ink }]}>{item.label}</Text>
              <Text style={[styles.smallText, { color: colors.inkSoft }]}>
                {formatMetricValue(item.from, item.unit)} → {formatMetricValue(item.to, item.unit)}
              </Text>
            </View>
            <Text style={[styles.delta, { color: toneColor(colors, item.tone) }]}>
              {item.delta > 0 ? '+' : ''}{formatMetricValue(item.delta, item.unit)}
            </Text>
          </View>
        ))
      )}
      {from && to ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{formatDayMonth(from.measuredAt)} → {formatDayMonth(to.measuredAt)}</Text> : null}
    </AppCard>
  );
}

function MetricChart({ measurements, metricKey, label, unit }: { measurements: ClientMeasurement[]; metricKey: MetricValueKey; label: string; unit: string }) {
  const { colors } = useAppTheme();
  const points = measurements
    .map((measurement) => ({ measurement, value: readMetric(measurement, metricKey) }))
    .filter((item): item is { measurement: ClientMeasurement; value: number } => item.value !== null);
  const width = 300;
  const height = 120;
  if (points.length < 2) {
    return <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}: dati insufficienti.</Text>;
  }
  const values = points.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((item, index) => {
    const x = 18 + (index / Math.max(points.length - 1, 1)) * (width - 36);
    const y = 18 + (1 - (item.value - min) / range) * (height - 42);
    return { x, y, value: item.value };
  });
  return (
    <View style={styles.chartWrap}>
      <Text style={[styles.historyTitle, { color: colors.ink }]}>{label}</Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.moss} strokeWidth={3} />
        {coords.map((point, index) => (
          <Circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r={4} fill={colors.moss} />
        ))}
        <SvgText x={18} y={height - 8} fontSize="10" fill={colors.inkSoft}>{formatMetricValue(values[0], unit)}</SvgText>
        <SvgText x={width - 78} y={height - 8} fontSize="10" fill={colors.inkSoft}>{formatMetricValue(values.at(-1), unit)}</SvgText>
      </Svg>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metricTile, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
      <Text style={[styles.metricTileLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.metricTileValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function MetricReviewState({ report, fieldKey, value }: { report: BiaReport | null; fieldKey: MetricValueKey; value: string | undefined }) {
  const { colors } = useAppTheme();
  if (!report) return null;
  const confidence = report.extractionConfidence?.[fieldKey];
  const label = value?.trim() ? confidence !== undefined && confidence < 0.7 ? 'Da controllare' : 'Riconosciuto' : 'Non trovato';
  const color = label === 'Riconosciuto' ? colors.moss : label === 'Da controllare' ? colors.coral : colors.inkSoft;
  return <Text style={[styles.reviewState, { color }]}>{label}{confidence !== undefined ? ` · ${Math.round(confidence * 100)}%` : ''}</Text>;
}

function buildInitialForm(report: BiaReport | null, measurement: ClientMeasurement | null) {
  const data = report?.extractedData ?? {};
  const source = measurement ?? data;
  const result: Record<string, string> = {
    ...EMPTY_FORM,
    measuredAt: toLocalInput(String((source as Record<string, unknown>).measuredAt ?? measurement?.measuredAt ?? new Date().toISOString())),
    deviceBrand: String((source as Record<string, unknown>).deviceBrand ?? measurement?.deviceBrand ?? ''),
    deviceModel: String((source as Record<string, unknown>).deviceModel ?? measurement?.deviceModel ?? ''),
    measurementLocation: measurement?.measurementLocation ?? '',
    coachComment: measurement?.coachComment ?? '',
    clientVisibleComment: measurement?.clientVisibleComment ?? '',
  };
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      const value = (source as Record<string, unknown>)[field.key] ?? measurement?.[field.key];
      result[field.key] = typeof value === 'number' ? String(value).replace('.', ',') : '';
    }
  }
  return result;
}

function buildDraft(form: Record<string, string>, report: BiaReport | null): MeasurementDraft {
  const weight = parseNumber(form.weightKg);
  const height = parseNumber(form.heightCm);
  const draft: MeasurementDraft = {
    source: report ? 'bia_pdf' : 'manual',
    biaReportId: report?.id ?? null,
    measuredAt: parseMeasuredAt(form.measuredAt),
    weightKg: weight,
    heightCm: height,
    bmi: parseNumber(form.bmi) ?? calculateBmi(weight, height),
    deviceBrand: cleanText(form.deviceBrand),
    deviceModel: cleanText(form.deviceModel),
    measurementLocation: cleanText(form.measurementLocation),
    coachComment: cleanText(form.coachComment),
    clientVisibleComment: cleanText(form.clientVisibleComment),
    rawOptionalMetrics: null,
  };
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (field.key === 'weightKg' || field.key === 'heightCm' || field.key === 'bmi') continue;
      draft[field.key] = parseNumber(form[field.key]);
    }
  }
  return draft;
}

function patchForm(setter: (updater: (current: Record<string, string>) => Record<string, string>) => void, key: string, value: string) {
  setter((current) => ({ ...current, [key]: value }));
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseMeasuredAt(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toneColor(colors: ReturnType<typeof useAppTheme>['colors'], tone: 'positive' | 'negative' | 'warning' | 'neutral') {
  if (tone === 'positive') return colors.moss;
  if (tone === 'negative') return colors.rust;
  if (tone === 'warning') return colors.coral;
  return colors.inkSoft;
}

async function confirmAction(message: string) {
  if (Platform.OS === 'web') return globalThis.confirm(message);
  return new Promise<boolean>((resolve) => {
    Alert.alert('Conferma', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Conferma', onPress: () => resolve(true) },
    ]);
  });
}

const styles = StyleSheet.create({
  panel: {
    gap: AppSpacing[3],
  },
  cardGap: {
    gap: AppSpacing[3],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  actionsColumn: {
    gap: AppSpacing[2],
  },
  cardTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  sectionValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  smallText: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  metricTile: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 92,
    padding: AppSpacing[3],
  },
  metricTileLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricTileValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  comparisonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  delta: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  chartWrap: {
    width: '100%',
    minWidth: 0,
  },
  historyRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingVertical: AppSpacing[2],
  },
  reportRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingVertical: AppSpacing[2],
  },
  historyText: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  iconActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  formGrid: {
    gap: AppSpacing[2],
  },
  formField: {
    gap: 3,
  },
  reviewState: {
    fontSize: 11,
    fontWeight: '700',
  },
});
