import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from './card';
import { AppButton } from './ui';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { WorkoutExerciseEditor } from './workout-exercise-editor';
import { ExerciseCatalogPicker } from './exercise-catalog-picker';
import { YMoveExercisePicker } from './ymove-exercise-picker';

import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { listCustomExercisesForCurrentCoach } from '@/lib/fitcoach-exercises-service';
import { supabaseConfig } from '@/lib/supabase';
import { useClientStore } from '@/store/client-store';
import type { Exercise, WorkoutExercise, WorkoutPlan } from '@/types/training';

function newWorkoutExercise(exerciseId: string, order: number): WorkoutExercise {
  return {
    id: `we-${Date.now()}-${order}`,
    exerciseId,
    sets: 3,
    reps: 10,
    targetWeight: null,
    restSeconds: 60,
    notes: '',
    order,
  };
}

export function WorkoutPlanForm({
  initialPlan,
  initialClientId,
  onSave,
  saveLabel,
}: {
  initialPlan?: WorkoutPlan;
  initialClientId?: string;
  onSave: (plan: WorkoutPlan) => void;
  saveLabel: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const clients = useClientStore((s) => s.clients);
  const [name, setName] = useState(initialPlan?.name ?? '');
  const [clientId, setClientId] = useState(initialPlan?.clientId ?? initialClientId ?? clients[0]?.id ?? '');
  const [startDate, setStartDate] = useState(initialPlan?.startDate ?? new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(initialPlan?.expiryDate ?? '');
  const [scheduledTime, setScheduledTime] = useState(initialPlan?.scheduledTime ?? '');
  const [dayLabel, setDayLabel] = useState(initialPlan?.dayLabel ?? '');
  const [weekLabel, setWeekLabel] = useState(initialPlan?.weekLabel ?? '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(initialPlan?.exercises ?? []);
  const [showPicker, setShowPicker] = useState(false);
  const [showYMovePicker, setShowYMovePicker] = useState(false);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolve: resolveExercise, registerExercise } = useExerciseResolver();

  const stackFieldPairs = width < 390;
  const catalogExercises = [...EXERCISE_LIBRARY, ...customExercises];

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
    setExercises((prev) => [...prev, workoutExercise ? { ...workoutExercise, order: prev.length } : newWorkoutExercise(exercise.id, prev.length)]);
    setShowPicker(false);
  }

  function handleCustomExerciseCreated(exercise: Exercise) {
    registerExercise(exercise);
    setCustomExercises((prev) => [exercise, ...prev.filter((item) => item.id !== exercise.id)]);
  }

  // Esercizio creato/riusato dalla Libreria YMove (mobile/src/components/
  // ymove-exercise-picker.tsx): registrato subito nel resolver cosi' il
  // render qui sotto lo trova immediatamente, senza aspettare il fetch di
  // fallback che use-exercise-resolver.ts farebbe altrimenti.
  function handleYMoveExerciseAdded(exercise: Exercise) {
    registerExercise(exercise);
    setExercises((prev) => [...prev, newWorkoutExercise(exercise.id, prev.length)]);
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
      setError('Inserisci un nome per la scheda.');
      return;
    }
    if (!expiryDate.trim()) {
      setError('Inserisci una data di scadenza (formato AAAA-MM-GG).');
      return;
    }
    if (scheduledTime.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime.trim())) {
      setError('Inserisci un orario valido (formato HH:mm, es. 17:30).');
      return;
    }
    if (exercises.length === 0) {
      setError('Aggiungi almeno un esercizio.');
      return;
    }
    setError(null);
    // Id placeholder SOLO se non esiste gia' un piano reale: quando Supabase
    // e' configurato, workout-plan-service.ts (isValidUuid) riconosce che non
    // e' un UUID e lo tratta come "nuova scheda", lasciando che sia Postgres
    // a generare l'id reale (mai un ID inventato lato client che poi
    // verrebbe ignorato).
    onSave({
      id: initialPlan?.id ?? `plan-${Date.now()}`,
      name: name.trim(),
      clientId,
      coachId: initialPlan?.coachId ?? DEFAULT_COACH_ID,
      startDate,
      expiryDate: expiryDate.trim(),
      scheduledTime: scheduledTime.trim() || undefined,
      dayLabel: dayLabel.trim() || undefined,
      weekLabel: weekLabel.trim() || undefined,
      subscriptionId: undefined,
      exercises,
      sessionStatus: initialPlan?.sessionStatus,
      startedAt: initialPlan?.startedAt,
      completedExerciseIds: initialPlan?.completedExerciseIds,
      durationSeconds: initialPlan?.durationSeconds,
      completedAt: initialPlan?.completedAt,
    });
  }

  return (
    <View style={styles.container}>
      <Card style={styles.detailsCard}>
        <ThemedText type="subtitle" style={styles.detailsTitle}>Dettagli scheda</ThemedText>
        <Field label="Nome scheda">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Es. Forza — Fase 2" />
        </Field>

        <Field label="Cliente">
          <View style={styles.chipsRow}>
            {clients.map((client) => {
              const active = client.id === clientId;
              return (
                <Pressable key={client.id} onPress={() => setClientId(client.id)}>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                    ]}>
                    <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                      {clientFullName(client)}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Data allenamento (AAAA-MM-GG)" style={styles.rowField}>
            <ThemedTextInput value={startDate} onChangeText={setStartDate} placeholder="2026-07-05" />
          </Field>
          <Field label="Ora (HH:mm, opzionale)" style={styles.rowField}>
            <ThemedTextInput value={scheduledTime} onChangeText={setScheduledTime} placeholder="17:30" />
          </Field>
        </View>

        <Field label="Scadenza scheda (AAAA-MM-GG)">
          <ThemedTextInput value={expiryDate} onChangeText={setExpiryDate} placeholder="2026-08-05" />
        </Field>

        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
          <Field label="Giorno (opzionale, es. Giorno 3)" style={styles.rowField}>
            <ThemedTextInput value={dayLabel} onChangeText={setDayLabel} placeholder="Derivato automaticamente" />
          </Field>
          <Field label="Settimana (opzionale, es. Settimana 4)" style={styles.rowField}>
            <ThemedTextInput value={weekLabel} onChangeText={setWeekLabel} placeholder="Derivata automaticamente" />
          </Field>
        </View>
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
            onOpenDetails={(exerciseId) =>
              initialPlan?.id
                ? router.push({ pathname: '/esercizi/[id]', params: { id: exerciseId, planId: initialPlan.id } })
                : router.push({ pathname: '/esercizi/[id]', params: { id: exerciseId } })
            }
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    minWidth: 0,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    maxWidth: '100%',
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
  pickerContainer: {
    gap: Spacing.three,
    minWidth: 0,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    minWidth: 0,
  },
  pickerGroup: {
    gap: Spacing.one,
  },
});
