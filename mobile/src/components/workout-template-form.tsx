import { useRouter } from 'expo-router';
import { FolderOpen } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from './card';
import { ExerciseCatalogPicker } from './exercise-catalog-picker';
import { AppButton } from './ui';
import { TemplateFolderPickerModal } from './template-folder-picker-modal';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { WorkoutExerciseEditor } from './workout-exercise-editor';
import { YMoveExercisePicker } from './ymove-exercise-picker';

import { Radius, Spacing } from '@/constants/theme';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { listCustomExercisesForCurrentCoach } from '@/lib/fitcoach-exercises-service';
import { supabaseConfig } from '@/lib/supabase';
import type { Exercise, WorkoutExercise } from '@/types/training';
import type { TemplateFolder, WorkoutTemplate } from '@/types/template-library';

function newTemplateExercise(exerciseId: string, order: number): WorkoutExercise {
  return {
    id: `te-${Date.now()}-${order}`,
    exerciseId,
    sets: 3,
    reps: 10,
    targetWeight: null,
    restSeconds: 60,
    notes: '',
    order,
  };
}

// Form della scheda modello: nome/descrizione/obiettivo/livello/cartella +
// esercizi (stessa logica di aggiunta/riordino/superserie di WorkoutPlanForm,
// riusata cosi' com'e' tramite WorkoutExerciseEditor/ExerciseCatalogPicker/
// YMoveExercisePicker). Nessun campo cliente, nessuna data: un modello non ha
// mai un destinatario ne' una data di validita' — quelle cose nascono SOLO al
// momento dell'assegnazione (vedi schede/modello/[templateId].tsx).
export function WorkoutTemplateForm({
  initialTemplate,
  initialFolderId,
  folders,
  onSave,
  saveLabel,
}: {
  initialTemplate?: WorkoutTemplate;
  initialFolderId: string | null;
  folders: TemplateFolder[];
  onSave: (input: {
    name: string;
    description: string;
    goal: string;
    level: string;
    folderId: string | null;
    exercises: WorkoutExercise[];
  }) => void;
  saveLabel: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [description, setDescription] = useState(initialTemplate?.description ?? '');
  const [goal, setGoal] = useState(initialTemplate?.goal ?? '');
  const [level, setLevel] = useState(initialTemplate?.level ?? '');
  const [folderId, setFolderId] = useState<string | null>(initialTemplate?.folderId ?? initialFolderId);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(
    initialTemplate?.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      targetWeight: e.targetWeight,
      restSeconds: e.restSeconds,
      notes: e.notes,
      order: e.order,
      techniqueType: e.techniqueType,
      supersetGroupId: e.supersetGroupId,
    })) ?? [],
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showYMovePicker, setShowYMovePicker] = useState(false);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolve: resolveExercise, registerExercise } = useExerciseResolver();

  const stackFieldPairs = width < 390;
  const catalogExercises = [...EXERCISE_LIBRARY, ...customExercises];
  const folderName = folderId ? (folders.find((f) => f.id === folderId)?.name ?? 'Cartella') : 'Senza categoria';

  useEffect(() => {
    if (!supabaseConfig.isConfigured) return;
    let cancelled = false;
    listCustomExercisesForCurrentCoach().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCatalogError(result.message);
        return;
      }
      setCatalogError(null);
      setCustomExercises(result.data);
      result.data.forEach(registerExercise);
    });
    return () => {
      cancelled = true;
    };
  }, [registerExercise]);

  function addExercise(exercise: Exercise, workoutExercise?: WorkoutExercise) {
    registerExercise(exercise);
    setExercises((prev) => [...prev, workoutExercise ? { ...workoutExercise, order: prev.length } : newTemplateExercise(exercise.id, prev.length)]);
    setShowPicker(false);
  }

  function handleCustomExerciseCreated(exercise: Exercise) {
    registerExercise(exercise);
    setCustomExercises((prev) => [exercise, ...prev.filter((item) => item.id !== exercise.id)]);
  }

  function handleYMoveExerciseAdded(exercise: Exercise) {
    registerExercise(exercise);
    setExercises((prev) => [...prev, newTemplateExercise(exercise.id, prev.length)]);
    setShowYMovePicker(false);
  }

  function updateExercise(updated: WorkoutExercise) {
    setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    setExercises((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((e, i) => ({ ...e, order: i }));
    });
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Inserisci un nome per la scheda modello.');
      return;
    }
    if (exercises.length === 0) {
      setError('Aggiungi almeno un esercizio.');
      return;
    }
    setError(null);
    onSave({ name: name.trim(), description: description.trim(), goal: goal.trim(), level: level.trim(), folderId, exercises });
  }

  return (
    <View style={styles.container}>
      <Card style={styles.detailsCard}>
        <ThemedText type="subtitle" style={styles.detailsTitle}>Dettagli scheda modello</ThemedText>
        <Field label="Nome scheda modello">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Es. Forza — Fase 2" />
        </Field>

        <Field label="Cartella">
          <Pressable onPress={() => setShowFolderPicker(true)} accessibilityRole="button" accessibilityLabel="Cambia cartella">
            <View style={[styles.folderField, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <FolderOpen size={18} color={theme.primary} />
              <ThemedText type="default" style={styles.folderFieldText} numberOfLines={1}>
                {folderName}
              </ThemedText>
            </View>
          </Pressable>
        </Field>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Obiettivo (opzionale)" style={styles.rowField}>
            <ThemedTextInput value={goal} onChangeText={setGoal} placeholder="Es. Dimagrimento" />
          </Field>
          <Field label="Livello (opzionale)" style={styles.rowField}>
            <ThemedTextInput value={level} onChangeText={setLevel} placeholder="Es. Intermedio" />
          </Field>
        </View>

        <Field label="Note/descrizione (opzionale)">
          <ThemedTextInput value={description} onChangeText={setDescription} placeholder="Indicazioni generali su questo modello" multiline />
        </Field>
      </Card>

      <ThemedText type="smallBold" style={styles.exercisesLabel}>
        Esercizi ({exercises.length})
      </ThemedText>

      {exercises.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun esercizio ancora aggiunto.
        </ThemedText>
      )}

      {exercises.map((we, index) => {
        const exercise = resolveExercise(we.exerciseId);
        if (!exercise) return null;
        return (
          <WorkoutExerciseEditor
            key={we.id}
            exercise={exercise}
            value={we}
            onChange={updateExercise}
            onRemove={() => removeExercise(we.id)}
            onMoveUp={() => moveExercise(index, -1)}
            onMoveDown={() => moveExercise(index, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < exercises.length - 1}
          />
        );
      })}

      {!showPicker && !showYMovePicker ? (
        <View style={[styles.addButtonsRow, stackFieldPairs && styles.addButtonsColumn]}>
          <View style={styles.addButtonFlex}>
            <AppButton label="+ Aggiungi esercizio" onPress={() => setShowPicker(true)} variant="outline" fullWidth />
          </View>
          {supabaseConfig.isConfigured ? (
            <View style={styles.addButtonFlex}>
              <AppButton label="Libreria YMove" onPress={() => setShowYMovePicker(true)} variant="outline" fullWidth />
            </View>
          ) : null}
        </View>
      ) : showYMovePicker ? (
        <YMoveExercisePicker onExerciseAdded={handleYMoveExerciseAdded} onClose={() => setShowYMovePicker(false)} />
      ) : (
        <>
          {catalogError ? (
            <ThemedText type="small" themeColor="statusExpired">
              {catalogError}
            </ThemedText>
          ) : null}
          <ExerciseCatalogPicker
            exercises={catalogExercises}
            existingExercises={exercises}
            onAdd={addExercise}
            onExerciseCreated={handleCustomExerciseCreated}
            onOpenDetails={(exerciseId) => router.push({ pathname: '/esercizi/[id]', params: { id: exerciseId } })}
            onClose={() => setShowPicker(false)}
          />
        </>
      )}

      {error && (
        <ThemedText type="small" themeColor="statusExpired">
          {error}
        </ThemedText>
      )}

      <AppButton label={saveLabel} onPress={handleSave} size="lg" fullWidth />

      <TemplateFolderPickerModal
        visible={showFolderPicker}
        folders={folders}
        selectedFolderId={folderId}
        onCancel={() => setShowFolderPicker(false)}
        onSelect={(next) => {
          setFolderId(next);
          setShowFolderPicker(false);
        }}
      />
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.field, style]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    width: '100%',
    minWidth: 0,
  },
  detailsCard: {
    gap: Spacing.three,
    width: '100%',
    minWidth: 0,
  },
  detailsTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  field: {
    gap: 4,
    width: '100%',
    minWidth: 0,
  },
  fieldLabel: {
    flexShrink: 1,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    width: '100%',
    minWidth: 0,
  },
  fieldsColumn: {
    flexDirection: 'column',
  },
  rowField: {
    flex: 1,
    minWidth: 0,
  },
  folderField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    minWidth: 0,
  },
  folderFieldText: {
    flex: 1,
    minWidth: 0,
  },
  exercisesLabel: {
    marginTop: Spacing.two,
  },
  addButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
    minWidth: 0,
  },
  addButtonsColumn: {
    flexDirection: 'column',
  },
  addButtonFlex: {
    flex: 1,
    minWidth: 0,
  },
});
