import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { SubscriptionForm } from '@/components/subscription-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSubscriptionStore } from '@/store/subscription-store';
import type { SubscriptionPackage } from '@/types/subscription';

export default function AggiornaAbbonamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const updateSubscription = useSubscriptionStore((s) => s.updateSubscription);

  const subscription = subscriptions.find((s) => s.id === subscriptionId);

  if (!subscription) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">Abbonamento non trovato.</ThemedText>
        </ThemedView>
      </ScreenBackground>
    );
  }

  function handleSave(updated: SubscriptionPackage) {
    updateSubscription(updated);
    router.back();
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ title: 'Aggiorna abbonamento' }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <SubscriptionForm
          initialSubscription={subscription}
          clientId={subscription.clientId}
          onSave={handleSave}
          saveLabel="Salva abbonamento"
        />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
