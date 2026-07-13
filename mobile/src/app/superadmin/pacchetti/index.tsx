import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { deletePackage, listAllPackages, setPackageActive } from '@/lib/subscription-packages-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage, SubscriptionPackageTargetRole } from '@/types/subscription-packages';

// Sezione "Pacchetti e abbonamenti": due cataloghi separati e distinti dai
// "Piani" gia' esistenti (/superadmin/plans, piano SaaS interno del coach).
// Qui il superadmin gestisce i pacchetti che coach e clienti possono
// acquistare (subscription_packages, docs/SUPABASE_SCHEMA.sql).
export default function SuperadminPackages() {
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<SubscriptionPackageTargetRole>('coach');
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const result = await listAllPackages(tab);
      if (!active) return;
      if (result.ok) {
        setPackages(result.data);
      } else {
        setError(result.message);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [tab, reloadToken]);

  return (
    <SuperadminShell
      title="Pacchetti e abbonamenti"
      description="Cataloghi separati per coach e clienti, letti sempre da Supabase.">
      <View style={[styles.tabBar, { borderColor: colors.border }]}>
        <TabButton label="Pacchetti coach" active={tab === 'coach'} onPress={() => setTab('coach')} />
        <TabButton label="Pacchetti clienti" active={tab === 'client'} onPress={() => setTab('client')} />
      </View>

      <AppButton
        label={tab === 'coach' ? 'Nuovo pacchetto coach' : 'Nuovo pacchetto cliente'}
        onPress={() => router.push({ pathname: '/superadmin/pacchetti/new', params: { role: tab } })}
        fullWidth
      />

      {loading ? (
        <AppCard>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento pacchetti...</Text>
        </AppCard>
      ) : error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={reload} />
        </AppCard>
      ) : packages.length === 0 ? (
        <AppCard>
          <AppEmptyState
            title="Nessun pacchetto"
            subtitle={tab === 'coach' ? 'Crea il primo pacchetto acquistabile dai coach.' : 'Crea il primo pacchetto acquistabile dai clienti.'}
          />
        </AppCard>
      ) : (
        packages.map((item) => <PackageCard key={item.id} item={item} onChanged={reload} />)
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

function PackageCard({ item, onChanged }: { item: SubscriptionPackage; onChanged: () => void }) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState('');

  async function handleToggleActive() {
    setBusy(true);
    setActionError('');
    const result = await setPackageActive(item.id, !item.isActive);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    setActionError('');
    const result = await deletePackage(item.id);
    setBusy(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    onChanged();
  }

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
          <Text style={[styles.price, { color: colors.inkSoft }]}>
            {formatPrice(item.price, item.currency)} / {formatDuration(item.durationValue, item.durationUnit)}
          </Text>
        </View>
        <AppBadge label={item.isActive ? 'Attivo' : 'Non attivo'} tone={item.isActive ? 'moss' : 'neutral'} />
      </View>

      {item.description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{item.description}</Text> : null}

      {item.targetRole === 'coach' ? (
        <View style={styles.row}>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Limite clienti</Text>
          <Text style={[styles.rowValue, { color: colors.ink }]}>{item.maxClients === null ? 'Illimitato' : String(item.maxClients)}</Text>
        </View>
      ) : null}

      {item.features.length > 0 ? (
        <View style={styles.features}>
          {item.features.map((feature) => (
            <AppBadge key={feature} label={feature} tone="neutral" />
          ))}
        </View>
      ) : null}

      {actionError ? <Text style={[styles.errorText, { color: colors.rust }]}>{actionError}</Text> : null}

      <View style={styles.actions}>
        <AppButton
          label="Modifica"
          onPress={() => router.push({ pathname: '/superadmin/pacchetti/[id]', params: { id: item.id } } as unknown as Href)}
          variant="outline"
          size="sm"
        />
        <AppButton
          label={item.isActive ? 'Disattiva' : 'Attiva'}
          onPress={handleToggleActive}
          variant="outline"
          size="sm"
          loading={busy}
        />
        <AppButton
          label={confirmingDelete ? 'Conferma eliminazione' : 'Elimina'}
          onPress={handleDelete}
          variant={confirmingDelete ? 'primary' : 'ghost'}
          size="sm"
          loading={busy}
        />
      </View>
    </AppCard>
  );
}

function formatPrice(price: number, currency: string) {
  return `${currency === 'EUR' ? '€' : currency + ' '}${price.toFixed(2)}`;
}

function formatDuration(value: number, unit: 'days' | 'months') {
  const label = unit === 'days' ? (value === 1 ? 'giorno' : 'giorni') : value === 1 ? 'mese' : 'mesi';
  return `${value} ${label}`;
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: 999,
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
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  price: {
    fontSize: AppFontSize.sm,
    marginTop: 2,
  },
  description: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  rowValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    marginTop: AppSpacing[1],
  },
});
