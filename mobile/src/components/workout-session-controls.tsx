import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Controlli della sessione live lato cliente: "Inizia allenamento" salva
// `startedAt` (persistito, così il timer sopravvive a un refresh), poi mostra un
// timer che conta i secondi trascorsi; "Fine allenamento" calcola la durata
// reale e la passa al chiamante, che la salva e aggiorna sessionStatus/contatore.
// Se la scheda è già completata, mostra la durata registrata invece dei controlli.
export function WorkoutSessionControls({
  startedAt,
  isCompleted,
  savedDurationSeconds,
  onStart,
  onFinish,
}: {
  startedAt: string | null | undefined;
  isCompleted: boolean;
  savedDurationSeconds: number | undefined;
  onStart: () => void;
  onFinish: (durationSeconds: number) => void;
}) {
  const theme = useTheme();
  const [elapsed, setElapsed] = useState(() => (startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0));

  useEffect(() => {
    if (!startedAt) return undefined;
    const startMs = new Date(startedAt).getTime();
    setElapsed(Math.floor((Date.now() - startMs) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (isCompleted) {
    return (
      <Card style={styles.container}>
        <ThemedText type="smallBold">Allenamento completato</ThemedText>
        {savedDurationSeconds !== undefined && (
          <ThemedText type="small" themeColor="textSecondary">
            Durata: {formatDuration(savedDurationSeconds)}
          </ThemedText>
        )}
      </Card>
    );
  }

  if (!startedAt) {
    return (
      <Pressable onPress={onStart}>
        <View style={[styles.startButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            Inizia allenamento
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <Card style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Allenamento in corso</ThemedText>
        <ThemedText type="small" themeColor="statusActive">
          In corso
        </ThemedText>
      </View>
      <ThemedText type="title" style={styles.timer}>
        {formatDuration(elapsed)}
      </ThemedText>
      <Pressable onPress={() => onFinish(elapsed)}>
        <View style={[styles.finishButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            Fine allenamento
          </ThemedText>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  timer: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  startButton: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  finishButton: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});
