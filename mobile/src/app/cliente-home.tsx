import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppEmptyState, AppHeader, AppListRow, AppScreen, AppStatCard } from '@/components/ui';
import { getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { getNextWorkoutPlan, getSessionDayLabel, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useBoardStore } from '@/store/board-store';
import { useBookingStore } from '@/store/booking-store';
import { useCheckinStore } from '@/store/checkin-store';
import { useClientStore } from '@/store/client-store';
import { useNutritionStore } from '@/store/nutrition-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Home cliente: mostra SOLO i dati collegati al proprio clientId (nessuna lista
// clienti, nessun dato di altri clienti, nessuna nota interna del coach).
export default function ClienteHomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const nutritionPlans = useNutritionStore((s) => s.plans);
  const checkins = useCheckinStore((s) => s.checkins);
  const bookings = useBookingStore((s) => s.bookings);
  const boardPosts = useBoardStore((s) => s.posts);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);

  const client = getClientById(clients, currentClientId);

  if (currentRole === 'coach') {
    return <Redirect href="/" />;
  }

  if (!hasHydrated) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento…</Text>
        </View>
      </AppScreen>
    );
  }

  const { completed: completedCount, total: purchasedTotal } = getWorkoutCounter(
    subscriptions,
    workoutPlans,
    client,
    currentClientId
  );
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const nutritionPlan = nutritionPlans.find((p) => p.clientId === currentClientId) ?? null;
  const lastCheckin = checkins
    .filter((c) => c.clientId === currentClientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const nextBooking = bookings
    .filter((b) => b.clientId === currentClientId && b.status === 'confermata')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const relevantPosts = boardPosts.filter((p) => p.scope === 'globale' || p.clientId === currentClientId);

  return (
    <AppScreen>
      <AppHeader
        title={`Ciao${client ? `, ${client.firstName}` : ''}`}
        action={
          <AppButton
            label="Coach"
            variant="outline"
            size="sm"
            icon={<Text style={{ fontSize: 13 }}>💬</Text>}
            onPress={() => router.push('/chat')}
          />
        }
      />

      {!client ? (
        <AppCard>
          <AppEmptyState icon={<Text style={{ fontSize: 18 }}>👤</Text>} title="Nessun profilo cliente collegato a questo account." />
        </AppCard>
      ) : (
        <>
          <AppStatCard size="lg" value={`${completedCount}/${purchasedTotal}`} label="workout completati" accentColor={colors.moss} />

          <AppCard style={styles.listCard}>
            <AppListRow
              icon={<Text style={{ fontSize: 17 }}>🏋️</Text>}
              iconBackground={colors.coralSoft}
              title="Allenamenti"
              subtitle={
                nextPlan
                  ? `${nextPlan.name} · Giorno ${getSessionDayLabel(nextPlan)} · ${nextPlan.exercises.length} esercizi`
                  : 'Nessun allenamento assegnato'
              }
              onPress={() => (nextPlan ? router.push(`/schede/${nextPlan.id}`) : router.push('/workout'))}
            />
            <Divider />
            <AppListRow
              icon={<Text style={{ fontSize: 17 }}>🍎</Text>}
              iconBackground={colors.mossSoft}
              title="Nutrizione"
              subtitle={nutritionPlan ? nutritionPlan.title : 'Nessun piano nutrizionale assegnato'}
              onPress={() => router.push('/nutrizione')}
            />
            <Divider />
            <AppListRow
              icon={<Text style={{ fontSize: 17 }}>📋</Text>}
              iconBackground={colors.surfaceSubtle}
              title="Check-in settimanale"
              subtitle={lastCheckin ? `Ultimo: ${formatDayMonth(lastCheckin.date)}` : 'Da compilare'}
              onPress={() => router.push('/questionario')}
              trailing={<TrailingPill label="Check In" />}
            />
            <Divider />
            <AppListRow
              icon={<Text style={{ fontSize: 17 }}>📅</Text>}
              iconBackground={colors.surfaceSubtle}
              title="Le tue prenotazioni"
              subtitle={
                nextBooking
                  ? `Prossima: ${formatDayMonth(nextBooking.date)} alle ${nextBooking.time}`
                  : 'Nessuna prenotazione attiva'
              }
              onPress={() => router.push('/prenotazioni')}
              trailing={nextBooking ? undefined : <TrailingPill label="Prenota" />}
            />
            <Divider />
            <AppListRow
              icon={<Text style={{ fontSize: 17 }}>📣</Text>}
              iconBackground={colors.surfaceSubtle}
              title="Bacheca"
              subtitle={relevantPosts.length === 0 ? 'Nessun annuncio recente' : `${relevantPosts.length} ${relevantPosts.length === 1 ? 'annuncio' : 'annunci'}`}
              onPress={() => router.push('/bacheca')}
            />
          </AppCard>
        </>
      )}
    </AppScreen>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

// Etichetta visiva (non un Pressable/bottone): usata come `trailing` di una
// AppListRow che ha già lo stesso `onPress` — un AppButton qui dentro
// creerebbe un <button> annidato in un altro <button> (bug di hydration su
// web, l'intera riga è già un Pressable/role="button"). Stesso aspetto di
// AppButton size="sm" (coral pieno), ma puramente decorativa.
function TrailingPill({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.trailingPill, { backgroundColor: colors.coral }]}>
      <Text style={[styles.trailingPillLabel, { color: colors.onCoral }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    paddingVertical: AppSpacing[1],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -AppSpacing[4],
  },
  trailingPill: {
    height: 36,
    borderRadius: AppRadius.lg,
    paddingHorizontal: AppSpacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingPillLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
  },
});
