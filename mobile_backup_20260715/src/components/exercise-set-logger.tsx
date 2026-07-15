import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrainingStore } from '@/store/training-store';
import type { ExerciseProgressHistory } from '@/types/training';

function formatRest(restSeconds: number) {
  if (restSeconds <= 0) return 'Rec. —';
  if (restSeconds < 60) return `Rec. ${restSeconds}s`;
  const minutes = Math.round(restSeconds / 60);
  return `Rec. ${minutes}m`;
}

type SetRow = { weight: string; reps: string };

// Sezione "Serie": una riga precompilata per ogni serie prevista dal coach
// (workoutExercise.sets), non un singolo campo libero — così il cliente registra
// esattamente le serie assegnate, con la possibilità di aggiungerne altre
// (es. serie extra fatte davvero) tramite "Serie +". Il bottone "Rec." avvia il
// RestTimer già presente nella schermata invece di duplicarne la logica.
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
  const addProgressEntry = useTrainingStore((s) => s.addProgressEntry);
  const [rows, setRows] = useState<SetRow[]>(() => Array.from({ length: Math.max(plannedSets, 1) }, () => ({ weight: '', reps: '' })));
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  function updateRow(index: number, field: keyof SetRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setSaved(false);
  }

  function addRow() {
    setRows((prev) => [...prev, { weight: '', reps: '' }]);
  }

  function handleSave() {
    const now = Date.now();
    let saveIndex = 0;
    rows.forEach((row) => {
      const weightNum = Number(row.weight.replace(',', '.'));
      const repsNum = Number(row.reps);
      if (!row.weight || !row.reps || Number.isNaN(weightNum) || Number.isNaN(repsNum) || weightNum <= 0 || repsNum <= 0) {
        return;
      }
      const entry: ExerciseProgressHistory = {
        id: `hist-set-${now}-${saveIndex}`,
        clientId,
        exerciseId,
        workoutPlanId,
        date: new Date().toISOString().slice(0, 10),
        setsCompleted: 1,
        repsCompleted: repsNum,
        weightUsed: weightNum,
        restUsed: restSeconds,
        notes,
        createdAt: new Date(now + saveIndex).toISOString(),
      };
      addProgressEntry(entry);
      saveIndex += 1;
    });
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
          <View style={styles.setInputsRow}>
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
        }}
        multiline
        style={styles.notesInput}
      />

      <Pressable onPress={handleSave}>
        <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            {saved ? 'Serie salvate ✓' : 'Salva serie'}
          </ThemedText>
        </View>
      </Pressable>
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
  // Etichetta "Serie N" sulla sua riga, Peso/Ripetizioni sotto: garantisce che i
  // due input abbiano sempre metà larghezza disponibile a testa, senza dipendere
  // dallo shrink dei flex item (che su web richiederebbe minWidth:0 e comunque
  // resta fragile sotto i 360px) — più robusto che tagliare un input.
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
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});
