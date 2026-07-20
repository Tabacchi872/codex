import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';

import { AppButton, AppScreen, BackHeader } from '@/components/ui';
import { AppSpacing, useAppTheme } from '@/theme';

export default function NuovoAbbonamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();

  const goBackToClient = useCallback(() => {
    if (clientId) {
      router.replace({ pathname: '/clienti/[id]', params: { id: clientId } });
      return;
    }
    router.replace('/clienti');
  }, [clientId, router]);

  useEffect(() => {
    goBackToClient();
  }, [goBackToClient]);

  return (
    <AppScreen>
      <BackHeader title="Percorso cliente" fallbackHref="/clienti" onBack={goBackToClient} />
      <View style={{ gap: AppSpacing[3] }}>
        <Text style={{ color: colors.inkSoft }}>
          Il pacchetto commerciale appartiene al coach. Gestisci schede e stato cliente dal dettaglio.
        </Text>
        <AppButton label="Torna al cliente" onPress={goBackToClient} fullWidth />
      </View>
    </AppScreen>
  );
}
