import { LogOut } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppHeader, AppScreen, AppSectionTitle } from '@/components/ui';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ThemeSettings } from '@/components/theme-settings';
import { signOut } from '@/lib/auth-service';
import { getClientById } from '@/lib/client-helpers';
import { getCompletedWorkoutsCount, getNextWorkoutPlan, getPurchasedWorkoutsTotal } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import { CLIENT_STATUS_LABEL } from '@/types/client';

export default function ClienteProfiloScreen() {
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await signOut();
    logout();
  }
  const clients = useClientStore((s) => s.clients);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const client = getClientById(clients, currentClientId);
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const purchasedTotal = getPurchasedWorkoutsTotal(client);
  const completedCount = getCompletedWorkoutsCount(workoutPlans, currentClientId);

  if (!client) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Nessun profilo collegato a questo account.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader title="Profilo" />

      <AppCard style={styles.section}>
        <Text style={[styles.name, { color: colors.ink }]}>
          {client.firstName} {client.lastName}
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.email}</Text>
        {client.phone ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.phone}</Text> : null}
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Obiettivo: {client.goal || 'non specificato'}</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Stato: {CLIENT_STATUS_LABEL[client.status]}</Text>
      </AppCard>

      <AppSectionTitle>IL TUO PIANO</AppSectionTitle>
      <AppCard style={styles.section}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Piano attivo: <Text style={{ color: colors.ink, fontWeight: '600' }}>{nextPlan ? nextPlan.name : 'Nessuno in programma'}</Text>
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Allenamenti acquistati: <Text style={{ color: colors.ink, fontWeight: '600' }}>{purchasedTotal}</Text>
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Allenamenti completati: <Text style={{ color: colors.ink, fontWeight: '600' }}>{completedCount}</Text>
        </Text>
      </AppCard>

      <AppSectionTitle>TEMA</AppSectionTitle>
      <ThemeSettings />

      <DeveloperInfoSection />

      <Pressable onPress={handleLogout} style={styles.logout} hitSlop={6}>
        <LogOut size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>Esci</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 4,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: AppSpacing[2],
  },
  logoutText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
