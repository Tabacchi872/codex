import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, AppScreen, BackHeader } from '@/components/ui';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { useSubscriptionPackages } from '@/hooks/use-subscription-packages';
import { sortClientPackagesByDuration } from '@/lib/client-plan-access-service';
import {
  loadStoreProductsForPackages,
  openPackageSubscriptionManagement,
  restorePackagePurchases,
  startPackageCheckout,
} from '@/lib/package-checkout-service';
import type { RevenueCatProductState } from '@/lib/revenuecat-service';
import { supabaseConfig } from '@/lib/supabase';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage, UserSubscriptionStatus } from '@/types/subscription-packages';

// Sezione "Pacchetti" del cliente: pacchetti clienti attivi creati dal
// superadmin (letti sempre da Supabase), distinti dagli abbonamenti sessioni
// che il proprio coach puo' assegnare (subscriptions, gestita in
// clienti/[id].tsx lato coach) — qui il cliente acquista direttamente un
// pacchetto del superadmin, uguale per tutti i coach. Prezzo/periodo sempre
// dallo store tramite RevenueCat (mai da subscription_packages.price/currency,
// che restano valori amministrativi non autorevoli per la UI). Questa e' la
// schermata raggiungibile da un self_guided GIA' abbonato (AuthGate rediretta
// altrove chi non ha un piano attivo verso /abbonamento-cliente), quindi qui
// vive anche "Gestisci abbonamento".
export default function PacchettiClienteScreen() {
  const { colors } = useAppTheme();
  const { packages, loading: loadingPackages, error: packagesError, reload: reloadPackages } = useSubscriptionPackages('client');
  const { current, history, loading: loadingSubscription, error: subscriptionError, reload: reloadSubscription } = useMySubscription();
  const sortedPackages = sortClientPackagesByDuration(packages);
  const [storeProducts, setStoreProducts] = useState<Record<string, RevenueCatProductState>>({});
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [managementMessage, setManagementMessage] = useState('');
  const [managingSubscription, setManagingSubscription] = useState(false);

  const reloadAll = useCallback(() => {
    reloadSubscription();
    reloadPackages();
  }, [reloadPackages, reloadSubscription]);

  useEffect(() => {
    if (!supabaseConfig.isConfigured || sortedPackages.length === 0) {
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
        const result = await loadStoreProductsForPackages(sortedPackages);
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
    // sortedPackages e' una nuova referenza ad ogni render: dipendiamo dal
    // suo contenuto tramite packages (gia' incluso qui indirettamente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!supabaseConfig.isConfigured) {
    return (
      <AppScreen>
        <BackHeader title="Pacchetti" fallbackHref="/altro" />
        <AppCard>
          <AppEmptyState
            title="Supabase non configurato"
            subtitle="I pacchetti sono disponibili solo con un account Supabase reale collegato."
          />
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <BackHeader title="Pacchetti" fallbackHref="/altro" />

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
            startsAt={current.startsAt}
            expiresAt={current.expiresAt}
          />
        ) : (
          <AppEmptyState title="Nessun pacchetto attivo" subtitle="Scegli un pacchetto qui sotto per abbonarti." />
        )}
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
      ) : sortedPackages.length === 0 ? (
        <AppCard>
          <AppEmptyState title="Nessun pacchetto disponibile" subtitle="Il tuo coach o l'assistenza ti aggiorneranno appena disponibili." />
        </AppCard>
      ) : (
        sortedPackages.map((item, index) => (
          <PackageOfferCard
            key={item.id}
            item={item}
            isCurrent={current?.package?.id === item.id && current.status === 'active'}
            isMostConvenient={sortedPackages.length > 1 && index === sortedPackages.length - 1}
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
                <Text style={{ color: colors.ink, fontSize: AppFontSize.sm, fontWeight: '700' }}>{item.package?.name ?? 'Pacchetto'}</Text>
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
  startsAt,
  expiresAt,
}: {
  status: UserSubscriptionStatus;
  packageName: string;
  startsAt: string | null;
  expiresAt: string | null;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.currentBlock}>
      <View style={styles.currentRow}>
        <View style={styles.currentText}>
          <Text style={[styles.currentPackageName, { color: colors.ink }]}>{packageName}</Text>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {startsAt ? `Inizio: ${formatDate(startsAt)}` : 'Data di inizio non ancora registrata'}
          </Text>
        </View>
        <AppBadge label={getStatusLabel(status)} tone={getStatusTone(status)} />
      </View>
      <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
        {status === 'active'
          ? expiresAt
            ? `Attivo fino al: ${formatDate(expiresAt)}`
            : 'Nessuna scadenza registrata'
          : expiresAt
            ? `Scadenza: ${formatDate(expiresAt)}`
            : 'Nessuna scadenza registrata'}
      </Text>
    </View>
  );
}

function PackageOfferCard({
  item,
  isCurrent,
  isMostConvenient,
  storeProduct,
  storeLoading,
  disabled,
  onSynced,
}: {
  item: SubscriptionPackage;
  isCurrent: boolean;
  isMostConvenient: boolean;
  storeProduct?: RevenueCatProductState;
  storeLoading: boolean;
  disabled: boolean;
  onSynced: () => void;
}) {
  const { colors } = useAppTheme();
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const canPurchase = !disabled && !storeLoading && storeProduct?.status === 'available';

  async function handleSubscribe() {
    if (!canPurchase || isCurrent) return;
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
        ) : isMostConvenient ? (
          <AppBadge label="Piu conveniente" tone="coral" />
        ) : null}
      </View>

      {item.description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{item.description}</Text> : null}

      {item.features.length > 0 ? (
        <View style={styles.features}>
          {item.features.map((feature) => (
            <AppBadge key={feature} label={feature} tone="neutral" />
          ))}
        </View>
      ) : null}

      {checkoutMessage ? <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>{checkoutMessage}</Text> : null}

      <AppButton
        label={isCurrent ? 'Pacchetto attuale' : 'Abbonati'}
        onPress={handleSubscribe}
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
    pending: 'In attesa',
    active: 'Attivo',
    expired: 'Scaduto',
    canceled: 'Annullato',
  };
  return labels[status];
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
  currentBlock: {
    gap: 4,
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
    paddingVertical: AppSpacing[2],
  },
});
