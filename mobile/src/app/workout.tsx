import { useRouter } from 'expo-router';
import { Calendar, ChevronRight, Dumbbell } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppCard } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
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
        renderItem={({ item }) => <WorkoutRow plan={item} myPlans={myPlans} onPress={() => router.push(`/schede/${item.id}`)} />}
      />
    </View>
  );
}

function WorkoutRow({ plan, myPlans, onPress }: { plan: WorkoutPlan; myPlans: WorkoutPlan[]; onPress: () => void }) {
  const { colors } = useAppTheme();
  const status = plan.sessionStatus ?? 'todo';
  const weekLabel = getSessionWeekLabel(myPlans, plan);
  const dayLabel = getSessionDayLabel(plan);

  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.badgeRow}>
          <AppBadge label={`GIORNO ${dayLabel}`} tone="moss" />
          <View style={styles.metaRow}>
            <Calendar size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {formatWeekday(plan.startDate)} · {formatDayMonth(plan.startDate)}
              {plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''} · Settimana {weekLabel}
            </Text>
          </View>
        </View>
        {status !== 'todo' ? <AppBadge label={SESSION_STATUS_LABEL[status]} tone={status === 'skipped' ? 'rust' : 'moss'} /> : null}
      </View>
      <View style={styles.rowBottom}>
        <View style={styles.rowBottomLeft}>
          <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={1}>
            {plan.name}
          </Text>
          <View style={styles.metaRow}>
            <Dumbbell size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]}>{plan.exercises.length} esercizi</Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.inkFaint} />
      </View>
    </AppCard>
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
  card: {
    gap: AppSpacing[3],
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[2],
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBottomLeft: {
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
