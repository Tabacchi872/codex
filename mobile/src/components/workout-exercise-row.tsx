import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExerciseThumbnail } from './exercise-thumbnail';
import { Pill } from './pill';

import { AppCard } from '@/components/ui';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { TECHNIQUE_LABEL, type Exercise, type WorkoutExercise } from '@/types/training';

// Exercise row shared by client and coach workout details.  The visual card is
// never itself a button: the navigation area and the completion control are
// sibling Pressables, preventing nested <button> markup on web.
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
  const { colors } = useAppTheme();
  const repsLabel =
    workoutExercise.repsMin && workoutExercise.repsMax
      ? `${workoutExercise.repsMin}–${workoutExercise.repsMax}`
      : String(workoutExercise.reps);

  const standaloneTechnique =
    workoutExercise.techniqueType && workoutExercise.techniqueType !== 'normal' && !workoutExercise.supersetGroupId
      ? workoutExercise.techniqueType
      : null;

  const row = (
    <View style={[styles.shell, compact && styles.shellCompact]}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `Apri esercizio ${exercise.name}` : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [styles.mainAction, compact && styles.mainActionCompact, pressed && onPress ? styles.pressed : null]}>
        <View style={[styles.orderBadge, { borderColor: colors.moss, backgroundColor: completed ? colors.mossSoft : colors.surfaceSubtle }]}>
          <Text style={[styles.orderText, { color: completed ? colors.moss : colors.inkSoft }]}>
            {Math.max(1, (workoutExercise.order ?? 0) + 1)}
          </Text>
        </View>

        <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={compact ? 48 : 64} />

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
            {exercise.name}
          </Text>
          <Text style={[styles.details, { color: colors.inkSoft }]} numberOfLines={2}>
            {workoutExercise.sets} serie × {repsLabel} rip.
            {workoutExercise.targetWeight !== null ? ` · ${workoutExercise.targetWeight} kg` : ' · corpo libero'}
          </Text>
          <Text style={[styles.rest, { color: colors.inkFaint }]}>Recupero {workoutExercise.restSeconds}s</Text>
          {standaloneTechnique ? (
            <View style={styles.badgeRow}>
              <Pill label={TECHNIQUE_LABEL[standaloneTechnique]} tone="primary" />
            </View>
          ) : null}
        </View>
      </Pressable>

      {onToggleComplete ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: Boolean(completed) }}
          accessibilityLabel={`${completed ? 'Segna da fare' : 'Segna completato'}: ${exercise.name}`}
          onPress={onToggleComplete}
          hitSlop={8}
          style={({ pressed }) => [
            styles.checkbox,
            {
              borderColor: completed ? colors.moss : colors.inkFaint,
              backgroundColor: completed ? colors.moss : 'transparent',
              opacity: pressed ? 0.75 : 1,
            },
          ]}>
          {completed ? <Check size={17} color={colors.onMoss} strokeWidth={3} /> : null}
        </Pressable>
      ) : null}
    </View>
  );

  if (compact) return row;
  return <AppCard padded={false}>{row}</AppCard>;
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 92,
    paddingRight: AppSpacing[3],
  },
  shellCompact: {
    minHeight: 76,
    paddingRight: 0,
  },
  mainAction: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: AppSpacing[3],
    minWidth: 0,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[3],
  },
  mainActionCompact: {
    gap: AppSpacing[2],
    paddingHorizontal: 0,
    paddingVertical: AppSpacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
  orderBadge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  orderText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  info: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  details: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  rest: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 3,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
