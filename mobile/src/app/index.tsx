import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { getClientStatus } from '@/lib/client-status';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const appointments = useAppointmentStore((s) => s.appointments);

  const statuses = clients.map((c) => getClientStatus(workoutPlans, c.id));
  const attivi = statuses.filter((s) => s === 'active').length;
  const inScadenza = statuses.filter((s) => s === 'expiring').length;
  const scaduti = statuses.filter((s) => s === 'expired').length;
  const nowKey = new Date().toISOString().slice(0, 10);
  const prossimoAppuntamento = appointments
    .filter((a) => a.status === 'scheduled' && a.date >= nowKey)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  const prossimoAppuntamentoClient = getClientById(clients, prossimoAppuntamento?.clientId);

  if (!hasHydrated || !clientsHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento…
          </ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Dashboard
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Riepilogo clienti e prossimi impegni
        </ThemedText>
      </View>

      <Card padded={false} style={styles.statsCard}>
        <StatCell label="Attivi" value={attivi} onPress={() => router.push('/clienti')} />
        <View style={styles.statDivider} />
        <StatCell label="In scadenza" value={inScadenza} color="statusWarning" onPress={() => router.push('/clienti')} />
        <View style={styles.statDivider} />
        <StatCell label="Scaduti" value={scaduti} color="statusExpired" onPress={() => router.push('/clienti')} />
      </Card>

      <ThemedText type="smallBold" style={styles.sectionLabel}>
        Prossimo appuntamento
      </ThemedText>
      {prossimoAppuntamento ? (
        <Pressable onPress={() => router.push('/appuntamenti/index')}>
          <Card style={styles.appointmentRow}>
            <View>
              <ThemedText type="default">
                {prossimoAppuntamentoClient ? clientFullName(prossimoAppuntamentoClient) : 'Cliente non trovato'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDayMonth(prossimoAppuntamento.date)} · {prossimoAppuntamento.startTime}
              </ThemedText>
            </View>
            <ThemedText type="linkPrimary">Vedi</ThemedText>
          </Card>
        </Pressable>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun appuntamento in programma.
        </ThemedText>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

function StatCell({
  label,
  value,
  onPress,
  color,
}: {
  label: string;
  value: number;
  onPress: () => void;
  color?: 'statusWarning' | 'statusExpired';
}) {
  return (
    <Pressable onPress={onPress} style={styles.statCell}>
      <ThemedText type="title" style={styles.statValue} themeColor={color}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor={color ?? 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(120,124,130,0.25)',
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  appointmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
