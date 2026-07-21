import { useRouter } from 'expo-router';
import { FolderOpen, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from './card';
import { ExerciseCatalogPicker } from './exercise-catalog-picker';
import { AppButton, AppIconButton } from './ui';
import { TemplateFolderPickerModal } from './template-folder-picker-modal';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { WorkoutExerciseEditor } from './workout-exercise-editor';
import { YMoveExercisePicker } from './ymove-exercise-picker';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { listCustomExercisesForCurrentCoach } from '@/lib/fitcoach-exercises-service';
import { supabaseConfig } from '@/lib/supabase';
import type { Exercise, WorkoutExercise } from '@/types/training';
import type { TemplateFolder, WorkoutTemplate } from '@/types/template-library';
import type { WorkoutTemplateSaveInput } from '@/lib/workout-plan-service';

// Un esercizio del giorno, nello stato del form: stesso identico shape di
// WorkoutExercise (riusato as-is da WorkoutExerciseEditor, componente
// condiviso anche dall'editor delle schede REALI, mai modificato qui) con in
// piu' rpeRir — campo esclusivo dei modelli, mostrato in un piccolo input
// accanto, MAI dentro WorkoutExerciseEditor stesso.
type TemplateExerciseFormState = WorkoutExercise & { rpeRir?: string };

type TemplateDayFormState = {
  id?: string;
  key: string;
  name: string;
  focus: string;
  estimatedDurationMinutes: string;
  exercises: TemplateExerciseFormState[];
};

const DAY_LETTERS = 'ABCDEFGHIJ';

function newExercise(exerciseId: string, order: number): TemplateExerciseFormState {
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

function newDay(index: number): TemplateDayFormState {
  return {
    key: `day-${Date.now()}-${index}`,
    name: `Workout ${DAY_LETTERS[index] ?? index + 1}`,
    focus: '',
    estimatedDurationMinutes: '',
    exercises: [],
  };
}

// Form della scheda modello: metadati professionali + uno o piu' giorni
// (Workout A/B/C...), ciascuno con i propri esercizi. Nessun campo cliente,
// nessuna data: un modello non ha mai un destinatario ne' una data di
// validita' — quelle cose nascono SOLO al momento dell'assegnazione (vedi
// schede/modello/[templateId].tsx). Mai usato per un modello di sistema
// (is_system): la schermata che lo monta lo esclude a monte.
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
  onSave: (input: Omit<WorkoutTemplateSaveInput, 'id'>) => void;
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

  const [durationWeeks, setDurationWeeks] = useState(initialTemplate?.durationWeeks ? String(initialTemplate.durationWeeks) : '');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(initialTemplate?.sessionsPerWeek ? String(initialTemplate.sessionsPerWeek) : '');
  const [estimatedSessionMinutes, setEstimatedSessionMinutes] = useState(
    initialTemplate?.estimatedSessionMinutes ? String(initialTemplate.estimatedSessionMinutes) : '',
  );
  const [equipment, setEquipment] = useState(initialTemplate?.equipment ?? '');
  const [location, setLocation] = useState(initialTemplate?.location ?? '');
  const [trainingStyle, setTrainingStyle] = useState(initialTemplate?.trainingStyle ?? '');
  const [muscleFocus, setMuscleFocus] = useState(initialTemplate?.muscleFocus ?? '');
  const [intensity, setIntensity] = useState(initialTemplate?.intensity ?? '');
  const [progressionNotes, setProgressionNotes] = useState(initialTemplate?.progressionNotes ?? '');
  const [deloadWeek, setDeloadWeek] = useState(initialTemplate?.deloadWeek ?? false);

  const [days, setDays] = useState<TemplateDayFormState[]>(
    initialTemplate && initialTemplate.days.length > 0
      ? initialTemplate.days.map((d) => ({
          id: d.id,
          key: d.id,
          name: d.name,
          focus: d.focus ?? '',
          estimatedDurationMinutes: d.estimatedDurationMinutes ? String(d.estimatedDurationMinutes) : '',
          exercises: d.exercises.map((e) => ({
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
            rpeRir: e.rpeRir,
          })),
        }))
      : [newDay(0)],
  );

  const [pickerForDay, setPickerForDay] = useState<string | null>(null);
  const [ymovePickerForDay, setYmovePickerForDay] = useState<string | null>(null);
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

  function updateDay(key: string, patch: Partial<TemplateDayFormState>) {
    setDays((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addDay() {
    setDays((prev) => [...prev, newDay(prev.length)]);
  }

  function removeDay(key: string) {
    setDays((prev) => prev.filter((d) => d.key !== key));
  }

  function addExerciseToDay(dayKey: string, exercise: Exercise, workoutExercise?: WorkoutExercise) {
    registerExercise(exercise);
    setDays((prev) =>
      prev.map((d) =>
        d.key === dayKey
          ? { ...d, exercises: [...d.exercises, workoutExercise ? { ...workoutExercise, order: d.exercises.length } : newExercise(exercise.id, d.exercises.length)] }
          : d,
      ),
    );
    setPickerForDay(null);
  }

  function handleCustomExerciseCreated(exercise: Exercise) {
    registerExercise(exercise);
    setCustomExercises((prev) => [exercise, ...prev.filter((item) => item.id !== exercise.id)]);
  }

  function handleYMoveExerciseAdded(dayKey: string, exercise: Exercise) {
    registerExercise(exercise);
    setDays((prev) => prev.map((d) => (d.key === dayKey ? { ...d, exercises: [...d.exercises, newExercise(exercise.id, d.exercises.length)] } : d)));
    setYmovePickerForDay(null);
  }

  function updateExercise(dayKey: string, updated: TemplateExerciseFormState) {
    setDays((prev) => prev.map((d) => (d.key === dayKey ? { ...d, exercises: d.exercises.map((e) => (e.id === updated.id ? updated : e)) } : d)));
  }

  function removeExercise(dayKey: string, id: string) {
    setDays((prev) =>
      prev.map((d) =>
        d.key === dayKey ? { ...d, exercises: d.exercises.filter((e) => e.id !== id).map((e, i) => ({ ...e, order: i })) } : d,
      ),
    );
  }

  function moveExercise(dayKey: string, index: number, direction: -1 | 1) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.key !== dayKey) return d;
        const next = [...d.exercises];
        const target = index + direction;
        if (target < 0 || target >= next.length) return d;
        [next[index], next[target]] = [next[target], next[index]];
        return { ...d, exercises: next.map((e, i) => ({ ...e, order: i })) };
      }),
    );
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Inserisci un nome per la scheda modello.');
      return;
    }
    if (days.length === 0) {
      setError('Aggiungi almeno un giorno (es. Workout A).');
      return;
    }
    if (days.some((d) => !d.name.trim())) {
      setError('Ogni giorno deve avere un nome (es. Workout A, Spinta, Giorno 1).');
      return;
    }
    if (days.every((d) => d.exercises.length === 0)) {
      setError('Aggiungi almeno un esercizio in almeno un giorno.');
      return;
    }
    setError(null);
    onSave({
      folderId,
      name: name.trim(),
      description: description.trim(),
      goal: goal.trim(),
      level: level.trim(),
      durationWeeks: durationWeeks.trim() ? Number(durationWeeks) : undefined,
      sessionsPerWeek: sessionsPerWeek.trim() ? Number(sessionsPerWeek) : undefined,
      estimatedSessionMinutes: estimatedSessionMinutes.trim() ? Number(estimatedSessionMinutes) : undefined,
      equipment: equipment.trim(),
      location: location.trim(),
      trainingStyle: trainingStyle.trim(),
      muscleFocus: muscleFocus.trim(),
      intensity: intensity.trim(),
      progressionNotes: progressionNotes.trim(),
      deloadWeek,
      days: days.map((d, dayIndex) => ({
        id: d.id,
        name: d.name.trim(),
        focus: d.focus.trim(),
        sortOrder: dayIndex,
        estimatedDurationMinutes: d.estimatedDurationMinutes.trim() ? Number(d.estimatedDurationMinutes) : undefined,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          order: e.order,
          sets: e.sets,
          reps: e.reps,
          repsMin: e.repsMin,
          repsMax: e.repsMax,
          targetWeight: e.targetWeight,
          restSeconds: e.restSeconds,
          notes: e.notes,
          rpeRir: e.rpeRir,
          techniqueType: e.techniqueType,
          supersetGroupId: e.supersetGroupId,
        })),
      })),
    });
  }

  return (
    <View style={styles.container}>
      <Card style={styles.detailsCard}>
        <ThemedText type="subtitle" style={styles.detailsTitle}>Dettagli scheda modello</ThemedText>
        <Field label="Nome scheda modello">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Es. Push Pull Legs" />
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
          <Field label="Obiettivo" style={styles.rowField}>
            <ThemedTextInput value={goal} onChangeText={setGoal} placeholder="Es. Dimagrimento" />
          </Field>
          <Field label="Livello" style={styles.rowField}>
            <ThemedTextInput value={level} onChangeText={setLevel} placeholder="Es. Intermedio" />
          </Field>
        </View>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Durata (settimane)" style={styles.rowField}>
            <ThemedTextInput value={durationWeeks} onChangeText={setDurationWeeks} placeholder="8" keyboardType="number-pad" />
          </Field>
          <Field label="Sedute/settimana" style={styles.rowField}>
            <ThemedTextInput value={sessionsPerWeek} onChangeText={setSessionsPerWeek} placeholder="4" keyboardType="number-pad" />
          </Field>
          <Field label="Minuti/seduta" style={styles.rowField}>
            <ThemedTextInput value={estimatedSessionMinutes} onChangeText={setEstimatedSessionMinutes} placeholder="60" keyboardType="number-pad" />
          </Field>
        </View>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Attrezzatura" style={styles.rowField}>
            <ThemedTextInput value={equipment} onChangeText={setEquipment} placeholder="Es. Palestra completa" />
          </Field>
          <Field label="Luogo" style={styles.rowField}>
            <ThemedTextInput value={location} onChangeText={setLocation} placeholder="Es. Palestra, Casa" />
          </Field>
        </View>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Stile" style={styles.rowField}>
            <ThemedTextInput value={trainingStyle} onChangeText={setTrainingStyle} placeholder="Es. Push Pull Legs" />
          </Field>
          <Field label="Focus muscolare" style={styles.rowField}>
            <ThemedTextInput value={muscleFocus} onChangeText={setMuscleFocus} placeholder="Es. Full body" />
          </Field>
          <Field label="Intensita'" style={styles.rowField}>
            <ThemedTextInput value={intensity} onChangeText={setIntensity} placeholder="Es. Moderata" />
          </Field>
        </View>

        <Field label="Note di progressione (opzionale)">
          <ThemedTextInput value={progressionNotes} onChangeText={setProgressionNotes} placeholder="Come far progredire il cliente nelle settimane" multiline />
        </Field>

        <Field label="Note/descrizione (opzionale)">
          <ThemedTextInput value={description} onChangeText={setDescription} placeholder="Indicazioni generali su questo modello" multiline />
        </Field>

        <View style={styles.deloadRow}>
          <ThemedText type="small" themeColor="textSecondary">Prevede una settimana di scarico</ThemedText>
          <Switch value={deloadWeek} onValueChange={setDeloadWeek} trackColor={{ true: theme.primary }} />
        </View>
      </Card>

      {days.map((day, dayIndex) => (
        <Card key={day.key} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <View style={styles.dayHeaderField}>
              <ThemedTextInput value={day.name} onChangeText={(v) => updateDay(day.key, { name: v })} placeholder="Es. Workout A" />
            </View>
            {days.length > 1 ? (
              <AppIconButton
                icon={<Trash2 size={16} color={theme.statusExpired} />}
                onPress={() => removeDay(day.key)}
                accessibilityLabel={`Rimuovi ${day.name || 'giorno'}`}
                size={38}
              />
            ) : null}
          </View>
          <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
            <Field label="Focus (opzionale)" style={styles.rowField}>
              <ThemedTextInput value={day.focus} onChangeText={(v) => updateDay(day.key, { focus: v })} placeholder="Es. Petto/Tricipiti" />
            </Field>
            <Field label="Durata stimata (min)" style={styles.rowField}>
              <ThemedTextInput
                value={day.estimatedDurationMinutes}
                onChangeText={(v) => updateDay(day.key, { estimatedDurationMinutes: v })}
                placeholder="60"
                keyboardType="number-pad"
              />
            </Field>
          </View>

          <ThemedText type="smallBold" style={styles.exercisesLabel}>
            Esercizi ({day.exercises.length})
          </ThemedText>

          {day.exercises.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nessun esercizio ancora aggiunto in questo giorno.
            </ThemedText>
          )}

          {day.exercises.map((we, index) => {
            const exercise = resolveExercise(we.exerciseId);
            if (!exercise) return null;
            return (
              <View key={we.id} style={styles.exerciseBlock}>
                <WorkoutExerciseEditor
                  exercise={exercise}
                  value={we}
                  onChange={(updated) => updateExercise(day.key, { ...we, ...updated })}
                  onRemove={() => removeExercise(day.key, we.id)}
                  onMoveUp={() => moveExercise(day.key, index, -1)}
                  onMoveDown={() => moveExercise(day.key, index, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < day.exercises.length - 1}
                />
                <Field label="RPE/RIR (opzionale)">
                  <ThemedTextInput
                    value={we.rpeRir ?? ''}
                    onChangeText={(v) => updateExercise(day.key, { ...we, rpeRir: v })}
                    placeholder="Es. RPE 8 oppure RIR 2"
                  />
                </Field>
              </View>
            );
          })}

          {pickerForDay !== day.key && ymovePickerForDay !== day.key ? (
            <View style={[styles.addButtonsRow, stackFieldPairs && styles.addButtonsColumn]}>
              <View style={styles.addButtonFlex}>
                <AppButton label="+ Aggiungi esercizio" onPress={() => setPickerForDay(day.key)} variant="outline" fullWidth />
              </View>
              {supabaseConfig.isConfigured ? (
                <View style={styles.addButtonFlex}>
                  <AppButton label="Libreria YMove" onPress={() => setYmovePickerForDay(day.key)} variant="outline" fullWidth />
                </View>
              ) : null}
            </View>
          ) : ymovePickerForDay === day.key ? (
            <YMoveExercisePicker onExerciseAdded={(exercise) => handleYMoveExerciseAdded(day.key, exercise)} onClose={() => setYmovePickerForDay(null)} />
          ) : (
            <>
              {catalogError ? (
                <ThemedText type="small" themeColor="statusExpired">
                  {catalogError}
                </ThemedText>
              ) : null}
              <ExerciseCatalogPicker
                exercises={catalogExercises}
                existingExercises={day.exercises}
                onAdd={(exercise, workoutExercise) => addExerciseToDay(day.key, exercise, workoutExercise)}
                onExerciseCreated={handleCustomExerciseCreated}
                onOpenDetails={(exerciseId) => router.push({ pathname: '/esercizi/[id]', params: { id: exerciseId } })}
                onClose={() => setPickerForDay(null)}
              />
            </>
          )}
        </Card>
      ))}

      <AppButton label="+ Nuovo giorno (Workout)" onPress={addDay} variant="outline" fullWidth icon={<Plus size={16} color={theme.primary} />} />

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
  deloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dayCard: {
    gap: Spacing.three,
    width: '100%',
    minWidth: 0,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minWidth: 0,
  },
  dayHeaderField: {
    flex: 1,
    minWidth: 0,
  },
  exerciseBlock: {
    gap: 6,
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
