import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Calendar, ChevronRight, Dumbbell } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { AppBadge, AppButton, AppPressableCard } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import { logClientNavPress } from '@/lib/client-navigation';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { getClientPlans, getSessionDayLabel, getSessionWeekLabel } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import { SESSION_STATUS_LABEL, type WorkoutPlan } from '@/types/training';

type Tab = 'todo' | 'past';

// Lista allenamenti del SOLO cliente autenticato (a differenza di schede/index.tsx,
// che è la vista coach su tutti i clienti e resta bloccata al cliente da
// CoachOnlyNotice). Schermata nuova invece di riadattare quella coach.
// FlatList non puo' stare dentro AppScreen (ScrollView annidate non
// supportate): sfondo/padding replicano manualmente quelli di AppScreen.
export default function WorkoutClienteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const [tab, setTab] = useState<Tab>('todo');
  const { loading: remoteLoading, error: remoteError, refresh } = useWorkoutPlansSync();

  function navigateToPlan(planId: string) {
    const target = `/schede/${planId}`;
    logClientNavPress(`workout-${tab}`, target);
    router.push(target as Href);
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const myPlans = useMemo(() => getClientPlans(workoutPlans, currentClientId), [workoutPlans, currentClientId]);

  const filtered = useMemo(() => {
    return myPlans.filter((p) => {
      const status = p.sessionStatus ?? 'todo';
      return tab === 'todo' ? status === 'todo' : status !== 'todo';
    });
  }, [myPlans, tab]);

  if (!hasHydrated) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento…</Text>
        </View>
      </View>
    );
  }

  if (remoteLoading && myPlans.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={{ color: colors.inkSoft, marginTop: AppSpacing[2] }}>Caricamento allenamenti…</Text>
        </View>
      </View>
    );
  }

  if (remoteError && myPlans.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Impossibile caricare i tuoi allenamenti.</Text>
          <Text style={{ color: colors.inkSoft, marginTop: 4, textAlign: 'center', paddingHorizontal: AppSpacing[5] }}>{remoteError}</Text>
          <View style={{ marginTop: AppSpacing[3] }}>
            <AppButton label="Riprova" onPress={refresh} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[AppTextStyle.title, { color: colors.ink }]}>I tuoi allenamenti</Text>
            <View style={styles.tabRow}>
              <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
              <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[3] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {tab === 'todo' ? 'Nessun allenamento da fare al momento.' : 'Nessun allenamento passato ancora.'}
          </Text>
        }
        renderItem={({ item }) => <WorkoutRow plan={item} myPlans={myPlans} onPress={() => navigateToPlan(item.id)} />}
      />
    </View>
  );
}

function WorkoutRow({ plan, myPlans, onPress }: { plan: WorkoutPlan; myPlans: WorkoutPlan[]; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const status = plan.sessionStatus ?? 'todo';
  const weekLabel = getSessionWeekLabel(myPlans, plan);
  const dayLabel = getSessionDayLabel(plan);
  const firstExercise = plan.exercises[0] ? resolve(plan.exercises[0].exerciseId) : null;
  const thumbnailSize = 84;

  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri allenamento ${plan.name}`} style={styles.card}>
      <View style={styles.cardRow}>
        {firstExercise ? (
          <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={thumbnailSize} />
        ) : (
          <View style={[styles.planPlaceholder, { backgroundColor: colors.mossSoft }]}>
            <Dumbbell size={26} color={colors.moss} />
          </View>
        )}
        <View style={styles.cardCopy}>
          <View style={styles.badgeRow}>
            <AppBadge label={`GIORNO ${dayLabel}`} tone="moss" />
            {status !== 'todo' ? (
              <AppBadge
                label={SESSION_STATUS_LABEL[status]}
                tone={status === 'completed' ? 'moss' : status === 'skipped' ? 'amber' : 'rust'}
              />
            ) : null}
          </View>
          <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
            {plan.name}
          </Text>
          <View style={styles.metaRow}>
            <Calendar size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {formatWeekday(plan.startDate)} · {formatDayMonth(plan.startDate)}
              {plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Dumbbell size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {plan.exercises.length} esercizi · Settimana {weekLabel}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.inkFaint} />
      </View>
    </AppPressableCard>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.tabButton, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
      <Text style={[styles.tabButtonLabel, { color: active ? colors.onMoss : colors.moss }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[4],
  },
  header: {
    gap: AppSpacing[2],
    marginBottom: AppSpacing[1],
  },
  tabRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  tabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  card: {
    padding: 11,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  cardCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  planPlaceholder: {
    alignItems: 'center',
    borderRadius: AppRadius.xl,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    flex: 1,
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    minWidth: 0,
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    minWidth: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
