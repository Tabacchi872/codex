import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from './card';
import { ExerciseThumbnail } from './exercise-thumbnail';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Exercise, WorkoutExercise } from '@/types/training';

export function WorkoutExerciseEditor({
  exercise,
  value,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  exercise: Exercise;
  value: WorkoutExercise;
  onChange: (updated: WorkoutExercise) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { width } = useWindowDimensions();
  const stackFields = width < 390;
  const theme = useTheme();
  const [weightText, setWeightText] = useState(value.targetWeight !== null ? String(value.targetWeight) : '');

  function patch(update: Partial<WorkoutExercise>) {
    onChange({ ...value, ...update });
  }

  function handleWeightChange(text: string) {
    setWeightText(text);
    const parsed = Number(text.replace(',', '.'));
    patch({ targetWeight: text.trim() === '' ? null : Number.isNaN(parsed) ? value.targetWeight : parsed });
  }

  return (
    <Card style={styles.card}>
      <View style={[styles.header, stackFields && styles.headerStacked]}>
        <View style={styles.exerciseIdentity}>
          <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={56} />
          <View style={styles.identityCopy}>
            <ThemedText type="smallBold" style={styles.name} numberOfLines={2} ellipsizeMode="tail">
              {exercise.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Esercizio {Math.max(1, (value.order ?? 0) + 1)}
            </ThemedText>
          </View>
        </View>
        <View style={styles.orderButtons}>
          <OrderButton icon="up" label="Sposta su" onPress={onMoveUp} disabled={!canMoveUp} />
          <OrderButton icon="down" label="Sposta giù" onPress={onMoveDown} disabled={!canMoveDown} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rimuovi ${exercise.name}`}
            onPress={onRemove}
            hitSlop={6}
            style={({ pressed }) => [styles.removeButton, { borderColor: theme.statusExpired }, pressed && styles.pressed]}>
            <Trash2 size={17} color={theme.statusExpired} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.fieldsRow, stackFields && styles.fieldsColumn]}>
        <Field label="Serie">
          <ThemedTextInput keyboardType="number-pad" value={String(value.sets)} onChangeText={(t) => patch({ sets: Number(t) || 0 })} />
        </Field>
        <Field label="Ripetizioni">
          <ThemedTextInput keyboardType="number-pad" value={String(value.reps)} onChangeText={(t) => patch({ reps: Number(t) || 0 })} />
        </Field>
      </View>

      <View style={[styles.fieldsRow, stackFields && styles.fieldsColumn]}>
        <Field label="Peso target (kg)">
          <ThemedTextInput keyboardType="decimal-pad" value={weightText} onChangeText={handleWeightChange} placeholder="a corpo libero" />
        </Field>
        <Field label="Recupero (sec)">
          <ThemedTextInput
            keyboardType="number-pad"
            value={String(value.restSeconds)}
            onChangeText={(t) => patch({ restSeconds: Number(t) || 0 })}
          />
        </Field>
      </View>

      <Field label="Tempo (opzionale, es. 2-0-2)">
        <ThemedTextInput value={value.tempo ?? ''} onChangeText={(t) => patch({ tempo: t })} />
      </Field>

      <Field label="Note tecniche">
        <ThemedTextInput value={value.notes} onChangeText={(t) => patch({ notes: t })} multiline />
      </Field>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function OrderButton({ icon, label, onPress, disabled }: { icon: 'up' | 'down'; label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  const Icon = icon === 'up' ? ArrowUp : ArrowDown;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.orderButton,
        { backgroundColor: disabled ? theme.background : theme.backgroundSelected, borderColor: theme.border },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Icon size={17} color={disabled ? theme.disabled : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headerStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  exerciseIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minWidth: 0,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
  },
  orderButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  orderButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  removeButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    minWidth: 0,
    width: '100%',
  },
  fieldsColumn: {
    flexDirection: 'column',
  },
  field: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  fieldLabel: {
    flexShrink: 1,
  },
});
