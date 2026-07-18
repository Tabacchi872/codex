import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppScreen, BackHeader } from '@/components/ui';
import { formatDayMonth } from '@/lib/format-date';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { ExerciseProgressHistory } from '@/types/training';

type ExerciseLoadGroup = {
  exerciseId: string;
  exerciseName: string;
  entries: ExerciseProgressHistory[];
  sessions: Array<{ date: string; sets: ExerciseProgressHistory[] }>;
  lastEntry: ExerciseProgressHistory;
  bestWeight: number;
};

export default function StoricoCarichiScreen() {
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const progressHistory = useTrainingStore((s) => s.progressHistory);
  const { resolve } = useExerciseResolver();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo<ExerciseLoadGroup[]>(() => {
    if (!currentClientId) return [];
    const byExercise = new Map<string, ExerciseProgressHistory[]>();
    for (const entry of progressHistory) {
      if (entry.clientId !== currentClientId) continue;
      const entries = byExercise.get(entry.exerciseId) ?? [];
      entries.push(entry);
      byExercise.set(entry.exerciseId, entries);
    }

    return Array.from(byExercise.entries())
      .map(([exerciseId, entries]) => {
        const sortedEntries = [...entries].sort(compareEntriesDesc);
        const byDate = new Map<string, ExerciseProgressHistory[]>();
        for (const entry of sortedEntries) {
          const sessionEntries = byDate.get(entry.date) ?? [];
          sessionEntries.push(entry);
          byDate.set(entry.date, sessionEntries);
        }
        const sessions = Array.from(byDate.entries())
          .map(([date, sets]) => ({ date, sets: [...sets].sort(compareEntriesAsc) }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const exercise = resolve(exerciseId);
        return {
          exerciseId,
          exerciseName: exercise?.name ?? exerciseId,
          entries: sortedEntries,
          sessions,
          lastEntry: sortedEntries[0],
          bestWeight: Math.max(...sortedEntries.map((entry) => entry.weightUsed)),
        };
      })
      .filter((group): group is ExerciseLoadGroup => Boolean(group.lastEntry))
      .sort((a, b) => compareEntriesDesc(a.lastEntry, b.lastEntry));
  }, [currentClientId, progressHistory, resolve]);

  return (
    <AppScreen>
      <BackHeader title="Storico carichi" fallbackHref="/altro" />

      {groups.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
            Nessun carico registrato. I carichi salvati durante gli allenamenti appariranno qui.
          </Text>
        </AppCard>
      ) : (
        <View style={styles.list}>
          {groups.map((group) => {
            const isOpen = Boolean(expanded[group.exerciseId]);
            return (
              <AppCard key={group.exerciseId} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => setExpanded((current) => ({ ...current, [group.exerciseId]: !isOpen }))}
                  style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.82 }]}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={[styles.exerciseName, { color: colors.ink }]} numberOfLines={2}>
                      {group.exerciseName}
                    </Text>
                    <Text style={[styles.subText, { color: colors.inkSoft }]}>
                      Ultima data: {formatDayMonth(group.lastEntry.date)} · {group.sessions.length} sessioni
                    </Text>
                  </View>
                  {isOpen ? <ChevronDown size={20} color={colors.inkSoft} /> : <ChevronRight size={20} color={colors.inkSoft} />}
                </Pressable>

                <View style={styles.statsGrid}>
                  <LoadStat label="Ultimo carico" value={formatKg(group.lastEntry.weightUsed)} />
                  <LoadStat label="Miglior carico" value={formatKg(group.bestWeight)} highlighted />
                </View>

                {isOpen ? (
                  <View style={styles.sessions}>
                    {group.sessions.map((session) => (
                      <View key={session.date} style={[styles.session, { borderColor: colors.border }]}>
                        <Text style={[styles.sessionDate, { color: colors.ink }]}>{formatDayMonth(session.date)}</Text>
                        {session.sets.map((set, index) => (
                          <View key={set.id} style={styles.setRow}>
                            <Text style={[styles.setLabel, { color: colors.inkSoft }]}>Serie {index + 1}</Text>
                            <Text style={[styles.setValue, { color: colors.ink }]}>
                              {formatKg(set.weightUsed)} · {set.repsCompleted} rip.
                            </Text>
                            {set.notes.trim() ? (
                              <Text style={[styles.notes, { color: colors.inkSoft }]} numberOfLines={3}>
                                {set.notes}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                ) : null}
              </AppCard>
            );
          })}
        </View>
      )}
    </AppScreen>
  );
}

function LoadStat({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: highlighted ? colors.mossSoft : colors.surfaceSubtle, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlighted ? colors.moss : colors.ink }]}>{value}</Text>
    </View>
  );
}

function compareEntriesDesc(a: ExerciseProgressHistory, b: ExerciseProgressHistory) {
  return readEntryTime(b) - readEntryTime(a);
}

function compareEntriesAsc(a: ExerciseProgressHistory, b: ExerciseProgressHistory) {
  return readEntryTime(a) - readEntryTime(b);
}

function readEntryTime(entry: ExerciseProgressHistory) {
  const created = new Date(entry.createdAt).getTime();
  if (Number.isFinite(created)) return created;
  const date = new Date(entry.date).getTime();
  return Number.isFinite(date) ? date : 0;
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')} kg`;
}

const styles = StyleSheet.create({
  list: {
    gap: AppSpacing[3],
  },
  emptyCard: {
    paddingVertical: AppSpacing[5],
  },
  emptyText: {
    fontSize: AppFontSize.base,
    lineHeight: 22,
  },
  card: {
    gap: AppSpacing[3],
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  exerciseName: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
    lineHeight: 24,
  },
  subText: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  stat: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 0,
    padding: AppSpacing[3],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
    marginTop: 2,
  },
  sessions: {
    gap: AppSpacing[3],
  },
  session: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    paddingTop: AppSpacing[3],
  },
  sessionDate: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  setRow: {
    gap: 2,
  },
  setLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  setValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  notes: {
    fontSize: 12,
    lineHeight: 17,
  },
});
