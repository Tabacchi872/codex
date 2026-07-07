import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemeSettings } from '@/components/theme-settings';
import { Spacing } from '@/constants/theme';
import { CLIENT_STATUS_LABEL } from '@/types/client';
import { getClientById } from '@/lib/client-helpers';
import { getCompletedWorkoutsCount, getNextWorkoutPlan, getPurchasedWorkoutsTotal } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';

export default function ClienteProfiloScreen() {
  const insets = useSafeAreaInsets();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const logout = useAuthStore((s) => s.logout);
  const clients = useClientStore((s) => s.clients);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const client = getClientById(clients, currentClientId);
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const purchasedTotal = getPurchasedWorkoutsTotal(client);
  const completedCount = getCompletedWorkoutsCount(workoutPlans, currentClientId);

  if (!client) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Nessun profilo collegato a questo account.
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
        { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three, paddingBottom: Spacing.six },
      ]}>
      <View style={styles.titleBlock}>
        <ThemedText type="title" style={styles.title}>
          Profilo
        </ThemedText>
      </View>

      <Card style={styles.section}>
        <ThemedText type="smallBold">
          {client.firstName} {client.lastName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {client.email}
        </ThemedText>
        {client.phone && (
          <ThemedText type="small" themeColor="textSecondary">
            {client.phone}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Obiettivo: {client.goal || 'non specificato'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Stato: {CLIENT_STATUS_LABEL[client.status]}
        </ThemedText>
      </Card>

      <ThemedText type="smallBold" style={styles.sectionLabel}>
        IL TUO PIANO
      </ThemedText>
      <Card style={styles.section}>
        <ThemedText type="small" themeColor="textSecondary">
          Piano attivo: <ThemedText type="small">{nextPlan ? nextPlan.name : 'Nessuno in programma'}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Allenamenti acquistati: <ThemedText type="small">{purchasedTotal}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Allenamenti completati: <ThemedText type="small">{completedCount}</ThemedText>
        </ThemedText>
      </Card>

      <ThemedText type="smallBold" style={styles.sectionLabel}>
        TEMA
      </ThemedText>
      <ThemeSettings />

      <DeveloperInfoSection />

      <Pressable onPress={logout}>
        <ThemedText type="small" themeColor="statusExpired" style={styles.logout}>
          Esci
        </ThemedText>
      </Pressable>
    </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  section: {
    gap: 2,
  },
  sectionLabel: {
    marginTop: Spacing.two,
    letterSpacing: 0.4,
  },
  logout: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
