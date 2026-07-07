import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDayMonth } from '@/lib/format-date';
import { getCompletedWorkoutsCount, getPurchasedWorkoutsTotal } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useCheckinStore } from '@/store/checkin-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { getClientById } from '@/lib/client-helpers';

// Progressi/Metriche/Storico pesi (voci del menu Altro) puntano tutte a questa
// unica schermata: sono lo stesso concetto (andamento nel tempo) letto da dati
// reali già esistenti (check-in settimanali, allenamenti completati), non tre
// schermate quasi vuote duplicate.
export default function ProgressiScreen() {
  const insets = useSafeAreaInsets();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const checkins = useCheckinStore((s) => s.checkins);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);

  const client = getClientById(clients, currentClientId);
  const purchasedTotal = getPurchasedWorkoutsTotal(client);
  const completedCount = getCompletedWorkoutsCount(workoutPlans, currentClientId);

  const weightHistory = checkins
    .filter((c) => c.clientId === currentClientId && c.weightToday !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Progressi
        </ThemedText>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          ALLENAMENTO
        </ThemedText>
        <Card style={styles.kpiRow}>
          <View style={styles.kpiStat}>
            <ThemedText type="title" style={styles.kpiNumber}>
              {completedCount}/{purchasedTotal}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              workout completati
            </ThemedText>
          </View>
        </Card>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          PESO CORPOREO
        </ThemedText>
        {weightHistory.length === 0 ? (
          <PlaceholderBanner text="Nessun dato di peso ancora: compila un check-in settimanale per iniziare a vedere l'andamento qui." />
        ) : (
          <Card style={styles.weightCard}>
            {weightHistory.map((c) => (
              <View key={c.id} style={styles.weightRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDayMonth(c.date)}
                </ThemedText>
                <ThemedText type="smallBold">{c.weightToday} kg</ThemedText>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    marginTop: Spacing.three,
    letterSpacing: 0.4,
  },
  kpiRow: {
    alignItems: 'center',
  },
  kpiStat: {
    alignItems: 'center',
    gap: 2,
  },
  kpiNumber: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '700',
  },
  weightCard: {
    gap: 4,
  },
  weightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
