import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import type { WorkoutSessionStatus } from '@/types/training';

type Tab = 'todo' | 'past';

export default function SchedeListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  if (!hasHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento schede…
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
          <View style={styles.titleBlock}>
            <ThemedText type="title" style={styles.title}>
              Allenamenti
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {workoutPlans.length} workout tra i tuoi clienti
            </ThemedText>
          </View>
          <PlaceholderBanner text="Persistenza locale parziale: gli allenamenti restano salvati su questo dispositivo/browser, non ancora sincronizzati con un backend." />

          <View style={styles.tabRow}>
            <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
            <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={() => router.push('/schede/new')} style={styles.actionButtonWrap}>
              <View style={[styles.newButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  + Nuova scheda
                </ThemedText>
              </View>
            </Pressable>
            <Pressable onPress={() => router.push('/schede/modelli')} style={styles.actionButtonWrap}>
              <View style={[styles.newButtonOutline, { borderColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Modelli allenamento
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <ThemedText type="small" themeColor="textSecondary">
          {tab === 'todo' ? 'Nessun workout da fare al momento.' : 'Nessun workout passato ancora.'}
        </ThemedText>
      }
      renderItem={({ item }) => {
        const client = getClientById(clients, item.clientId);
        const status: WorkoutSessionStatus = item.sessionStatus ?? 'todo';
        return (
          <Pressable onPress={() => router.push(`/schede/${item.id}`)}>
            <Card style={styles.row}>
              <View style={styles.rowLeft}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatWeekday(item.startDate)} · {formatDayMonth(item.startDate)}
                </ThemedText>
                <ThemedText type="default" style={styles.planName}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {client ? clientFullName(client) : 'Cliente non trovato'} · {item.exercises.length} esercizi
                </ThemedText>
                {status !== 'todo' && <SessionStatusPill status={status} />}
              </View>
              <ThemedText style={[styles.arrow, { color: theme.primary }]}>→</ThemedText>
            </Card>
          </Pressable>
        );
      }}
    />
    </ScreenBackground>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <ThemedText type="smallBold" themeColor={active ? 'primary' : 'textSecondary'}>
        {label}
      </ThemedText>
      <View style={[styles.tabIndicator, active && { backgroundColor: theme.primary }]} />
    </Pressable>
  );
}

function SessionStatusPill({ status }: { status: WorkoutSessionStatus }) {
  const theme = useTheme();
  const isSkipped = status === 'skipped';
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: isSkipped ? theme.dangerSoft : theme.backgroundSelected },
      ]}>
      <ThemedText type="small" themeColor={isSkipped ? 'text' : 'statusActive'} style={styles.statusPillLabel}>
        {isSkipped ? 'Saltato' : 'Completato'}
      </ThemedText>
    </View>
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
  titleBlock: {
    gap: 4,
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
  },
  tabIndicator: {
    height: 3,
    width: 28,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButtonWrap: {
    flex: 1,
  },
  newButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  newButtonOutline: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    gap: 2,
    flex: 1,
    marginRight: Spacing.two,
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
