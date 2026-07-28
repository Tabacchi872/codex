import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { getClientProSummary, type ClientProSummary } from '@/lib/superadmin-platform-service';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

export default function SuperadminClientPro() {
  const { colors } = useAppTheme();
  const [data, setData] = useState<ClientProSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getClientProSummary();
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

  return (
    <SuperadminShell title="Client Pro" description="Abbonamento clienti self-guided via RevenueCat e store mobile.">
      <AppButton label="Aggiorna" onPress={load} variant="outline" fullWidth loading={loading} />
      {error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={load} />
        </AppCard>
      ) : loading ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento Client Pro...</Text>
        </AppCard>
      ) : !data ? (
        <AppCard>
          <AppEmptyState title="Dati non disponibili" subtitle="La RPC Client Pro non ha restituito dati." />
        </AppCard>
      ) : (
        <>
          <AppCard style={styles.card}>
            <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Stato utenti</Text>
            <View style={styles.grid}>
              <Metric label="Attivi" value={data.counts.active ?? 0} />
              <Metric label="Scaduti" value={data.counts.expired ?? 0} />
              <Metric label="Cancellati" value={data.counts.canceled ?? 0} />
              <Metric label="Rimborsati" value={data.counts.refunded ?? 0} />
              <Metric label="Revocati" value={data.counts.revoked ?? 0} />
              <Metric label="Sandbox" value={data.counts.sandbox ?? 0} />
              <Metric label="Produzione" value={data.counts.production ?? 0} />
            </View>
          </AppCard>

          {data.packages.length === 0 ? (
            <AppCard>
              <AppEmptyState title="Nessun pacchetto Client Pro" subtitle="Nessun subscription_package target_role=client configurato." />
            </AppCard>
          ) : (
            data.packages.map((item) => (
              <AppCard key={item.id} style={styles.card}>
                <View style={styles.header}>
                  <View style={styles.grow}>
                    <Text style={[styles.title, { color: colors.ink }]}>{item.name}</Text>
                    <Text style={[styles.smallText, { color: colors.inkSoft }]}>{priceLabel(item)}</Text>
                  </View>
                  <AppBadge label={item.isActive ? 'ATTIVO' : 'NON ATTIVO'} tone={item.isActive ? 'moss' : 'neutral'} />
                </View>
                <View style={styles.grid}>
                  <Field label="Entitlement" value={item.entitlementIdentifier ?? 'Non configurato'} />
                  <Field label="Offering" value={item.offeringIdentifier ?? 'Non configurato'} />
                  <Field label="Android product" value={item.androidProductId ?? 'Non configurato'} />
                  <Field label="iOS product" value={item.iosProductId ?? 'Non configurato'} />
                  <Field label="Stato configurazione" value={configurationStatus(item)} />
                </View>
              </AppCard>
            ))
          )}
        </>
      )}
    </SuperadminShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function priceLabel(item: ClientProSummary['packages'][number]) {
  if (item.priceSource === 'store_available_in_app') return 'Prezzo disponibile nell app tramite Google Play/App Store';
  return 'Prezzo non disponibile dal backend';
}

function configurationStatus(item: ClientProSummary['packages'][number]) {
  const hasProduct = Boolean(item.androidProductId || item.iosProductId);
  const hasRevenueCat = Boolean(item.entitlementIdentifier && item.offeringIdentifier);
  if (hasProduct && hasRevenueCat) return 'Configurazione RevenueCat/store presente';
  if (hasProduct) return 'Product ID presente, offering/entitlement incompleti';
  return 'Prodotto store non configurato';
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
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
    flexBasis: 150,
    flexGrow: 1,
    gap: 2,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  metric: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: 94,
    flexGrow: 1,
    padding: AppSpacing[2],
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
});
