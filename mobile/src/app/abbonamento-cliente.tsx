import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { openLegalLink } from '@/components/developer-info-section';
import { AppBadge, AppButton, AppCard, AppErrorState, AppScreen, FitCoachLogo } from '@/components/ui';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/constants/app-info';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { useSubscriptionPackages } from '@/hooks/use-subscription-packages';
import { getCurrentSession, signOut } from '@/lib/auth-service';
import {
  CLIENT_REVENUECAT_ENTITLEMENT,
  CLIENT_REVENUECAT_OFFERING,
  pickCurrentSelfGuidedSubscription,
  sortClientPackagesByDuration,
} from '@/lib/client-plan-access-service';
import { loadStoreProductsForPackages, restorePackagePurchases, startPackageCheckout } from '@/lib/package-checkout-service';
import type { RevenueCatProductState } from '@/lib/revenuecat-service';
import { waitForPackageSubscriptionSync } from '@/lib/user-subscriptions-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage } from '@/types/subscription-packages';

// Benefici derivati da cio' che un cliente self_guided vede davvero (verificato
// in cliente-home.tsx/altro.tsx): mai una promessa di funzioni coach-only
// (chat/bacheca/prenotazioni/check-in restano escluse per questa modalita').
const SELF_GUIDED_BENEFITS = [
  'Allenamenti e strumenti della modalita autonoma',
  'Storico dei carichi e dei progressi',
  'Metriche e grafici',
  'Contenuti nutrizionali disponibili',
  'Video e dettagli degli esercizi',
  'Accesso da Android e iOS con lo stesso account',
];

type MessageTone = 'success' | 'info' | 'neutral' | 'error';

export default function ClientSubscriptionScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const logout = useAuthStore((state) => state.logout);
  const markOnboardingCompleted = useClientOnboardingStore((state) => state.markCompleted);
  const { packages, loading, error, reload } = useSubscriptionPackages('client');
  const { history, reload: reloadSubscriptions } = useMySubscription();
  const currentClientPlan = useMemo(() => pickCurrentSelfGuidedSubscription(history), [history]);
  const lastClientPlanEntry = useMemo(
    () =>
      history.find(
        (item) => item.paymentProvider === 'revenuecat' && item.package?.revenuecatEntitlementId === CLIENT_REVENUECAT_ENTITLEMENT,
      ) ?? null,
    [history],
  );
  const sortedPackages = useMemo(() => sortClientPackagesByDuration(packages), [packages]);

  const [productStates, setProductStates] = useState<Record<string, RevenueCatProductState>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ text: string; tone: MessageTone } | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (sortedPackages.length === 0) {
      setProductStates({});
      return;
    }
    setLoadingProducts(true);
    const configuredPackages = sortedPackages.filter(
      (item) =>
        item.revenuecatEntitlementId === CLIENT_REVENUECAT_ENTITLEMENT && item.revenuecatOfferingId === CLIENT_REVENUECAT_OFFERING,
    );
    const states = await loadStoreProductsForPackages(configuredPackages);
    setProductStates(states);
    setLoadingProducts(false);
  }, [sortedPackages]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Se il piano risulta gia' attivo (es. attivato da un'altra sessione/tab
  // mentre questa schermata era aperta), esce subito verso Home: AuthGate
  // fa la stessa cosa ad ogni navigazione, questo evita solo un frame in piu'
  // di attesa qui.
  useEffect(() => {
    if (!currentClientPlan) return;
    getCurrentSession().then((sessionResult) => {
      const clientId = sessionResult.ok ? sessionResult.data?.user.id : null;
      if (clientId) markOnboardingCompleted(clientId);
      router.replace('/cliente-home');
    });
  }, [currentClientPlan, markOnboardingCompleted, router]);

  const monthlyPackage = sortedPackages[0] ?? null;
  const monthlyState = monthlyPackage ? productStates[monthlyPackage.id] : undefined;

  const derivedPricing = useMemo(() => {
    const result: Record<string, DerivedPricing> = {};
    for (const item of sortedPackages) {
      result[item.id] = computeDerivedPricing(item, productStates[item.id], monthlyPackage, monthlyState);
    }
    return result;
  }, [sortedPackages, productStates, monthlyPackage, monthlyState]);

  const anyPurchaseInProgress = purchasingId !== null;

  const firstProductState = sortedPackages.length > 0 ? productStates[sortedPackages[0].id] : undefined;
  const allUnsupported =
    sortedPackages.length > 0 && sortedPackages.every((item) => productStates[item.id]?.status === 'unsupported');
  const unsupportedMessage =
    allUnsupported && firstProductState && firstProductState.status !== 'available' ? firstProductState.message : null;

  async function handleRestore() {
    if (restoreLoading || anyPurchaseInProgress) return;
    setRestoreLoading(true);
    setRestoreMessage(null);
    const result = await restorePackagePurchases();
    setRestoreLoading(false);
    setRestoreMessage({
      text: result.message,
      tone: !result.ok ? 'error' : result.code === 'sync_timeout' ? 'info' : 'success',
    });
    if (result.ok) reloadSubscriptions();
  }

  async function handleLogout() {
    await signOut();
    logout();
    router.replace('/');
  }

  return (
    <AppScreen bottomTabInset={false} contentStyle={styles.content}>
      <FitCoachLogo />
      <View style={styles.hero}>
        <Text style={[styles.title, { color: colors.ink }]}>Allenati in autonomia con FitCoach</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>
          Accedi agli strumenti FitCoach dedicati al tuo percorso autonomo.
        </Text>
      </View>

      <AppCard style={styles.benefitsCard}>
        {SELF_GUIDED_BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.featureRow}>
            <CheckCircle2 size={17} color={colors.moss} />
            <Text style={[styles.featureText, { color: colors.ink }]}>{benefit}</Text>
          </View>
        ))}
      </AppCard>

      {lastClientPlanEntry && (lastClientPlanEntry.status === 'expired' || lastClientPlanEntry.status === 'canceled') ? (
        <AppCard style={styles.noticeCard}>
          <Text style={[styles.notice, { color: colors.rust }]}>
            Il tuo abbonamento Client Pro risulta {lastClientPlanEntry.status === 'expired' ? 'scaduto' : 'annullato'}: scegli un
            piano qui sotto per continuare.
          </Text>
        </AppCard>
      ) : null}

      {unsupportedMessage ? (
        <AppCard style={styles.noticeCard}>
          <Text style={[styles.notice, { color: colors.inkSoft }]}>{unsupportedMessage}</Text>
        </AppCard>
      ) : null}

      <View style={styles.plansSection}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Scegli il tuo piano</Text>
        {loading ? (
          <AppCard>
            <Text style={[styles.message, { color: colors.inkSoft }]}>Caricamento piani...</Text>
          </AppCard>
        ) : error ? (
          <AppCard>
            <AppErrorState message={error} onRetry={reload} />
          </AppCard>
        ) : sortedPackages.length === 0 ? (
          <AppCard>
            <Text style={[styles.planName, { color: colors.ink }]}>Piani non ancora disponibili</Text>
            <Text style={[styles.message, { color: colors.inkSoft }]}>I piani Client Pro non sono ancora configurati.</Text>
          </AppCard>
        ) : (
          sortedPackages.map((item, index) => (
            <ClientPlanCard
              key={item.id}
              item={item}
              productState={productStates[item.id]}
              loadingProduct={loadingProducts}
              isMostConvenient={sortedPackages.length > 1 && index === sortedPackages.length - 1}
              derived={derivedPricing[item.id]}
              disabled={anyPurchaseInProgress || restoreLoading}
              purchasing={purchasingId === item.id}
              onPurchaseStart={() => setPurchasingId(item.id)}
              onPurchaseEnd={() => setPurchasingId(null)}
              onSynced={reloadSubscriptions}
            />
          ))
        )}
      </View>

      <Text style={[styles.renewalNote, { color: colors.inkFaint }]}>
        L&apos;abbonamento si rinnova automaticamente al termine del periodo scelto, salvo disdetta dallo store prima della
        scadenza.
      </Text>

      <AppCard style={styles.actionsCard}>
        <AppButton
          label="Ripristina acquisti"
          onPress={handleRestore}
          loading={restoreLoading}
          disabled={anyPurchaseInProgress}
          variant="outline"
          fullWidth
        />
        {restoreMessage ? (
          <Text style={[styles.message, { color: restoreMessage.tone === 'error' ? colors.rust : colors.inkSoft }]}>
            {restoreMessage.text}
          </Text>
        ) : null}
        <AppButton label="Impostazioni account" onPress={() => router.push('/cliente-profilo')} variant="ghost" fullWidth />
        <AppButton label="Esci dall'account" onPress={handleLogout} variant="ghost" fullWidth />
      </AppCard>

      <View style={styles.legalLinks}>
        <Text onPress={() => void openLegalLink(PRIVACY_POLICY_URL)} style={[styles.legalLink, { color: colors.moss }]}>
          Privacy policy
        </Text>
        <Text onPress={() => void openLegalLink(TERMS_OF_SERVICE_URL)} style={[styles.legalLink, { color: colors.moss }]}>
          Termini di servizio
        </Text>
      </View>
    </AppScreen>
  );
}

type DerivedPricing = { equivalentMonthlyText: string | null; savingsText: string | null };

function ClientPlanCard({
  item,
  productState,
  loadingProduct,
  isMostConvenient,
  derived,
  disabled,
  purchasing,
  onPurchaseStart,
  onPurchaseEnd,
  onSynced,
}: {
  item: SubscriptionPackage;
  productState?: RevenueCatProductState;
  loadingProduct: boolean;
  isMostConvenient: boolean;
  derived: DerivedPricing;
  disabled: boolean;
  purchasing: boolean;
  onPurchaseStart: () => void;
  onPurchaseEnd: () => void;
  onSynced: () => void;
}) {
  const { colors } = useAppTheme();
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [retrying, setRetrying] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

  const canPurchase = !disabled && !loadingProduct && productState?.status === 'available';

  async function handlePurchase() {
    if (!canPurchase) return;
    onPurchaseStart();
    setCheckoutMessage('');
    setShowRetry(false);
    const result = await startPackageCheckout(item);
    onPurchaseEnd();
    setCheckoutMessage(result.message);
    if (!result.ok) {
      // La cancellazione volontaria dell'utente non e' un errore: nessun
      // rosso, nessun tono allarmante.
      setMessageTone(result.code === 'cancelled' ? 'neutral' : 'error');
      return;
    }
    if (result.code === 'sync_timeout') {
      setMessageTone('info');
      setShowRetry(true);
      return;
    }
    setMessageTone('success');
    onSynced();
  }

  async function handleRetrySync() {
    setRetrying(true);
    const session = await getCurrentSession();
    const userId = session.ok ? session.data?.user.id : null;
    if (!userId) {
      setRetrying(false);
      setCheckoutMessage("Accedi con un account Supabase reale per verificare l'attivazione.");
      setMessageTone('error');
      return;
    }
    const synced = await waitForPackageSubscriptionSync(userId, item.id);
    setRetrying(false);
    if (!synced.ok) {
      setCheckoutMessage(synced.message);
      setMessageTone('error');
      return;
    }
    if (!synced.data) {
      setCheckoutMessage('Ancora in sincronizzazione: riprova tra qualche istante.');
      setMessageTone('info');
      return;
    }
    setCheckoutMessage('Abbonamento attivato.');
    setMessageTone('success');
    setShowRetry(false);
    onSynced();
  }

  const messageColor = messageTone === 'error' ? colors.rust : messageTone === 'success' ? colors.moss : colors.inkSoft;

  return (
    <AppCard style={styles.planCard}>
      <View style={styles.planHeader}>
        <View style={styles.planCopy}>
          <Text style={[styles.planName, { color: colors.ink }]}>{item.name}</Text>
          <Text style={[styles.planPrice, { color: colors.moss }]}>
            {loadingProduct ? 'Prezzo in caricamento...' : formatCardPrice(productState)}
          </Text>
          {derived.equivalentMonthlyText ? (
            <Text style={[styles.equivalent, { color: colors.inkSoft }]}>{derived.equivalentMonthlyText}</Text>
          ) : null}
          {derived.savingsText ? <Text style={[styles.savings, { color: colors.moss }]}>{derived.savingsText}</Text> : null}
        </View>
        {isMostConvenient ? <AppBadge label="Piu conveniente" tone="coral" /> : null}
      </View>
      {item.description ? <Text style={[styles.message, { color: colors.inkSoft }]}>{item.description}</Text> : null}
      {item.features.map((feature) => (
        <View key={feature} style={styles.featureRow}>
          <CheckCircle2 size={17} color={colors.moss} />
          <Text style={[styles.featureText, { color: colors.ink }]}>{feature}</Text>
        </View>
      ))}
      {checkoutMessage ? <Text style={[styles.message, { color: messageColor }]}>{checkoutMessage}</Text> : null}
      {showRetry ? (
        <AppButton label="Riprova" onPress={handleRetrySync} loading={retrying} variant="outline" fullWidth />
      ) : (
        <AppButton
          label={!canPurchase ? 'Non disponibile' : purchasing ? 'Acquisto in corso...' : 'Scegli questo piano'}
          onPress={handlePurchase}
          loading={purchasing}
          disabled={!canPurchase || purchasing}
          fullWidth
        />
      )}
    </AppCard>
  );
}

function formatCardPrice(state: RevenueCatProductState | undefined) {
  if (!state) return 'Prezzo non disponibile';
  if (state.status === 'available') {
    return state.periodLabel ? `${state.priceString} / ${state.periodLabel}` : state.priceString;
  }
  return state.message;
}

function formatDerivedAmount(amount: number, currencyCode: string | null): string {
  if (!currencyCode) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

// Calcolo del prezzo equivalente mensile e del risparmio: SOLO se il prezzo
// numerico (pricePerMonth, gia' normalizzato dall'SDK RevenueCat) e' presente
// per entrambi i pacchetti confrontati e la valuta coincide. Mai una
// percentuale hardcodata, mai un calcolo su dati incompleti/eterogenei.
function computeDerivedPricing(
  item: SubscriptionPackage,
  state: RevenueCatProductState | undefined,
  monthlyPackage: SubscriptionPackage | null,
  monthlyState: RevenueCatProductState | undefined,
): DerivedPricing {
  if (!state || state.status !== 'available' || state.pricePerMonth === null) {
    return { equivalentMonthlyText: null, savingsText: null };
  }

  const isMonthlyItself = monthlyPackage?.id === item.id;
  const equivalentMonthlyText = isMonthlyItself
    ? null
    : `Equivalente a ${formatDerivedAmount(state.pricePerMonth, state.currencyCode)}/mese`;

  let savingsText: string | null = null;
  if (
    !isMonthlyItself &&
    monthlyState &&
    monthlyState.status === 'available' &&
    monthlyState.pricePerMonth !== null &&
    monthlyState.pricePerMonth > 0 &&
    monthlyState.currencyCode &&
    state.currencyCode &&
    monthlyState.currencyCode === state.currencyCode
  ) {
    const savingsPct = Math.round((1 - state.pricePerMonth / monthlyState.pricePerMonth) * 100);
    if (savingsPct > 0) {
      savingsText = `Risparmi il ${savingsPct}% rispetto al mensile`;
    }
  }

  return { equivalentMonthlyText, savingsText };
}

const styles = StyleSheet.create({
  content: {
    paddingTop: AppSpacing[6],
  },
  hero: {
    gap: AppSpacing[2],
    marginVertical: AppSpacing[3],
  },
  title: {
    fontSize: AppFontSize.xl,
    fontWeight: '800',
  },
  description: {
    fontSize: AppFontSize.base,
    lineHeight: 23,
  },
  benefitsCard: {
    gap: AppSpacing[2],
  },
  noticeCard: {
    gap: AppSpacing[1],
  },
  notice: {
    fontSize: AppFontSize.sm,
    lineHeight: 20,
    fontWeight: '600',
  },
  actionsCard: {
    gap: AppSpacing[2],
    marginTop: AppSpacing[3],
  },
  message: {
    fontSize: AppFontSize.sm,
    lineHeight: 20,
  },
  plansSection: {
    gap: AppSpacing[3],
  },
  sectionTitle: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
  },
  planCard: {
    gap: AppSpacing[3],
    borderRadius: AppRadius.lg,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  planCopy: {
    flex: 1,
    minWidth: 0,
  },
  planName: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
  },
  planPrice: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
    marginTop: 4,
  },
  equivalent: {
    fontSize: AppFontSize.xs,
    marginTop: 2,
  },
  savings: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  featureText: {
    flex: 1,
    fontSize: AppFontSize.sm,
  },
  renewalNote: {
    fontSize: AppFontSize.xs,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    gap: AppSpacing[3],
    justifyContent: 'center',
    marginTop: AppSpacing[1],
    marginBottom: AppSpacing[4],
  },
  legalLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
