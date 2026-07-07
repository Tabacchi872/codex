import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Exercise, WorkoutExercise } from '@/types/training';

// Editor dei parametri di allenamento per UN esercizio dentro una scheda.
// Modifica solo WorkoutExercise: non tocca mai Exercise (regola architetturale,
// vedi docs/DECISIONS.md).
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
    <Card>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.name}>
          {exercise.name}
        </ThemedText>
        <View style={styles.orderButtons}>
          <OrderButton label="↑" onPress={onMoveUp} disabled={!canMoveUp} />
          <OrderButton label="↓" onPress={onMoveDown} disabled={!canMoveDown} />
          <Pressable onPress={onRemove} hitSlop={8}>
            <ThemedText type="small" themeColor="statusExpired">
              Rimuovi
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.fieldsRow}>
        <Field label="Serie">
          <ThemedTextInput
            keyboardType="number-pad"
            value={String(value.sets)}
            onChangeText={(t) => patch({ sets: Number(t) || 0 })}
          />
        </Field>
        <Field label="Ripetizioni">
          <ThemedTextInput
            keyboardType="number-pad"
            value={String(value.reps)}
            onChangeText={(t) => patch({ reps: Number(t) || 0 })}
          />
        </Field>
      </View>

      <View style={styles.fieldsRow}>
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
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function OrderButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => pressed && !disabled && styles.pressed} hitSlop={6}>
      <View style={[styles.orderButton, { backgroundColor: disabled ? theme.background : theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor={disabled ? 'disabled' : 'text'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    marginRight: Spacing.two,
  },
  orderButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  orderButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  field: {
    flex: 1,
    gap: 4,
  },
});
