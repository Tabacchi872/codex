import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { AppButton } from './ui';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createExerciseProgressEntries, listClientExerciseProgress, type ExerciseProgressEntryInput } from '@/lib/exercise-progress-service';
import { useTrainingStore } from '@/store/training-store';

function formatRest(restSeconds: number) {
  if (restSeconds <= 0) return 'Rec. -';
  if (restSeconds < 60) return `Rec. ${restSeconds}s`;
  const minutes = Math.round(restSeconds / 60);
  return `Rec. ${minutes}m`;
}

type SetRow = { weight: string; reps: string };

export function ExerciseSetLogger({
  clientId,
  exerciseId,
  workoutPlanId,
  plannedSets,
  restSeconds,
  onRequestRest,
}: {
  clientId: string;
  exerciseId: string;
  workoutPlanId: string;
  plannedSets: number;
  restSeconds: number;
  onRequestRest: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 350;
  const addProgressEntry = useTrainingStore((s) => s.addProgressEntry);
  const replaceClientProgressHistory = useTrainingStore((s) => s.replaceClientProgressHistory);
  const [rows, setRows] = useState<SetRow[]>(() => Array.from({ length: Math.max(plannedSets, 1) }, () => ({ weight: '', reps: '' })));
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof SetRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setSaved(false);
    setError(null);
  }

  function addRow() {
    setRows((prev) => [...prev, { weight: '', reps: '' }]);
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    if (saving || saved) return;

    const nowIso = new Date().toISOString();
    const entries: ExerciseProgressEntryInput[] = [];
    rows.forEach((row, index) => {
      const weightNum = Number(row.weight.replace(',', '.'));
      const repsNum = Number(row.reps);
      if (!row.weight || !row.reps || Number.isNaN(weightNum) || Number.isNaN(repsNum) || weightNum <= 0 || repsNum <= 0) {
        return;
      }
      entries.push({
        clientId,
        exerciseId,
        workoutPlanId,
        performedAt: nowIso,
        sessionDate: nowIso.slice(0, 10),
        setNumber: index + 1,
        repsCompleted: repsNum,
        weightKg: weightNum,
        restSeconds,
        notes,
      });
    });

    if (entries.length === 0) {
      setError('Inserisci almeno una serie valida.');
      return;
    }

    setSaving(true);
    setError(null);
    const result = await createExerciseProgressEntries(entries);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    const refreshed = await listClientExerciseProgress(clientId);
    if (refreshed.ok) {
      replaceClientProgressHistory(clientId, refreshed.data);
    } else {
      result.data.forEach(addProgressEntry);
    }
    setSaved(true);
  }

  return (
    <Card style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Serie</ThemedText>
        <Pressable onPress={onRequestRest}>
          <View style={[styles.restPill, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="primary">
              {formatRest(restSeconds)}
            </ThemedText>
          </View>
        </Pressable>
      </View>

      {rows.map((row, index) => (
        <View key={index} style={styles.setRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.setLabel}>
            Serie {index + 1}
          </ThemedText>
          <View style={[styles.setInputsRow, compact && styles.setInputsStack]}>
            <ThemedTextInput
              style={styles.setInput}
              placeholder="Peso (kg)"
              keyboardType="decimal-pad"
              value={row.weight}
              onChangeText={(v) => updateRow(index, 'weight', v)}
            />
            <ThemedTextInput
              style={styles.setInput}
              placeholder="Ripetizioni"
              keyboardType="number-pad"
              value={row.reps}
              onChangeText={(v) => updateRow(index, 'reps', v)}
            />
          </View>
        </View>
      ))}

      <Pressable onPress={addRow}>
        <ThemedText type="linkPrimary" style={{ color: theme.primary }}>
          + Serie
        </ThemedText>
      </Pressable>

      <ThemedTextInput
        placeholder="Note sull'esercizio"
        value={notes}
        onChangeText={(v) => {
          setNotes(v);
          setSaved(false);
          setError(null);
        }}
        multiline
        style={styles.notesInput}
      />

      {error ? (
        <ThemedText type="small" style={{ color: theme.statusExpired }}>
          {error}
        </ThemedText>
      ) : null}

      <AppButton label={saved ? 'Serie salvate' : 'Salva serie'} onPress={handleSave} loading={saving} disabled={saved} fullWidth />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: '100%',
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  restPill: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  setRow: {
    gap: 4,
  },
  setLabel: {
    marginBottom: 2,
  },
  setInputsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  setInput: {
    flex: 1,
    minWidth: 0,
  },
  setInputsStack: {
    flexDirection: 'column',
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
