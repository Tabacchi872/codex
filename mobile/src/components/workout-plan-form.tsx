import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { WorkoutExerciseEditor } from './workout-exercise-editor';
import { YMoveExercisePicker } from './ymove-exercise-picker';

import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, exercisesByMuscleGroup } from '@/data/exercise-library';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { supabaseConfig } from '@/lib/supabase';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { SUBSCRIPTION_STATUS_LABEL } from '@/types/subscription';
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
  const clients = useClientStore((s) => s.clients);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const [name, setName] = useState(initialPlan?.name ?? '');
  const [clientId, setClientId] = useState(initialPlan?.clientId ?? initialClientId ?? clients[0]?.id ?? '');
  const [startDate, setStartDate] = useState(initialPlan?.startDate ?? new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(initialPlan?.expiryDate ?? '');
  const [scheduledTime, setScheduledTime] = useState(initialPlan?.scheduledTime ?? '');
  const [dayLabel, setDayLabel] = useState(initialPlan?.dayLabel ?? '');
  const [weekLabel, setWeekLabel] = useState(initialPlan?.weekLabel ?? '');
  const [subscriptionId, setSubscriptionId] = useState(initialPlan?.subscriptionId ?? '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(initialPlan?.exercises ?? []);
  const [showPicker, setShowPicker] = useState(false);
  const [showYMovePicker, setShowYMovePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolve: resolveExercise, registerExercise } = useExerciseResolver();

  const clientSubscriptions = subscriptions.filter((s) => s.clientId === clientId);

  function addExercise(exerciseId: string) {
    setExercises((prev) => [...prev, newWorkoutExercise(exerciseId, prev.length)]);
    setShowPicker(false);
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
      subscriptionId: subscriptionId || undefined,
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

        <View style={styles.fieldsRow}>
          <Field label="Data allenamento (AAAA-MM-GG)">
            <ThemedTextInput value={startDate} onChangeText={setStartDate} placeholder="2026-07-05" />
          </Field>
          <Field label="Ora (HH:mm, opzionale)">
            <ThemedTextInput value={scheduledTime} onChangeText={setScheduledTime} placeholder="17:30" />
          </Field>
        </View>

        <Field label="Scadenza scheda (AAAA-MM-GG)">
          <ThemedTextInput value={expiryDate} onChangeText={setExpiryDate} placeholder="2026-08-05" />
        </Field>

        <View style={styles.fieldsRow}>
          <Field label="Giorno (opzionale, es. Giorno 3)">
            <ThemedTextInput value={dayLabel} onChangeText={setDayLabel} placeholder="Derivato automaticamente" />
          </Field>
          <Field label="Settimana (opzionale, es. Settimana 4)">
            <ThemedTextInput value={weekLabel} onChangeText={setWeekLabel} placeholder="Derivata automaticamente" />
          </Field>
        </View>

        <Field label="Abbonamento collegato (opzionale)">
          {clientSubscriptions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Questo cliente non ha ancora un abbonamento. Crealo da "Aggiorna abbonamento" nel suo profilo.
            </ThemedText>
          ) : (
            <View style={styles.chipsRow}>
              {clientSubscriptions.map((subscription) => {
                const active = subscription.id === subscriptionId;
                return (
                  <Pressable
                    key={subscription.id}
                    onPress={() => setSubscriptionId(active ? '' : subscription.id)}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {subscription.packageName} ({SUBSCRIPTION_STATUS_LABEL[subscription.status]})
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
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
        <View style={styles.addButtonsRow}>
          <Pressable style={styles.addButtonFlex} onPress={() => setShowPicker(true)}>
            <View style={[styles.addButton, { borderColor: theme.primary }]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                + Aggiungi esercizio
              </ThemedText>
            </View>
          </Pressable>
          {supabaseConfig.isConfigured ? (
            <Pressable style={styles.addButtonFlex} onPress={() => setShowYMovePicker(true)}>
              <View style={[styles.addButton, { borderColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Libreria YMove
                </ThemedText>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : showYMovePicker ? (
        <YMoveExercisePicker onExerciseAdded={handleYMoveExerciseAdded} onClose={() => setShowYMovePicker(false)} />
      ) : (
        <Card style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <ThemedText type="smallBold">Scegli esercizio ({EXERCISE_LIBRARY.length} disponibili)</ThemedText>
            <Pressable onPress={() => setShowPicker(false)} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Chiudi
              </ThemedText>
            </Pressable>
          </View>
          {MUSCLE_GROUPS.map((group) => (
            <View key={group} style={styles.pickerGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {group}
              </ThemedText>
              <View style={styles.chipsRow}>
                {exercisesByMuscleGroup(group).map((ex) => (
                  <Pressable key={ex.id} onPress={() => addExercise(ex.id)}>
                    <View style={[styles.chip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <ThemedText type="small">{ex.name}</ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}

      {error && (
        <ThemedText type="small" themeColor="statusExpired">
          {error}
        </ThemedText>
      )}

      <Pressable onPress={handleSave}>
        <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            {saveLabel}
          </ThemedText>
        </View>
      </Pressable>
    </View>
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

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  detailsCard: {
    gap: Spacing.three,
  },
  field: {
    gap: 4,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  exercisesLabel: {
    marginTop: Spacing.two,
  },
  addButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  addButtonFlex: {
    flex: 1,
  },
  addButton: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: Spacing.three,
    alignItems: 'center',
  },
  pickerContainer: {
    gap: Spacing.three,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerGroup: {
    gap: Spacing.one,
  },
  saveButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
