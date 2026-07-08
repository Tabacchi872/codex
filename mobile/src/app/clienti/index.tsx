import { useRouter } from 'expo-router';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import {
  COMPUTED_SUBSCRIPTION_STATUS_LABEL,
  computeSubscriptionStatus,
  getCurrentSubscription,
  type ComputedSubscriptionStatus,
} from '@/types/subscription';

export default function ClientiListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  if (!isCoach) {
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  if (!clientsHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento clienti...
          </ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedText type="title" style={styles.title}>
                Clienti
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {clients.length} clienti in gestione
              </ThemedText>
            </View>
            <Pressable onPress={() => router.push('/clienti/new')} hitSlop={6}>
              <View style={[styles.newButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  + Nuovo cliente
                </ThemedText>
              </View>
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const subscription = getCurrentSubscription(subscriptions, item.id);
          const status = computeSubscriptionStatus(subscription);
          return (
            <Pressable onPress={() => router.push(`/clienti/${item.id}`)} hitSlop={4}>
              <Card style={styles.row}>
                <View style={styles.rowHeader}>
                  <View style={styles.rowText}>
                    <ThemedText type="default" style={styles.name}>
                      {clientFullName(item)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.planText}>
                      {subscription ? subscription.packageName : 'Nessun abbonamento'}
                    </ThemedText>
                  </View>
                  <SubscriptionChip status={status} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </ScreenBackground>
  );
}

function SubscriptionChip({ status }: { status: ComputedSubscriptionStatus }) {
  const theme = useTheme();
  const color =
    status === 'active' ? theme.statusActive : status === 'expiring' ? theme.statusWarning : theme.statusExpired;

  return (
    <View style={[styles.statusChip, { borderColor: color, backgroundColor: `${color}14` }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" style={[styles.statusLabel, { color }]}>
        {COMPUTED_SUBSCRIPTION_STATUS_LABEL[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  newButton: {
    borderRadius: Radius.md,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 24,
  },
  planText: {
    flexShrink: 1,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    gap: 6,
    maxWidth: 132,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  separator: {
    height: Spacing.two,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
