import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useExerciseProgressHistory } from '@/hooks/use-exercise-progress-history';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth } from '@/lib/format-date';

// Riepilogo compatto (mai la lista completa delle serie qui): "Ultimo
// carico"/"Miglior carico" e la data dell'ultima registrazione, con l'intera
// card cliccabile per aprire lo storico completo su /storico-carichi. "Miglior
// carico" e' il massimo storico su TUTTE le registrazioni di questo esercizio
// per questo cliente — mai limitato a una finestra "recente" ne' a un
// workoutPlanId: lo storico deve includere anche schede passate/future con lo
// stesso esercizio (chiave: clientId + exerciseId, mai workoutPlanId).
export function ExerciseHistory({
  clientId,
  exerciseId,
  exerciseName,
}: {
  clientId: string;
  exerciseId: string;
  exerciseName: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { entries: progressHistory } = useExerciseProgressHistory(clientId);

  const sortedEntries = useMemo(
    () =>
      progressHistory
        .filter((h) => h.clientId === clientId && h.exerciseId === exerciseId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [progressHistory, clientId, exerciseId]
  );
  const lastEntry = sortedEntries[0] ?? null;
  const bestWeight = sortedEntries.length > 0 ? Math.max(...sortedEntries.map((entry) => entry.weightUsed)) : null;

  function openFullHistory() {
    router.push({ pathname: '/storico-carichi', params: { clientId, exerciseId, exerciseName } });
  }

  return (
    <Pressable
      onPress={openFullHistory}
      accessibilityRole="button"
      accessibilityLabel={`Vedi lo storico completo di ${exerciseName}`}>
      {({ pressed }) => (
        <Card style={[styles.container, pressed && styles.pressed]}>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold">Storico carichi</ThemedText>
            <View style={styles.linkRow}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Vedi storico completo
              </ThemedText>
              <ChevronRight size={16} color={theme.primary} />
            </View>
          </View>

          {sortedEntries.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nessun carico registrato.
            </ThemedText>
          ) : (
            <View style={styles.statsRow}>
              <Stat label="Ultimo carico" value={lastEntry ? formatKg(lastEntry.weightUsed) : '—'} />
              <Stat label="Miglior carico" value={bestWeight !== null ? formatKg(bestWeight) : '—'} highlighted />
              <Stat label="Ultima registrazione" value={lastEntry ? formatDayMonth(lastEntry.date) : '—'} />
            </View>
          )}
        </Card>
      )}
    </Pressable>
  );
}

function Stat({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={highlighted ? { color: theme.primary } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')} kg`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.82,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  stat: {
    gap: 2,
    minWidth: 96,
  },
});
