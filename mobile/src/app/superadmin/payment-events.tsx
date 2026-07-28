import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { getSuperadminPayments, type SuperadminPaymentRow, type SuperadminPayments } from '@/lib/superadmin-platform-service';
import {
  clientDisplayName,
  dedupePayments,
  formatPaymentAmount,
  formatPaymentDate,
  isSandboxEnvironment,
  missingPaymentFields,
  revenueCatEventPresentation,
} from '@/lib/superadmin-payment-utils';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type Tab = 'coach' | 'client_pro';

export default function SuperadminPaymentEvents() {
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<Tab>('coach');
  const [data, setData] = useState<SuperadminPayments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getSuperadminPayments();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tab === 'coach' ? data?.coachPayments ?? [] : dedupePayments(data?.clientProPayments ?? []);

  return (
    <SuperadminShell title="Pagamenti" description="Pagamenti separati tra coach e Client Pro RevenueCat.">
      <View style={[styles.tabBar, { borderColor: colors.border }]}>
        <TabButton label="Pagamenti Coach" active={tab === 'coach'} onPress={() => setTab('coach')} />
        <TabButton label="Client Pro" active={tab === 'client_pro'} onPress={() => setTab('client_pro')} />
      </View>

      <AppButton label="Aggiorna" onPress={load} variant="outline" fullWidth loading={loading} />

      {error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={load} />
        </AppCard>
      ) : loading ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento pagamenti...</Text>
        </AppCard>
      ) : rows.length === 0 ? (
        <AppCard>
          <AppEmptyState
            title="Nessun pagamento"
            subtitle={tab === 'coach' ? 'Nessun evento pagamento coach disponibile.' : 'Nessun evento RevenueCat Client Pro disponibile.'}
          />
        </AppCard>
      ) : (
        rows.map((row) => <PaymentCard key={row.id} row={row} clientPro={tab === 'client_pro'} />)
      )}
    </SuperadminShell>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.tabButton, active && { backgroundColor: colors.coralSoft }]}>
      <Text style={[styles.tabLabel, { color: active ? colors.coral : colors.inkSoft, fontWeight: active ? '800' : '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PaymentCard({ row, clientPro }: { row: SuperadminPaymentRow; clientPro: boolean }) {
  const { colors } = useAppTheme();
  const sandbox = isSandboxEnvironment(row.environment);
  const presentation = clientPro ? revenueCatEventPresentation(row.eventType ?? row.eventStatus ?? row.status) : null;
  const displayName = clientPro ? clientDisplayName(row) : row.userName || row.userEmail || 'Coach non risolto';
  const missing = clientPro ? missingPaymentFields(row) : [];

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={2}>
            {clientPro ? presentation?.label ?? 'Evento RevenueCat' : row.packageName ?? 'Abbonamento coach'}
          </Text>
        </View>
        <View style={styles.badges}>
          {sandbox ? <AppBadge label="TEST / SANDBOX" tone="amber" /> : null}
          <AppBadge
            label={clientPro ? presentation?.label ?? 'EVENTO NON RICONOSCIUTO' : statusLabel(row.status)}
            tone={clientPro ? (presentation?.tone ?? 'neutral') : statusTone(row.status)}
          />
        </View>
      </View>

      <View style={styles.grid}>
        <Field label="Product identifier" value={row.productIdentifier ?? 'Dato non disponibile'} />
        <Field label={clientPro ? 'Store' : 'Provider'} value={(clientPro ? row.store : row.provider) ?? 'Dato non disponibile'} />
        <Field label="Transaction/Event ID" value={row.transactionId ?? row.originalTransactionId ?? row.eventId ?? 'Dato non disponibile'} />
        <Field label="Data" value={formatPaymentDate(row.date ?? row.purchasedAt ?? row.receivedAt)} />
        <Field label="Importo" value={formatPaymentAmount(row.amount, row.currency, row.amountUnavailableReason)} />
        <Field label="Scadenza" value={row.expiresAt ? formatPaymentDate(row.expiresAt) : 'Dato non disponibile'} />
        {clientPro ? <Field label="Stato abbonamento" value={row.subscriptionStatus ?? 'Dato non disponibile'} /> : null}
        {clientPro ? <Field label="Ambiente" value={row.environment ?? 'Sconosciuto'} /> : null}
      </View>
      {clientPro && missing.length > 0 ? (
        <Text style={[styles.diagnosticText, { color: colors.inkFaint }]} numberOfLines={2}>
          Dati mancanti: {missing.join(', ')}
        </Text>
      ) : null}
    </AppCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Attivo',
    pending: 'Pending',
    expired: 'Scaduto',
    canceled: 'Cancellato',
    refunded: 'Rimborsato',
    revoked: 'Revocato',
    initial_purchase: 'Acquisto',
    renewal: 'Rinnovo',
    refund: 'Rimborso',
  };
  return labels[status.toLowerCase()] ?? status;
}

function statusTone(status: string): AppBadgeTone {
  const value = status.toLowerCase();
  if (value === 'active' || value === 'initial_purchase' || value === 'renewal') return 'moss';
  if (value === 'pending' || value === 'canceled') return 'amber';
  if (value === 'refunded' || value === 'revoked' || value === 'refund') return 'rust';
  return 'neutral';
}

const styles = StyleSheet.create({
  tabBar: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  tabLabel: {
    fontSize: AppFontSize.sm,
  },
  card: {
    gap: AppSpacing[2],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  badges: {
    alignItems: 'flex-end',
    gap: AppSpacing[1],
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  field: {
    flexBasis: 148,
    flexGrow: 1,
    gap: 2,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  diagnosticText: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '600',
  },
});
