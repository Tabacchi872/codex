import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { WorkoutSessionStatus } from '@/types/training';

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
          const status: WorkoutSessionStatus = item.sessionStatus ?? 'todo';
          return (
            <AppCard onPress={() => router.push(`/schede/${item.id}`)} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={[styles.smallText, { color: colors.inkSoft }]}>
                  {formatWeekday(item.startDate)} · {formatDayMonth(item.startDate)}
                </Text>
                <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={1}>
                  {client ? clientFullName(client) : 'Cliente non trovato'} · {item.exercises.length} esercizi
                </Text>
                {status !== 'todo' ? (
                  <View style={styles.statusPillWrap}>
                    <AppBadge label={status === 'skipped' ? 'Saltato' : 'Completato'} tone={status === 'skipped' ? 'rust' : 'moss'} />
                  </View>
                ) : null}
              </View>
              <ChevronRight size={20} color={colors.inkFaint} />
            </AppCard>
          );
        }}
      />
    </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
    marginRight: AppSpacing[2],
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  statusPillWrap: {
    marginTop: 2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
