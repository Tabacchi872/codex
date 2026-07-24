import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, AppScreen, BackHeader } from '@/components/ui';
import { useCoachClientCapacity } from '@/hooks/use-coach-client-capacity';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { useSubscriptionPackages } from '@/hooks/use-subscription-packages';
import { loadStoreProductsForPackages, openPackageSubscriptionManagement, restorePackagePurchases, startPackageCheckout } from '@/lib/package-checkout-service';
import { supabaseConfig } from '@/lib/supabase';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { RevenueCatProductState } from '@/lib/revenuecat-service';
import type { SubscriptionPackage, UserSubscriptionStatus } from '@/types/subscription-packages';

async function confirmSecondSubscription() {
  const message =
    "Hai gia' un pacchetto assegnato dall'amministratore. Acquistare un pacchetto in app avviera' un secondo abbonamento separato. Vuoi continuare?";
  if (Platform.OS === 'web') return globalThis.confirm(message);
  return new Promise<boolean>((resolve) => {
    Alert.alert('Conferma acquisto', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continua', onPress: () => resolve(true) },
    ]);
  });
}

// Livello di capacita' di un pacchetto: usato per calcolare gli upgrade
// disponibili. maxClients null (illimitato) e' sempre il livello piu' alto.
// NON si usa sort_order: e' solo l'ordine di visualizzazione scelto dal
// superadmin, non garantisce che rifletta la gerarchia Starter<Pro<Studio.
function isUpgradeOver(candidate: SubscriptionPackage, currentMaxClients: number | null): boolean {
  if (currentMaxClients === null) return false; // gia' al livello massimo
  return candidate.maxClients === null || candidate.maxClients > currentMaxClients;
}

// Sezione "Abbonamento" del coach: pacchetti coach attivi letti da Supabase,
// prezzo finale letto dallo store tramite RevenueCat, stato corrente letto da
// user_subscriptions. Il client mobile non attiva mai un abbonamento: dopo il
// purchase aspetta solo che il webhook Supabase sincronizzi la riga reale.
export default function AbbonamentoCoachScreen() {
  const { colors } = useAppTheme();
  const { packages, loading: loadingPackages, error: packagesError, reload: reloadPackages } = useSubscriptionPackages('coach');
  const { current, history, loading: loadingSubscription, error: subscriptionError, reload: reloadSubscription } = useMySubscription();
  const { capacity, loading: loadingCapacity, error: capacityError, reload: reloadCapacity } = useCoachClientCapacity();
  const [storeProducts, setStoreProducts] = useState<Record<string, RevenueCatProductState>>({});
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [managementMessage, setManagementMessage] = useState('');
  const [managingSubscription, setManagingSubscription] = useState(false);

  const reloadAll = useCallback(() => {
    reloadSubscription();
    reloadCapacity();
    reloadPackages();
  }, [reloadCapacity, reloadPackages, reloadSubscription]);

  useEffect(() => {
    if (!supabaseConfig.isConfigured || packages.length === 0) {
      setStoreProducts({});
      setStoreLoading(false);
      setStoreError('');
      return;
    }
    let active = true;
    setStoreLoading(true);
    setStoreError('');
    (async () => {
      try {
        const result = await loadStoreProductsForPackages(packages);
        if (!active) return;
        setStoreProducts(result);
      } catch (err) {
        if (!active) return;
        setStoreError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setStoreLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [packages]);

  async function handleRestorePurchases() {
    setRestoring(true);
    setRestoreMessage('');
    const result = await restorePackagePurchases();
    setRestoring(false);
    setRestoreMessage(result.message);
    if (result.ok) reloadAll();
  }

  async function handleManageSubscription() {
    setManagingSubscription(true);
    setManagementMessage('');
    const result = await openPackageSubscriptionManagement();
    setManagingSubscription(false);
    setManagementMessage(result.message);
    if (result.ok) reloadAll();
  }

  const currentMaxClients = current?.package?.maxClients ?? null;
  const upgradeCandidates =
    current && current.package ? packages.filter((p) => p.isActive && p.id !== current.package!.id && isUpgradeOver(p, currentMaxClients)) : [];
  const hasActiveManualSubscription = current?.paymentProvider === 'superadmin_manual';

  if (!supabaseConfig.isConfigured) {
    return (
      <AppScreen>
        <BackHeader title="Pacchetto e fatturazione" fallbackHref="/area-coach" />
        <AppCard>
          <AppEmptyState
            title="Supabase non configurato"
            subtitle="I pacchetti coach sono disponibili solo con un account Supabase reale collegato."
          />
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <BackHeader title="Pacchetto e fatturazione" fallbackHref="/area-coach" />

      <AppCard style={styles.card}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Il tuo pacchetto</Text>
        {loadingSubscription ? (
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento...</Text>
        ) : subscriptionError ? (
          <AppErrorState message={subscriptionError} onRetry={reloadSubscription} />
        ) : current ? (
          <CurrentSubscriptionSummary
            status={current.status}
            packageName={current.package?.name ?? 'Pacchetto'}
            expiresAt={current.expiresAt}
            maxClients={current.package?.maxClients ?? null}
            usedClients={capacity?.usedClients ?? null}
            paymentProvider={current.paymentProvider}
          />
        ) : (
          <AppEmptyState title="Nessun pacchetto attivo" subtitle="Scegli un pacchetto qui sotto per iniziare." />
        )}
        {loadingCapacity ? <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento utilizzo clienti...</Text> : null}
        {capacityError ? <AppErrorState message={capacityError} onRetry={reloadCapacity} /> : null}
        {current?.paymentProvider === 'revenuecat' ? (
          <>
            <AppButton
              label="Gestisci abbonamento"
              onPress={handleManageSubscription}
              variant="outline"
              size="sm"
              loading={managingSubscription}
              fullWidth
            />
            {managementMessage ? <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>{managementMessage}</Text> : null}
          </>
        ) : null}
        {upgradeCandidates.length > 0 ? (
          <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>
            Upgrade disponibili: {upgradeCandidates.map((p) => p.name).join(', ')} (vedi sotto).
          </Text>
        ) : null}
      </AppCard>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>PACCHETTI DISPONIBILI</Text>
        <AppButton label="Ripristina acquisti" onPress={handleRestorePurchases} variant="outline" size="sm" loading={restoring} />
      </View>
      {restoreMessage ? <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>{restoreMessage}</Text> : null}
      {storeError ? <Text style={[styles.checkoutMessage, { color: colors.rust }]}>{storeError}</Text> : null}

      {loadingPackages ? (
        <AppCard>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento pacchetti...</Text>
        </AppCard>
      ) : packagesError ? (
        <AppCard>
          <AppErrorState message={packagesError} onRetry={reloadPackages} />
        </AppCard>
      ) : packages.length === 0 ? (
        <AppCard>
          <AppEmptyState title="Nessun pacchetto disponibile" subtitle="Il superadmin non ha ancora pubblicato pacchetti per i coach." />
        </AppCard>
      ) : (
        packages.map((item) => (
          <PackageOfferCard
            key={item.id}
            item={item}
            isCurrent={current?.package?.id === item.id && current.status === 'active'}
            isUpgrade={upgradeCandidates.some((p) => p.id === item.id)}
            requiresConfirmBeforePurchase={hasActiveManualSubscription}
            storeProduct={storeProducts[item.id]}
            storeLoading={storeLoading}
            disabled={restoring}
            onSynced={reloadAll}
          />
        ))
      )}

      {history.length > 1 ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>STORICO</Text>
          <AppCard style={styles.card}>
            {history.map((item, index) => (
              <View
                key={item.id}
                style={[styles.historyRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={styles.historyRowText}>
                  <Text style={{ color: colors.ink, fontSize: AppFontSize.sm, fontWeight: '700' }}>{item.package?.name ?? 'Pacchetto'}</Text>
                  <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.xs }}>
                    {item.startsAt ? formatDate(item.startsAt) : formatDate(item.createdAt)} · {getProviderLabel(item.paymentProvider)}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: AppFontSize.xs }}>Importo gestito dallo Store</Text>
                </View>
                <AppBadge label={getStatusLabel(item.status)} tone={getStatusTone(item.status)} />
              </View>
            ))}
          </AppCard>
        </>
      ) : null}
    </AppScreen>
  );
}

function CurrentSubscriptionSummary({
  status,
  packageName,
  expiresAt,
  maxClients,
  usedClients,
  paymentProvider,
}: {
  status: UserSubscriptionStatus;
  packageName: string;
  expiresAt: string | null;
  maxClients: number | null;
  usedClients: number | null;
  paymentProvider: string | null;
}) {
  const { colors } = useAppTheme();
  const isManual = paymentProvider === 'superadmin_manual';
  return (
    <View style={styles.currentRow}>
      <View style={styles.currentText}>
        <Text style={[styles.currentPackageName, { color: colors.ink }]}>{packageName}</Text>
        {isManual ? <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Assegnato dall&apos;amministratore</Text> : null}
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
          {expiresAt ? `Scadenza: ${formatDate(expiresAt)}` : 'Nessuna scadenza registrata'}
        </Text>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
          Limite clienti: {maxClients === null ? 'Illimitato' : maxClients}
          {usedClients !== null ? ` - Utilizzati: ${usedClients}` : ''}
        </Text>
      </View>
      <AppBadge label={getStatusLabel(status)} tone={getStatusTone(status)} />
    </View>
  );
}

function PackageOfferCard({
  item,
  isCurrent,
  isUpgrade,
  requiresConfirmBeforePurchase,
  storeProduct,
  storeLoading,
  disabled,
  onSynced,
}: {
  item: SubscriptionPackage;
  isCurrent: boolean;
  isUpgrade: boolean;
  requiresConfirmBeforePurchase: boolean;
  storeProduct?: RevenueCatProductState;
  storeLoading: boolean;
  disabled: boolean;
  onSynced: () => void;
}) {
  const { colors } = useAppTheme();
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const canPurchase = !disabled && !storeLoading && storeProduct?.status === 'available';

  async function handlePurchase() {
    if (!canPurchase) return;
    if (requiresConfirmBeforePurchase) {
      const confirmed = await confirmSecondSubscription();
      if (!confirmed) return;
    }
    setStarting(true);
    setCheckoutMessage('');
    const result = await startPackageCheckout(item);
    setStarting(false);
    setCheckoutMessage(result.message);
    if (result.ok) onSynced();
  }

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
          <Text style={[styles.price, { color: storeProduct?.status === 'available' || storeLoading ? colors.inkSoft : colors.rust }]}>
            {formatStorePrice(storeProduct, storeLoading)}
          </Text>
        </View>
        {isCurrent ? (
          <View style={[styles.currentPill, { backgroundColor: colors.mossSoft }]}>
            <CheckCircle2 size={14} color={colors.moss} strokeWidth={2.5} />
            <Text style={[styles.currentPillLabel, { color: colors.moss }]}>Attuale</Text>
          </View>
        ) : isUpgrade ? (
          <View style={[styles.currentPill, { backgroundColor: colors.coralSoft }]}>
            <Text style={[styles.currentPillLabel, { color: colors.coral }]}>Upgrade</Text>
          </View>
        ) : null}
      </View>

      {item.description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{item.description}</Text> : null}

      <View style={styles.row}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Limite clienti</Text>
        <Text style={[styles.rowValue, { color: colors.ink }]}>{item.maxClients === null ? 'Illimitato' : String(item.maxClients)}</Text>
      </View>

      {item.features.length > 0 ? (
        <View style={styles.features}>
          {item.features.map((feature) => (
            <AppBadge key={feature} label={feature} tone="neutral" />
          ))}
        </View>
      ) : null}

      {checkoutMessage ? <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>{checkoutMessage}</Text> : null}

      <AppButton
        label={isCurrent ? 'Pacchetto attuale' : 'Acquista in app'}
        onPress={handlePurchase}
        loading={starting}
        disabled={isCurrent || !canPurchase}
        fullWidth
      />
    </AppCard>
  );
}

function formatStorePrice(storeProduct: RevenueCatProductState | undefined, loading: boolean) {
  if (loading) return 'Prezzo store in caricamento...';
  if (!storeProduct) return 'Prodotto non configurato nello store';
  if (storeProduct.status === 'available') {
    return storeProduct.periodLabel ? `${storeProduct.priceString} / ${storeProduct.periodLabel}` : storeProduct.priceString;
  }
  return storeProduct.message;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return value;
  }
}

function getStatusLabel(status: UserSubscriptionStatus) {
  const labels: Record<UserSubscriptionStatus, string> = {
    pending: 'Pagamento in attesa',
    active: 'Attivo',
    expired: 'Scaduto',
    canceled: 'Annullato',
  };
  return labels[status];
}

function getProviderLabel(provider: string | null) {
  if (provider === 'superadmin_manual') return 'Amministratore';
  if (provider === 'revenuecat') return 'RevenueCat';
  return 'Provider non specificato';
}

function getStatusTone(status: UserSubscriptionStatus) {
  if (status === 'active') return 'moss' as const;
  if (status === 'pending') return 'amber' as const;
  if (status === 'expired' || status === 'canceled') return 'rust' as const;
  return 'neutral' as const;
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  sectionTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: AppSpacing[1],
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
    marginTop: AppSpacing[1],
  },
  currentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  currentText: {
    flex: 1,
    minWidth: 0,
  },
  currentPackageName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
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
  currentPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentPillLabel: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
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
  checkoutMessage: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.4,
  },
  historyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
    paddingVertical: AppSpacing[2],
  },
  historyRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
