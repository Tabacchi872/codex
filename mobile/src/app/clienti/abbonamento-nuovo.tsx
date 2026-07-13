import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/ui';
import { SubscriptionForm } from '@/components/subscription-form';
import { useSubscriptionStore } from '@/store/subscription-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { computeSubscriptionStatus, getCurrentSubscription, type SubscriptionPackage } from '@/types/subscription';

export default function NuovoAbbonamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
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
    <AppScreen>
      <Stack.Screen options={{ title: 'Nuovo abbonamento' }} />
      {existingValidSubscription ? (
        <View style={[styles.notice, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Text style={[styles.noticeText, { color: colors.inkSoft }]}>
            Questo cliente ha già un abbonamento valido (&quot;{existingValidSubscription.packageName}&quot;). Crearne uno nuovo
            non lo modifica: se è un rinnovo, valuta prima di impostarlo su Completato/Scaduto da &quot;Aggiorna abbonamento&quot;.
          </Text>
        </View>
      ) : null}
      <SubscriptionForm clientId={clientId} onSave={handleSave} saveLabel="Crea abbonamento" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
    marginBottom: AppSpacing[1],
  },
  noticeText: {
    fontSize: AppFontSize.sm,
  },
});
