import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppErrorState, AppScreen, FitCoachLogo } from '@/components/ui';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { useSubscriptionPackages } from '@/hooks/use-subscription-packages';
import { getCurrentSession, signOut } from '@/lib/auth-service';
import {
  CLIENT_REVENUECAT_ENTITLEMENT,
  CLIENT_REVENUECAT_OFFERING,
  pickCurrentSelfGuidedSubscription,
} from '@/lib/client-plan-access-service';
import { loadStoreProductsForPackages, restorePackagePurchases } from '@/lib/package-checkout-service';
import type { RevenueCatProductState } from '@/lib/revenuecat-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage } from '@/types/subscription-packages';

export default function ClientSubscriptionScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const logout = useAuthStore((state) => state.logout);
  const markOnboardingCompleted = useClientOnboardingStore((state) => state.markCompleted);
  const { packages, loading, error, reload } = useSubscriptionPackages('client');
  const { history, reload: reloadSubscriptions } = useMySubscription();
  const currentClientPlan = useMemo(() => pickCurrentSelfGuidedSubscription(history), [history]);
  const [showPlans, setShowPlans] = useState(false);
  const [productStates, setProductStates] = useState<Record<string, RevenueCatProductState>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (packages.length === 0) {
      setProductStates({});
      return;
    }
    setLoadingProducts(true);
    const configuredPackages = packages.filter(
      (item) =>
        item.revenuecatEntitlementId === CLIENT_REVENUECAT_ENTITLEMENT &&
        item.revenuecatOfferingId === CLIENT_REVENUECAT_OFFERING,
    );
    const states = await loadStoreProductsForPackages(configuredPackages);
    setProductStates(states);
    setLoadingProducts(false);
  }, [packages]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!currentClientPlan) return;
    getCurrentSession().then((sessionResult) => {
      const clientId = sessionResult.ok ? sessionResult.data?.user.id : null;
      if (clientId) markOnboardingCompleted(clientId);
      router.replace('/cliente-home');
    });
  }, [currentClientPlan, markOnboardingCompleted, router]);

  async function handleRestore() {
    if (restoreLoading) return;
    setRestoreLoading(true);
    setMessage(null);
    const result = await restorePackagePurchases();
    setRestoreLoading(false);
    setMessage(result.message);
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
        <Text style={[styles.title, { color: colors.ink }]}>Allenati in autonomia</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>
          Scegli il piano piu adatto a te e accedi ai programmi disponibili nella piattaforma.
        </Text>
      </View>

      <AppCard style={styles.actionsCard}>
        <AppButton label="Scopri i piani" onPress={() => setShowPlans(true)} fullWidth />
        <AppButton label="Ripristina acquisti" onPress={handleRestore} loading={restoreLoading} variant="outline" fullWidth />
        <AppButton label="Esci dall'account" onPress={handleLogout} variant="ghost" fullWidth />
        {message ? <Text style={[styles.message, { color: colors.inkSoft }]}>{message}</Text> : null}
      </AppCard>

      {showPlans ? (
        <View style={styles.plansSection}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Piani disponibili</Text>
          {loading ? (
            <AppCard><Text style={[styles.message, { color: colors.inkSoft }]}>Caricamento piani...</Text></AppCard>
          ) : error ? (
            <AppCard><AppErrorState message={error} onRetry={reload} /></AppCard>
          ) : packages.length === 0 ? (
            <AppCard>
              <Text style={[styles.planName, { color: colors.ink }]}>Acquisto non ancora disponibile</Text>
              <Text style={[styles.message, { color: colors.inkSoft }]}>I piani cliente non sono ancora configurati nello store.</Text>
            </AppCard>
          ) : (
            packages.map((item) => (
              <ClientPlanCard key={item.id} item={item} productState={productStates[item.id]} loadingProduct={loadingProducts} />
            ))
          )}
        </View>
      ) : null}
    </AppScreen>
  );
}

function ClientPlanCard({
  item,
  productState,
  loadingProduct,
}: {
  item: SubscriptionPackage;
  productState?: RevenueCatProductState;
  loadingProduct: boolean;
}) {
  const { colors } = useAppTheme();
  const storePrice = productState?.status === 'available' ? productState.priceString : null;
  const unavailableMessage =
    productState && productState.status !== 'available'
      ? productState.message
      : 'Acquisto non ancora disponibile: configura offering client_plans, entitlement client_pro e prodotti store.';

  return (
    <AppCard style={styles.planCard}>
      <View style={styles.planHeader}>
        <View style={styles.planCopy}>
          <Text style={[styles.planName, { color: colors.ink }]}>{item.name}</Text>
          <Text style={[styles.planPrice, { color: colors.moss }]}>{loadingProduct ? 'Prezzo in caricamento...' : storePrice ?? 'Prezzo disponibile nello store'}</Text>
        </View>
        <AppBadge label="Piano autonomo" tone="moss" />
      </View>
      {item.description ? <Text style={[styles.message, { color: colors.inkSoft }]}>{item.description}</Text> : null}
      {item.features.map((feature) => (
        <View key={feature} style={styles.featureRow}>
          <CheckCircle2 size={17} color={colors.moss} />
          <Text style={[styles.featureText, { color: colors.ink }]}>{feature}</Text>
        </View>
      ))}
      <Text style={[styles.unavailable, { color: colors.inkSoft }]}>{unavailableMessage}</Text>
      <AppButton label="Acquisto non ancora disponibile" onPress={() => undefined} disabled fullWidth />
    </AppCard>
  );
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
  actionsCard: {
    gap: AppSpacing[2],
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
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  featureText: {
    flex: 1,
    fontSize: AppFontSize.sm,
  },
  unavailable: {
    fontSize: AppFontSize.xs,
    lineHeight: 18,
  },
});
