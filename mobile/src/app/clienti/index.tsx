import { router, useRouter } from 'expo-router';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard, AppErrorState, type AppBadgeTone } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { useCoachClientCapacity } from '@/hooks/use-coach-client-capacity';
import { clientFullName } from '@/lib/client-helpers';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import {
  COMPUTED_SUBSCRIPTION_STATUS_LABEL,
  computeSubscriptionStatus,
  getCurrentSubscription,
  type ComputedSubscriptionStatus,
} from '@/types/subscription';

export default function ClientiListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  if (!clientsHydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.inkSoft }}>Caricamento clienti...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <Text style={[AppTextStyle.title, { color: colors.ink }]}>Clienti</Text>
                <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{clients.length} clienti in gestione</Text>
              </View>
              <AppButton label="+ Nuovo cliente" onPress={() => router.push('/clienti/new')} size="lg" />
            </View>
            {supabaseConfig.isConfigured ? <ClientCapacityCard /> : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        renderItem={({ item }) => {
          const subscription = getCurrentSubscription(subscriptions, item.id);
          const status = computeSubscriptionStatus(subscription);
          return (
            <AppCard onPress={() => router.push(`/clienti/${item.id}`)} style={styles.row}>
              <View style={styles.rowHeader}>
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                    {clientFullName(item)}
                  </Text>
                  <Text style={[styles.planText, { color: colors.inkSoft }]} numberOfLines={1}>
                    {subscription ? subscription.packageName : 'Nessun abbonamento'}
                  </Text>
                </View>
                <AppBadge label={COMPUTED_SUBSCRIPTION_STATUS_LABEL[status]} tone={subscriptionTone(status)} />
              </View>
            </AppCard>
          );
        }}
      />
    </View>
  );
}

function subscriptionTone(status: ComputedSubscriptionStatus): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'expiring') return 'amber';
  return 'rust';
}

// Contatore "Clienti utilizzati: X su Y" / "Posti disponibili: Z", letto
// SEMPRE in tempo reale da Supabase (mai da useClientStore, che e' solo il
// mirror locale dei clienti creati manualmente dal coach — vedi commento in
// use-coach-client-capacity.ts). Si aggiorna da solo quando la schermata
// torna a fuoco o l'app torna in primo piano: non serve premere nulla dopo
// aver attivato un abbonamento o dopo che un cliente si e' registrato con il
// codice coach.
function ClientCapacityCard() {
  const { colors } = useAppTheme();
  const { capacity, loading, error, reload } = useCoachClientCapacity();

  if (loading && !capacity) {
    return (
      <AppCard style={styles.capacityCard}>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento capacita' clienti...</Text>
      </AppCard>
    );
  }

  if (error) {
    return (
      <AppCard style={styles.capacityCard}>
        <AppErrorState message={error} onRetry={reload} />
      </AppCard>
    );
  }

  if (!capacity || !capacity.hasActiveSubscription) {
    return (
      <AppCard style={[styles.capacityCard, { borderColor: colors.rust }]}>
        <Text style={[styles.capacityTitle, { color: colors.rust }]}>Abbonamento necessario</Text>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
          Nessun pacchetto coach attivo: le nuove registrazioni cliente con il tuo codice restano bloccate finche' non attivi un
          pacchetto.
        </Text>
        <AppButton label="Vai ad Abbonamento" onPress={() => router.push('/abbonamento-coach')} variant="outline" size="sm" />
      </AppCard>
    );
  }

  const { usedClients, maxClients, availableSlots } = capacity;
  const limitReached = maxClients !== null && availableSlots !== null && availableSlots <= 0;

  return (
    <AppCard style={[styles.capacityCard, limitReached && { borderColor: colors.amber }]}>
      <Text style={[styles.capacityValue, { color: colors.ink }]}>
        Clienti utilizzati: {usedClients} su {maxClients === null ? 'illimitati' : maxClients}
      </Text>
      <Text style={{ color: limitReached ? colors.amber : colors.inkSoft, fontSize: AppFontSize.sm, fontWeight: limitReached ? '700' : '600' }}>
        Posti disponibili: {maxClients === null ? 'illimitati' : availableSlots}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[5],
  },
  header: {
    gap: AppSpacing[3],
    marginBottom: AppSpacing[2],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
  },
  titleBlock: {
    gap: 4,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  capacityCard: {
    gap: AppSpacing[1],
  },
  capacityTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  capacityValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  row: {
    gap: AppSpacing[2],
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing[2],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontWeight: '700',
    fontSize: 17,
  },
  planText: {
    fontSize: AppFontSize.sm,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
