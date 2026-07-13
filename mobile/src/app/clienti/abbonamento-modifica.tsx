import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { AppScreen } from '@/components/ui';
import { SubscriptionForm } from '@/components/subscription-form';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useAppTheme } from '@/theme';
import type { SubscriptionPackage } from '@/types/subscription';

export default function AggiornaAbbonamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const updateSubscription = useSubscriptionStore((s) => s.updateSubscription);

  const subscription = subscriptions.find((s) => s.id === subscriptionId);

  if (!subscription) {
    return (
      <AppScreen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.ink }}>Abbonamento non trovato.</Text>
        </View>
      </AppScreen>
    );
  }

  function handleSave(updated: SubscriptionPackage) {
    updateSubscription(updated);
    router.back();
  }

  return (
    <AppScreen>
      <Stack.Screen options={{ title: 'Aggiorna abbonamento' }} />
      <SubscriptionForm initialSubscription={subscription} clientId={subscription.clientId} onSave={handleSave} saveLabel="Salva abbonamento" />
    </AppScreen>
  );
}
