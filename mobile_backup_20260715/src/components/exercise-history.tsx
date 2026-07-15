import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth } from '@/lib/format-date';
import { useTrainingStore } from '@/store/training-store';
import type { ExerciseProgressHistory } from '@/types/training';

// Ogni record di ExerciseProgressHistory rappresenta UNA serie eseguita (non
// un riepilogo dell'intera sessione): più record con la stessa data sono le
// serie di quella sessione, mostrate come righe "Serie 1, 2, 3…" della tabella.
// Nessun cambio al tipo dati: è solo il modo in cui questo componente raggruppa
// e visualizza i record esistenti. L'inserimento di nuove serie vive ora in
// ExerciseSetLogger (sezione "Serie" del dettaglio esercizio, solo lato
// cliente): questo componente resta la sola vista storica, con un toggle per
// non mostrare sempre tutte le sessioni passate.
export function ExerciseHistory({
  clientId,
  exerciseId,
  workoutPlanId,
}: {
  clientId: string;
  exerciseId: string;
  workoutPlanId: string;
}) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);

  const progressHistory = useTrainingStore((s) => s.progressHistory);

  const entries = useMemo(
    () =>
      progressHistory
        .filter((h) => h.clientId === clientId && h.exerciseId === exerciseId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [progressHistory, clientId, exerciseId]
  );

  const sessions = useMemo(() => {
    const byDate = new Map<string, ExerciseProgressHistory[]>();
    for (const entry of entries) {
      const list = byDate.get(entry.date) ?? [];
      list.push(entry);
      byDate.set(entry.date, list);
    }
    return Array.from(byDate.entries())
      .map(([date, sets]) => ({ date, sets: [...sets].reverse() }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries]);

  const lastEntry = entries[0] ?? null;
  const bestRecentWeight = entries.length > 0 ? Math.max(...entries.map((e) => e.weightUsed)) : null;
  const visibleSessions = showAll ? sessions : sessions.slice(0, 1);

  return (
    <Card style={styles.container}>
      <ThemedText type="smallBold">Storico pesi</ThemedText>

      <View style={styles.summaryRow}>
        <SummaryStat label="Ultimo peso" value={lastEntry ? `${lastEntry.weightUsed} kg` : '—'} />
        <View style={[styles.summaryStat, styles.summaryStatHighlight, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="primary">
            Miglior peso recente
          </ThemedText>
          <ThemedText type="smallBold" themeColor="primary">
            {bestRecentWeight !== null ? `${bestRecentWeight} kg` : '—'}
          </ThemedText>
        </View>
      </View>

      {sessions.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun record ancora per questo cliente su questo esercizio.
        </ThemedText>
      ) : (
        visibleSessions.map((session) => (
          <View key={session.date} style={styles.session}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDayMonth(session.date)}
            </ThemedText>
            <View style={[styles.table, { borderColor: theme.border }]}>
              <View style={[styles.tableHeaderRow, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary" style={[styles.cell, styles.cellSet]}>
                  Serie
                </ThemedText>
                <ThemedText type="smallBold" themeColor="onPrimary" style={styles.cell}>
                  Peso
                </ThemedText>
                <ThemedText type="smallBold" themeColor="onPrimary" style={styles.cell}>
                  Ripetizioni
                </ThemedText>
              </View>
              {session.sets.map((set, index) => (
                <View
                  key={set.id}
                  style={[styles.tableRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.cell, styles.cellSet, { backgroundColor: theme.softRed }]}>
                    <ThemedText type="small" style={styles.cellText}>
                      {index + 1}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" style={[styles.cell, styles.cellText]}>
                    {set.weightUsed} Kg
                  </ThemedText>
                  <ThemedText type="small" style={[styles.cell, styles.cellText]}>
                    {set.repsCompleted}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        ))
      )}

      {sessions.length > 1 && (
        <Pressable onPress={() => setShowAll((prev) => !prev)}>
          <ThemedText type="linkPrimary" style={{ color: theme.primary }}>
            {showAll ? 'Mostra solo l’ultimo' : 'Mostra tutti i carichi'}
          </ThemedText>
        </Pressable>
      )}
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  summaryStat: {
    flex: 1,
    gap: 2,
  },
  summaryStatHighlight: {
    borderRadius: Radius.sm,
    padding: Spacing.two,
  },
  session: {
    gap: Spacing.one,
  },
  table: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  cellSet: {
    flex: 0.6,
  },
  cellText: {
    fontWeight: '600',
  },
});
