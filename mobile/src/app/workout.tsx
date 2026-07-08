import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { getClientPlans, getSessionDayLabel, getSessionWeekLabel } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { SESSION_STATUS_LABEL, type WorkoutPlan } from '@/types/training';

type Tab = 'todo' | 'past';

// Lista allenamenti del SOLO cliente autenticato (a differenza di schede/index.tsx,
// che è la vista coach su tutti i clienti e resta bloccata al cliente da
// CoachOnlyNotice). Schermata nuova invece di riadattare quella coach.
export default function WorkoutClienteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              I tuoi allenamenti
            </ThemedText>
            <View style={styles.tabRow}>
              <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
              <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary">
            {tab === 'todo' ? 'Nessun allenamento da fare al momento.' : 'Nessun allenamento passato ancora.'}
          </ThemedText>
        }
        renderItem={({ item }) => <WorkoutRow plan={item} myPlans={myPlans} onPress={() => router.push(`/schede/${item.id}`)} />}
      />
    </ScreenBackground>
  );
}

function WorkoutRow({ plan, myPlans, onPress }: { plan: WorkoutPlan; myPlans: WorkoutPlan[]; onPress: () => void }) {
  const theme = useTheme();
  const status = plan.sessionStatus ?? 'todo';
  const weekLabel = getSessionWeekLabel(myPlans, plan);
  const dayLabel = getSessionDayLabel(plan);

  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <Card style={styles.row}>
        <View style={styles.rowLeft}>
          <View style={styles.badgeRow}>
            <View style={[styles.dayBadge, { backgroundColor: theme.softRed }]}>
              <ThemedText type="small" themeColor="primary" style={styles.dayBadgeText}>
                GIORNO {dayLabel}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {formatWeekday(plan.startDate)} · {formatDayMonth(plan.startDate)}
              {plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''} · Settimana {weekLabel}
            </ThemedText>
          </View>
          <ThemedText type="default" style={styles.planName}>
            {plan.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {plan.exercises.length} esercizi
          </ThemedText>
          {status !== 'todo' && (
            <View style={[styles.statusPill, { backgroundColor: status === 'skipped' ? theme.dangerSoft : theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor={status === 'skipped' ? 'text' : 'statusActive'} style={styles.statusPillLabel}>
                {SESSION_STATUS_LABEL[status]}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText style={[styles.arrow, { color: theme.primary }]}>→</ThemedText>
      </Card>
    </Pressable>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.tabButton}>
      <ThemedText type="smallBold" themeColor={active ? 'primary' : 'textSecondary'}>
        {label}
      </ThemedText>
      <View style={[styles.tabIndicator, active && { backgroundColor: theme.primary }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  tabButton: {
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  tabIndicator: {
    height: 3,
    width: 28,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
    marginRight: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  dayBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  dayBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  planName: {
    fontWeight: '700',
    fontSize: 17,
  },
  arrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 2,
  },
  statusPillLabel: {
    fontWeight: '600',
  },
  separator: {
    height: Spacing.two,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
