import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ExerciseThumbnail } from './exercise-thumbnail';
import { Pill } from './pill';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TECHNIQUE_LABEL } from '@/types/training';
import type { Exercise, WorkoutExercise } from '@/types/training';

// Riga/card di un esercizio dentro il Dettaglio allenamento. `completed`/
// `onToggleComplete` sono opzionali: passati solo dalla vista cliente (per il
// contatore "0/7" della sessione live), assenti lato coach, che quindi vede
// esattamente la stessa riga di sempre.
export function WorkoutExerciseRow({
  exercise,
  workoutExercise,
  onPress,
  compact = false,
  completed,
  onToggleComplete,
}: {
  exercise: Exercise;
  workoutExercise: WorkoutExercise;
  onPress?: () => void;
  compact?: boolean;
  completed?: boolean;
  onToggleComplete?: () => void;
}) {
  const theme = useTheme();
  const repsLabel =
    workoutExercise.repsMin && workoutExercise.repsMax
      ? `${workoutExercise.repsMin}–${workoutExercise.repsMax}`
      : String(workoutExercise.reps);

  const standaloneTechnique =
    workoutExercise.techniqueType && workoutExercise.techniqueType !== 'normal' && !workoutExercise.supersetGroupId
      ? workoutExercise.techniqueType
      : null;

  const content = (
    <View style={styles.row}>
      <ExerciseThumbnail exercise={exercise} size={compact ? 40 : 52} />
      <View style={styles.info}>
        <ThemedText type={compact ? 'small' : 'default'} style={styles.name}>
          {exercise.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {workoutExercise.sets} serie × {repsLabel} rip.
          {workoutExercise.targetWeight !== null ? ` · ${workoutExercise.targetWeight} kg` : ' · a corpo libero'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Recupero {workoutExercise.restSeconds}s
        </ThemedText>
        {standaloneTechnique && (
          <View style={styles.badgeRow}>
            <Pill label={TECHNIQUE_LABEL[standaloneTechnique]} tone="primary" />
          </View>
        )}
      </View>
      {onToggleComplete && (
        <Pressable onPress={onToggleComplete} hitSlop={8}>
          <View
            style={[
              styles.checkbox,
              {
                borderColor: completed ? theme.primary : theme.border,
                backgroundColor: completed ? theme.primary : 'transparent',
              },
            ]}>
            {completed && (
              <ThemedText type="smallBold" themeColor="onPrimary">
                ✓
              </ThemedText>
            )}
          </View>
        </Pressable>
      )}
    </View>
  );

  if (compact) {
    return (
      <Pressable onPress={onPress}>
        <View style={styles.compactWrapper}>{content}</View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress}>
      <Card>{content}</Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  compactWrapper: {
    paddingVertical: Spacing.two,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
