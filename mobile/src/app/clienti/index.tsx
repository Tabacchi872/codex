import { useRouter } from 'expo-router';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

export default function ClientiListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const isCoach = useAuthStore((s) => s.currentRole !== 'client');

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
            Caricamento clienti…
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
          <PlaceholderBanner text="Persistenza locale parziale: i clienti creati qui restano salvati su questo dispositivo/browser, non ancora sincronizzati con un backend." />
          <Pressable onPress={() => router.push('/clienti/new')}>
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
          <Pressable onPress={() => router.push(`/clienti/${item.id}`)}>
            <Card style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="default" style={styles.name}>
                  {clientFullName(item)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {subscription ? subscription.packageName : 'Nessun abbonamento'}
                </ThemedText>
              </View>
              <StatusDot status={status} />
            </Card>
          </Pressable>
        );
      }}
    />
    </ScreenBackground>
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
    padding: Spacing.three,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowText: {
    gap: 2,
    flex: 1,
    marginRight: Spacing.two,
  },
  name: {
    fontWeight: '600',
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
