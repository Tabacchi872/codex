import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar, ChevronRight, Dumbbell } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { AppBadge, AppButton, AppPressableCard } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { WorkoutPlan, WorkoutSessionStatus } from '@/types/training';

type Tab = 'todo' | 'past';

export default function SchedeListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const clients = useClientStore((s) => s.clients);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const [tab, setTab] = useState<Tab>('todo');
  const { loading: remoteLoading, error: remoteError, refresh } = useWorkoutPlansSync();

  // Refresh ad ogni apertura/foreground della lista (2026-07-14, migrazione
  // Supabase): garantisce che una scheda creata/modificata su un altro
  // dispositivo compaia qui senza dover riavviare l'app — stesso pattern
  // gia' usato altrove nel progetto (useFocusEffect + refresh, vedi
  // docs/PROJECT_STATE.md).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => {
    return workoutPlans.filter((p) => {
      const status = p.sessionStatus ?? 'todo';
      return tab === 'todo' ? status === 'todo' : status !== 'todo';
    });
  }, [workoutPlans, tab]);

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  if (!hasHydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.inkSoft }}>Caricamento schede…</Text>
      </View>
    );
  }

  if (remoteLoading && workoutPlans.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
        <Text style={{ color: colors.inkSoft, marginTop: AppSpacing[2] }}>Caricamento schede da Supabase…</Text>
      </View>
    );
  }

  if (remoteError && workoutPlans.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Impossibile caricare le schede.</Text>
        <Text style={{ color: colors.inkSoft, marginTop: 4, textAlign: 'center', paddingHorizontal: AppSpacing[5] }}>{remoteError}</Text>
        <View style={{ marginTop: AppSpacing[3] }}>
          <AppButton label="Riprova" onPress={refresh} />
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
            <View style={styles.titleBlock}>
              <Text style={[AppTextStyle.title, { color: colors.ink }]}>Allenamenti</Text>
              <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{workoutPlans.length} workout tra i tuoi clienti</Text>
            </View>
            <View style={styles.tabRow}>
              <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
              <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
            </View>
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrap}>
                <AppButton label="+ Nuova scheda" onPress={() => router.push('/schede/new')} fullWidth />
              </View>
              <View style={styles.actionButtonWrap}>
                <AppButton label="Modelli allenamento" onPress={() => router.push('/schede/modelli')} variant="outline" fullWidth />
              </View>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {tab === 'todo' ? 'Nessun workout da fare al momento.' : 'Nessun workout passato ancora.'}
          </Text>
        }
        renderItem={({ item }) => {
          const client = getClientById(clients, item.clientId);
          return (
            <CoachWorkoutRow
              plan={item}
              clientName={client ? clientFullName(client) : 'Cliente non trovato'}
              onPress={() => router.push(`/schede/${item.id}`)}
            />
          );
        }}
      />
    </View>
  );
}


function CoachWorkoutRow({ plan, clientName, onPress }: { plan: WorkoutPlan; clientName: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const status: WorkoutSessionStatus = plan.sessionStatus ?? 'todo';
  const firstExercise = plan.exercises[0] ? resolve(plan.exercises[0].exerciseId) : null;

  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri scheda ${plan.name}`} style={styles.row}>
      {firstExercise ? (
        <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={60} />
      ) : (
        <View style={[styles.rowPlaceholder, { backgroundColor: colors.mossSoft }]}>
          <Dumbbell size={24} color={colors.moss} />
        </View>
      )}
      <View style={styles.rowLeft}>
        <View style={styles.rowBadgeLine}>
          <View style={styles.rowMetaInline}>
            <Calendar size={13} color={colors.inkSoft} />
            <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={1}>
              {formatWeekday(plan.startDate)} · {formatDayMonth(plan.startDate)}
            </Text>
          </View>
          {status !== 'todo' ? (
            <AppBadge
              label={status === 'completed' ? 'Completato' : status === 'skipped' ? 'Saltato' : 'Annullato'}
              tone={status === 'completed' ? 'moss' : status === 'skipped' ? 'amber' : 'rust'}
            />
          ) : null}
        </View>
        <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
          {plan.name}
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={1}>
          {clientName} · {plan.exercises.length} esercizi
        </Text>
      </View>
      <ChevronRight size={20} color={colors.inkFaint} />
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
    paddingHorizontal: AppSpacing[5],
  },
  header: {
    gap: AppSpacing[3],
    marginBottom: AppSpacing[2],
  },
  titleBlock: {
    gap: 4,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: AppRadius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLabel: {
    fontSize: AppFontSize.sm + 1,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  actionButtonWrap: {
    flexBasis: 140,
    flexGrow: 1,
    minWidth: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    padding: AppSpacing[3],
  },
  rowPlaceholder: {
    alignItems: 'center',
    borderRadius: AppRadius.xl,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  rowLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  rowBadgeLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
    justifyContent: 'space-between',
  },
  rowMetaInline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
