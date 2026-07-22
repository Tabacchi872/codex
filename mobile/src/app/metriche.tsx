import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ClientMetricsPanel } from '@/components/client-metrics-panel';
import { AppCard, AppScreen, BackHeader } from '@/components/ui';
import { getClientById } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

export default function MetricheClienteScreen() {
  const { colors } = useAppTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const client = getClientById(clients, currentClientId);

  if (currentRole === 'coach') return <Redirect href="/" />;

  return (
    <AppScreen contentStyle={styles.content}>
      <BackHeader title="Metriche" fallbackHref="/cliente-home" />
      {!currentClientId ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun profilo cliente collegato.</Text>
        </AppCard>
      ) : (
        <>
          <View>
            <Text style={[styles.title, { color: colors.ink }]}>I tuoi progressi</Text>
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>
              Le tue misurazioni, i commenti del coach e i progressi nel tempo.
            </Text>
          </View>
          <ClientMetricsPanel clientId={currentClientId} clientName={client ? `${client.firstName} ${client.lastName}`.trim() : 'Cliente'} readOnly allowClientActions />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: AppSpacing[3],
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  smallText: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
});
