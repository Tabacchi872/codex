import { useLocalSearchParams, type Href } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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

          <JsonSection title="Ciclo corrente" value={detail.currentCycle} empty="Nessun ciclo corrente." />
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
          <Section title="Check-in" items={detail.checkins} empty="Nessun check-in." renderItem={(item, index) => <JsonCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Review" items={detail.reviews} empty="Nessuna review." renderItem={(item, index) => <JsonCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Notifiche" items={detail.notifications} empty="Nessuna notifica." renderItem={(item, index) => <JsonCard key={stringValue(item.id) || index} value={item} />} />
          <Section title="Override Superadmin" items={detail.overrides} empty="Nessun override Superadmin." renderItem={(item, index) => <JsonCard key={stringValue(item.id) || index} value={item} />} />
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

function JsonSection({ title, value, empty }: { title: string; value: Record<string, unknown> | null; empty: string }) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.card}>
      <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>{title}</Text>
      {value ? <JsonCard value={value} /> : <Text style={[styles.smallText, { color: colors.inkSoft }]}>{empty}</Text>}
    </AppCard>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[styles.infoCard, { borderColor: colors.border }]}>{children}</View>;
}

function JsonCard({ value }: { value: Record<string, unknown> }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.infoCard, { borderColor: colors.border }]}>
      <Text style={[styles.jsonText, { color: colors.inkSoft }]}>{JSON.stringify(value, null, 2)}</Text>
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
  jsonText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 15,
  },
});
