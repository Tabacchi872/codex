import { Redirect, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { getNextWorkoutPlan, getSessionDayLabel, getSessionWeekLabel, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useBoardStore } from '@/store/board-store';
import { useBookingStore } from '@/store/booking-store';
import { useCheckinStore } from '@/store/checkin-store';
import { useClientStore } from '@/store/client-store';
import { useNutritionStore } from '@/store/nutrition-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';

// Home cliente: mostra SOLO i dati collegati al proprio clientId (nessuna lista
// clienti, nessun dato di altri clienti, nessuna nota interna del coach).
export default function ClienteHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento…
          </ThemedText>
        </View>
      </ScreenBackground>
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
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <View style={styles.titleBlock}>
          <ThemedText type="title" style={styles.title}>
            Ciao{client ? `, ${client.firstName}` : ''}
          </ThemedText>
          <Pressable onPress={() => router.push('/chat')} hitSlop={8}>
            <ThemedText type="small" themeColor="primary">
              💬 Chat con il coach
            </ThemedText>
          </Pressable>
        </View>

        {!client ? (
          <PlaceholderBanner text="Nessun profilo cliente collegato a questo account." />
        ) : (
          <>
            <Card style={styles.statsCard}>
              <CardHeader icon="📊" title="Statistiche" />
              <View style={styles.statsRow}>
                <ThemedText type="title" style={styles.statsNumber}>
                  {completedCount}/{purchasedTotal}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  workout completati
                </ThemedText>
              </View>
            </Card>

            <Pressable onPress={() => (nextPlan ? router.push(`/schede/${nextPlan.id}`) : router.push('/workout'))} hitSlop={4}>
              <Card>
                <CardHeader icon="🏋️" title="Allenamenti" showArrow />
                {nextPlan ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Prossimo allenamento
                    </ThemedText>
                    <ThemedText type="default" style={styles.cardMainText}>
                      {nextPlan.name}
                    </ThemedText>
                    <View style={styles.metaRow}>
                      <View style={[styles.dayBadge, { backgroundColor: theme.softRed }]}>
                        <ThemedText type="small" themeColor="primary" style={styles.dayBadgeText}>
                          GIORNO {getSessionDayLabel(nextPlan)}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {nextPlan.exercises.length} esercizi · {formatDayMonth(nextPlan.startDate)}
                        {nextPlan.scheduledTime ? ` · ${nextPlan.scheduledTime}` : ''} · Settimana{' '}
                        {getSessionWeekLabel(workoutPlans, nextPlan)}
                      </ThemedText>
                    </View>
                  </>
                ) : (
                  <ThemedText type="default" style={styles.cardMainText}>
                    Nessun allenamento assegnato
                  </ThemedText>
                )}
              </Card>
            </Pressable>

            <Pressable onPress={() => router.push('/nutrizione')} hitSlop={4}>
              <Card>
                <CardHeader icon="🍎" title="Nutrizione" showArrow />
                {nutritionPlan ? (
                  <ThemedText type="default" style={styles.cardMainText}>
                    {nutritionPlan.title}
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="default" style={styles.cardMainText}>
                      Nessun piano nutrizionale
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Il tuo coach ti assegnerà presto un piano nutrizionale
                    </ThemedText>
                  </>
                )}
              </Card>
            </Pressable>

            <Pressable onPress={() => router.push('/questionario')} hitSlop={4}>
              <Card>
                <CardHeader icon="📋" title="Questionari" showArrow />
                <View style={styles.checkinRow}>
                  <View style={styles.checkinInfo}>
                    <ThemedText style={styles.checkinIcon}>📄</ThemedText>
                    <View>
                      <ThemedText type="default" style={styles.cardMainText}>
                        Check-in settimanale
                      </ThemedText>
                      {lastCheckin && (
                        <ThemedText type="small" themeColor="textSecondary">
                          Ultimo: {formatDayMonth(lastCheckin.date)}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                  <Pressable onPress={() => router.push('/questionario')} hitSlop={6}>
                    <View style={[styles.smallButton, { backgroundColor: theme.primary }]}>
                      <ThemedText type="small" themeColor="onPrimary" style={styles.smallButtonText}>
                        Check In
                      </ThemedText>
                    </View>
                  </Pressable>
                </View>
              </Card>
            </Pressable>

            <Pressable onPress={() => router.push('/prenotazioni')} hitSlop={4}>
              <Card>
                <CardHeader icon="📅" title="Le tue prenotazioni" showArrow />
                {nextBooking ? (
                  <ThemedText type="default" style={styles.cardMainText}>
                    Prossima: {formatDayMonth(nextBooking.date)} alle {nextBooking.time}
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="default" style={styles.cardMainText}>
                      Nessuna prenotazione attiva
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Le tue prossime prenotazioni saranno visualizzate qui
                    </ThemedText>
                    <Pressable onPress={() => router.push('/prenotazioni')} hitSlop={6} style={styles.bookButtonWrap}>
                      <View style={[styles.bookButton, { backgroundColor: theme.primary }]}>
                        <ThemedText type="smallBold" themeColor="onPrimary">
                          Prenota
                        </ThemedText>
                      </View>
                    </Pressable>
                  </>
                )}
              </Card>
            </Pressable>

            <Pressable onPress={() => router.push('/bacheca')} hitSlop={4}>
              <Card>
                <CardHeader icon="📣" title="Bacheca" showArrow />
                {relevantPosts.length === 0 ? (
                  <>
                    <ThemedText type="default" style={styles.cardMainText}>
                      Nessun annuncio recente
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Gli annunci del tuo coach verranno visualizzati qui
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="default" style={styles.cardMainText}>
                    {relevantPosts.length} {relevantPosts.length === 1 ? 'annuncio' : 'annunci'}
                  </ThemedText>
                )}
              </Card>
            </Pressable>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function CardHeader({ icon, title, showArrow }: { icon: string; title: string; showArrow?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderLeft}>
        <ThemedText style={styles.cardIcon}>{icon}</ThemedText>
        <ThemedText type="smallBold">{title}</ThemedText>
      </View>
      {showArrow && <ThemedText style={[styles.arrow, { color: theme.primary }]}>→</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  titleBlock: {
    gap: 4,
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  statsCard: {
    gap: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statsNumber: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardIcon: {
    fontSize: 18,
  },
  cardMainText: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dayBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  checkinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  checkinInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  checkinIcon: {
    fontSize: 22,
  },
  smallButton: {
    borderRadius: Radius.sm,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
  },
  smallButtonText: {
    fontWeight: '700',
  },
  bookButtonWrap: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  bookButton: {
    borderRadius: Radius.sm,
    minHeight: 40,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
