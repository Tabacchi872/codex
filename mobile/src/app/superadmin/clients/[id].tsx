import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, type Href } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, BackHeader, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { getSuperadminClientDetail, type SuperadminClientDetail } from '@/lib/superadmin-platform-service';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

export default function SuperadminClientDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const clientId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<SuperadminClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    const result = await getSuperadminClientDetail(clientId);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDetail(result.data);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const profile = detail?.profile;
  const title = typeof profile?.full_name === 'string' && profile.full_name ? profile.full_name : 'Dettaglio cliente';

  return (
    <SuperadminShell title={title} description="Dettaglio cliente in sola lettura per Superadmin.">
      <BackHeader title={title} fallbackHref={'/superadmin/clients' as Href} />
      {error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={load} />
        </AppCard>
      ) : loading ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento dettaglio cliente...</Text>
        </AppCard>
      ) : !detail ? (
        <AppCard>
          <AppEmptyState title="Cliente non trovato" subtitle="La RPC non ha restituito dati per questo cliente." />
        </AppCard>
      ) : (
        <>
          <AppCard style={styles.card}>
            <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Profilo</Text>
            <View style={styles.grid}>
              <Field label="Nome" value={stringValue(profile?.full_name) || 'Cliente senza nome'} />
              <Field label="Email" value={stringValue(profile?.email)} />
              <Field label="Ruolo" value={stringValue(profile?.role)} />
              <Field label="Registrazione" value={formatDate(stringValue(profile?.created_at))} />
              <Field label="Stato account" value={profile?.is_active === false ? 'Disattivo' : 'Attivo'} />
            </View>
          </AppCard>

          <AppCard style={styles.card}>
            <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Coach</Text>
            {detail.coach ? (
              <View style={styles.grid}>
                <Field label="Coach" value={stringValue(detail.coach.name)} />
                <Field label="Email coach" value={stringValue(detail.coach.email)} />
                <Field label="Stato relazione" value={stringValue(detail.coach.status)} />
              </View>
            ) : (
              <AppBadge label="Nessun coach" tone="amber" />
            )}
          </AppCard>

          <Section title="Client Pro" items={detail.subscriptions} empty="Nessun abbonamento Client Pro o coach registrato per questo cliente." renderItem={(item, index) => (
            <InfoCard key={stringValue(item.id) || index}>
              <View style={styles.headerRow}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>{stringValue(item.packageName) || 'Pacchetto'}</Text>
                <AppBadge label={statusLabel(stringValue(item.status))} tone={statusTone(stringValue(item.status))} />
              </View>
              <View style={styles.grid}>
                <Field label="Target" value={stringValue(item.targetRole)} />
                <Field label="Product ID" value={stringValue(item.productIdentifier) || 'Non configurato'} />
                <Field label="Entitlement" value={stringValue(item.entitlementIdentifier) || 'Non configurato'} />
                <Field label="Provider" value={stringValue(item.payment_provider)} />
                <Field label="Inizio" value={formatDate(stringValue(item.starts_at))} />
                <Field label="Scadenza" value={formatDate(stringValue(item.expires_at))} />
                <Field label="Store price backend" value={item.storePriceStoredInBackend ? 'Disponibile' : 'Non memorizzato'} />
              </View>
            </InfoCard>
          )} />

          <AppCard style={styles.card}>
            <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Questionario fitness</Text>
            {detail.fitnessProfile ? (
              <View style={styles.grid}>
                <Field label="Completato" value={detail.fitnessProfile.completed ? 'Si' : 'No'} />
                <Field label="Completato il" value={formatDate(stringValue(detail.fitnessProfile.completed_at))} />
                <Field label="Luogo" value={stringValue(detail.fitnessProfile.location)} />
                <Field label="Attrezzatura" value={stringValue(detail.fitnessProfile.equipment_level)} />
                <Field label="Supervisione" value={detail.fitnessProfile.requires_professional_supervision ? 'Richiesta' : 'No'} />
              </View>
            ) : (
              <AppBadge label="Questionario non compilato" tone="amber" />
            )}
          </AppCard>

          <CurrentCycleCard cycle={detail.currentCycle} workoutPlans={detail.workoutPlans} />
          <Section title="Schede precedenti e correnti" items={detail.workoutPlans} empty="Nessuna scheda associata." renderItem={(item, index) => (
            <InfoCard key={stringValue(item.id) || index}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>{stringValue(item.name) || 'Scheda'}</Text>
              <View style={styles.grid}>
                <Field label="Origine" value={stringValue(item.origin)} />
                <Field label="Stato" value={stringValue(item.status)} />
                <Field label="Sessione" value={stringValue(item.session_status)} />
                <Field label="Giorno" value={stringValue(item.day_label)} />
                <Field label="Inizio" value={formatDate(stringValue(item.start_date))} />
                <Field label="Scadenza" value={formatDate(stringValue(item.expiry_date))} />
              </View>
            </InfoCard>
          )} />
          <Section title="Check-in" items={detail.checkins} empty="Nessun check-in." renderItem={(item, index) => <GenericRecordCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Review" items={detail.reviews} empty="Nessuna review." renderItem={(item, index) => <GenericRecordCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Notifiche" items={detail.notifications} empty="Nessuna notifica." renderItem={(item, index) => <NotificationCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Override Superadmin" items={detail.overrides} empty="Nessun override Superadmin." renderItem={(item, index) => <GenericRecordCard key={stringValue(item.id) || index} value={item} />} />
        </>
      )}
    </SuperadminShell>
  );
}

function Section({
  title,
  items,
  empty,
  renderItem,
}: {
  title: string;
  items: Record<string, unknown>[];
  empty: string;
  renderItem: (item: Record<string, unknown>, index: number) => React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.card}>
      <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>{title}</Text>
      {items.length === 0 ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{empty}</Text> : items.map(renderItem)}
    </AppCard>
  );
}

function CurrentCycleCard({ cycle, workoutPlans }: { cycle: Record<string, unknown> | null; workoutPlans: Record<string, unknown>[] }) {
  const { colors } = useAppTheme();
  const relatedPlans = workoutPlans.filter((plan) => !cycle?.id || stringValue(plan.cycle_id) === stringValue(cycle.id));
  const visiblePlans = relatedPlans.length > 0 ? relatedPlans : workoutPlans;
  const completedWorkouts = visiblePlans.filter((plan) => stringValue(plan.session_status) === 'completed').length;
  const plannedWorkouts = numberValue(cycle?.planned_sessions) ?? numberValue(cycle?.total_sessions) ?? visiblePlans.length;

  return (
    <AppCard style={styles.card}>
      <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Ciclo corrente</Text>
      {cycle ? (
        <>
          <View style={styles.headerRow}>
            <AppBadge label={cycleStatusLabel(stringValue(cycle.status))} tone={cycleStatusTone(stringValue(cycle.status))} />
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Il programma e' stato assegnato automaticamente in base al questionario.</Text>
          </View>
          <View style={styles.grid}>
            <Field label="Origine" value={cycleOriginLabel(stringValue(cycle.origin) || stringValue(cycle.created_by_role))} />
            <Field label="Nome programma" value={stringValue(cycle.program_name) || stringValue(cycle.name) || stringValue(visiblePlans[0]?.name) || 'Programma automatico'} />
            <Field label="Ciclo numero" value={stringValue(cycle.cycle_number)} />
            <Field label="Data inizio" value={formatDateTime(stringValue(cycle.started_at) || stringValue(cycle.created_at))} />
            <Field label="Data revisione prevista" value={formatDateTime(stringValue(cycle.next_review_at) || stringValue(cycle.review_due_at))} />
            <Field label="Giorni attivi" value={stringValue(cycle.effective_active_days) || stringValue(cycle.active_days)} />
            <Field label="Schede presenti" value={String(visiblePlans.length)} />
            <Field label="Allenamenti previsti" value={String(plannedWorkouts)} />
            <Field label="Allenamenti completati" value={String(completedWorkouts)} />
            <Field label="Ultimo aggiornamento" value={formatDateTime(stringValue(cycle.updated_at))} />
          </View>
          <TechnicalDetails value={cycle} />
        </>
      ) : (
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun ciclo corrente.</Text>
      )}
    </AppCard>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[styles.infoCard, { borderColor: colors.border }]}>{children}</View>;
}

function NotificationCard({ value }: { value: Record<string, unknown> }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.infoCard, { borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.itemTitle, { color: colors.ink }]}>{stringValue(value.title) || notificationTypeLabel(stringValue(value.type))}</Text>
        <AppBadge label={truthy(value.read_at) || truthy(value.read) ? 'Letta' : 'Non letta'} tone={truthy(value.read_at) || truthy(value.read) ? 'neutral' : 'amber'} />
      </View>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{stringValue(value.message) || 'Messaggio non disponibile.'}</Text>
      <View style={styles.grid}>
        <Field label="Tipo" value={notificationTypeLabel(stringValue(value.type))} />
        <Field label="Data e ora" value={formatDateTime(stringValue(value.created_at))} />
        <Field label="Collegamento al ciclo" value={stringValue(value.cycle_number) ? `Ciclo ${stringValue(value.cycle_number)}` : shortId(stringValue(value.cycle_id)) || '-'} />
      </View>
      <TechnicalDetails value={value} allowedKeys={['id', 'type', 'status', 'created_at', 'read_at', 'cycle_id']} />
    </View>
  );
}

function GenericRecordCard({ value }: { value: Record<string, unknown> }) {
  const { colors } = useAppTheme();
  const entries = Object.entries(value).filter(([key]) => !isSensitiveOrInternalKey(key)).slice(0, 8);
  return (
    <View style={[styles.infoCard, { borderColor: colors.border }]}>
      <Text style={[styles.itemTitle, { color: colors.ink }]}>{stringValue(value.title) || stringValue(value.name) || genericRecordTitle(value)}</Text>
      <View style={styles.grid}>
        {entries.map(([key, item]) => (
          <Field key={key} label={fieldLabel(key)} value={formatUnknownValue(item)} />
        ))}
      </View>
      <TechnicalDetails value={value} />
    </View>
  );
}

function TechnicalDetails({ value, allowedKeys }: { value: Record<string, unknown>; allowedKeys?: string[] }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const entries = Object.entries(value)
    .filter(([key]) => (allowedKeys ? allowedKeys.includes(key) : isTechnicalKey(key)))
    .filter(([, item]) => item !== null && item !== undefined);
  if (entries.length === 0) return null;

  async function copyIds() {
    const ids = entries
      .filter(([key]) => key.toLowerCase().endsWith('id') || key.toLowerCase().includes('_id'))
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join('\n');
    if (ids) await Clipboard.setStringAsync(ids);
  }

  return (
    <View style={[styles.techBox, { borderColor: colors.border }]}>
      <Pressable onPress={() => setOpen((value) => !value)} hitSlop={6}>
        <Text style={[styles.techToggle, { color: colors.moss }]}>{open ? 'Nascondi dettagli tecnici' : 'Dettagli tecnici'}</Text>
      </Pressable>
      {open ? (
        <>
          <View style={styles.grid}>
            {entries.map(([key, item]) => (
              <Field key={key} label={fieldLabel(key)} value={formatTechnicalValue(key, item)} />
            ))}
          </View>
          <Pressable onPress={() => void copyIds()} hitSlop={6}>
            <Text style={[styles.techToggle, { color: colors.moss }]}>Copia ID</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]} numberOfLines={3}>{value || '-'}</Text>
    </View>
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

function formatDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Attivo',
    pending: 'Pending',
    expired: 'Scaduto',
    canceled: 'Cancellato',
    refunded: 'Rimborsato',
    revoked: 'Revocato',
  };
  return labels[status] ?? status;
}

function statusTone(status: string): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'pending') return 'amber';
  if (status === 'canceled') return 'neutral';
  return 'rust';
}

function cycleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Attivo',
    draft: 'In attesa',
    pending: 'In attesa',
    pending_template: 'Programma in preparazione',
    pending_safety_review: 'In attesa di revisione',
    pending_subscription: 'Client Pro richiesto',
    completed: 'Completato',
    suspended: 'Sospeso',
    paused: 'Sospeso',
  };
  return labels[status] ?? (status ? fieldLabel(status) : 'In attesa');
}

function cycleStatusTone(status: string): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'completed') return 'neutral';
  if (status === 'pending_safety_review' || status === 'pending_template' || status === 'pending_subscription' || status === 'draft') return 'amber';
  if (status === 'suspended' || status === 'paused') return 'rust';
  return 'neutral';
}

function cycleOriginLabel(value: string) {
  const labels: Record<string, string> = {
    auto: 'Programma automatico',
    automatic: 'Programma automatico',
    auto_program: 'Programma automatico',
    system: 'Programma automatico',
    coach: 'Coach',
    superadmin: 'Superadmin',
    cliente: 'Cliente',
  };
  return labels[value] ?? (value ? fieldLabel(value) : 'Programma automatico');
}

function notificationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    auto_program_assigned: 'Programma automatico assegnato',
    active: 'Attivo',
    pending_template: 'Programma in preparazione',
    pending_safety_review: 'In attesa di revisione',
    cliente: 'Cliente',
    coach: 'Coach',
  };
  return labels[type] ?? (type ? fieldLabel(type) : 'Notifica');
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function truthy(value: unknown) {
  return value === true || (typeof value === 'string' && value.trim().length > 0);
}

function shortId(value: string) {
  if (!value) return '';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function isSensitiveOrInternalKey(key: string) {
  const lowered = key.toLowerCase();
  return lowered.includes('token') || lowered.includes('secret') || lowered === 'dedup_key' || lowered === 'recipient_id' ||
    lowered === 'client_id' || lowered === 'created_by' || lowered === 'template_id' || lowered === 'fitness_profile_snapshot' ||
    lowered === 'decision_reason' || lowered === 'algorithm_version';
}

function isTechnicalKey(key: string) {
  const lowered = key.toLowerCase();
  return lowered === 'id' || lowered.endsWith('_id') || lowered.includes('reason') || lowered.includes('algorithm') ||
    lowered.includes('version') || lowered.includes('snapshot') || lowered.includes('created_by');
}

function formatTechnicalValue(key: string, value: unknown) {
  if (key.toLowerCase().endsWith('id') || key.toLowerCase().includes('_id')) return shortId(stringValue(value));
  return formatUnknownValue(value);
}

function formatUnknownValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDateTime(value);
    return value;
  }
  if (Array.isArray(value)) return value.length === 0 ? 'Nessun elemento' : `${value.length} elementi`;
  return 'Dato strutturato';
}

function fieldLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function genericRecordTitle(value: Record<string, unknown>) {
  if (stringValue(value.status)) return statusLabel(stringValue(value.status));
  if (stringValue(value.type)) return notificationTypeLabel(stringValue(value.type));
  return 'Elemento';
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  field: {
    flexBasis: 140,
    flexGrow: 1,
    gap: 2,
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  infoCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    paddingTop: AppSpacing[2],
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  techBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    paddingTop: AppSpacing[2],
  },
  techToggle: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
