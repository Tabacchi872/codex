import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { SubscriptionForm } from '@/components/subscription-form';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSubscriptionStore } from '@/store/subscription-store';
import { computeSubscriptionStatus, getCurrentSubscription, type SubscriptionPackage } from '@/types/subscription';

export default function NuovoAbbonamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const addSubscription = useSubscriptionStore((s) => s.addSubscription);

  const existingSubscription = getCurrentSubscription(subscriptions, clientId);
  const existingValidSubscription = computeSubscriptionStatus(existingSubscription) !== 'expired' ? existingSubscription : null;

  function handleSave(subscription: SubscriptionPackage) {
    addSubscription(subscription);
    router.back();
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ title: 'Nuovo abbonamento' }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
          },
        ]}>
        {existingValidSubscription && (
          <PlaceholderBanner
            text={`Questo cliente ha già un abbonamento valido ("${existingValidSubscription.packageName}"). Crearne uno nuovo non lo modifica: se è un rinnovo, valuta prima di impostarlo su Completato/Scaduto da "Aggiorna abbonamento".`}
          />
        )}
        <SubscriptionForm clientId={clientId} onSave={handleSave} saveLabel="Crea abbonamento" />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
