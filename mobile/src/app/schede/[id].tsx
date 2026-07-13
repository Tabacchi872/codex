import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { SupersetBlock } from '@/components/superset-block';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WorkoutExerciseRow } from '@/components/workout-exercise-row';
import { WorkoutPlanForm } from '@/components/workout-plan-form';
import { WorkoutSessionControls } from '@/components/workout-session-controls';
import { Radius, Spacing } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { getCardioExerciseIds, getExerciseCompletionProgress } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { SESSION_STATUS_LABEL, type WorkoutExercise, type WorkoutPlan, type WorkoutSessionStatus } from '@/types/training';

const SESSION_STATUSES: WorkoutSessionStatus[] = ['todo', 'completed', 'skipped', 'cancelled'];

// Raggruppa gli esercizi consecutivi che condividono supersetGroupId in blocchi,
// mantenendo l'ordine. Un esercizio senza gruppo resta un elemento standalone.
function groupExercises(exercises: WorkoutExercise[]) {
  const groups: Array<{ groupId: string | null; items: WorkoutExercise[] }> = [];
  for (const we of exercises) {
    const last = groups[groups.length - 1];
    if (we.supersetGroupId && last?.groupId === we.supersetGroupId) {
      last.items.push(we);
    } else {
      groups.push({ groupId: we.supersetGroupId ?? null, items: [we] });
    }
  }
  return groups;
}

export default function SchedaDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const updateWorkoutPlan = useTrainingStore((s) => s.updateWorkoutPlan);
  const deleteWorkoutPlan = useTrainingStore((s) => s.deleteWorkoutPlan);
  const clients = useClientStore((s) => s.clients);
  const incrementSubscriptionCompletedWorkouts = useSubscriptionStore((s) => s.incrementCompletedWorkouts);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // Bug reale trovato e corretto (2026-07-13): questa vista usava ancora
  // getExerciseById diretto (solo i 44 esercizi locali) per renderizzare gli
  // esercizi della scheda — un esercizio importato/collegato a YMove (id
  // Supabase, non nella libreria locale) spariva silenziosamente dalla lista
  // subito dopo il salvataggio, perche' `if (!exercise) return null` scartava
  // la riga. Il resolver (gia' usato in workout-plan-form.tsx/esercizi/[id].tsx)
  // risolve prima il locale, poi FitCoach/Supabase in background.
  const { resolve: resolveExercise } = useExerciseResolver();

  const plan = workoutPlans.find((p) => p.id === id);

  if (!plan) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">Scheda non trovata.</ThemedText>
        </ThemedView>
      </ScreenBackground>
    );
  }

  const client = getClientById(clients, plan.clientId);
  const sessionStatus = plan.sessionStatus ?? 'todo';
  const groups = useMemo(() => groupExercises(plan.exercises), [plan.exercises]);

  function handleSave(updated: WorkoutPlan) {
    // Se la sessione era "Saltato" e il coach ha cambiato data o ora, la
    // riprogrammazione implicita riporta lo stato a "Da fare" (Programmato):
    // altrimenti restava bloccata su "Saltato" per sempre dopo qualunque
    // modifica, anche solo cambiare il nome — vedi docs/BUGS.md.
    const dateOrTimeChanged = updated.startDate !== plan!.startDate || updated.scheduledTime !== plan!.scheduledTime;
    const shouldReschedule = plan!.sessionStatus === 'skipped' && dateOrTimeChanged;
    updateWorkoutPlan(shouldReschedule ? { ...updated, sessionStatus: 'todo' } : updated);
    setMode('view');
  }

  function handleDelete() {
    deleteWorkoutPlan(plan!.id);
    router.replace('/schede');
  }

  function setSessionStatus(status: WorkoutSessionStatus) {
    updateWorkoutPlan({ ...plan!, sessionStatus: status });
  }

  const cardioExerciseIds = getCardioExerciseIds(plan);
  const cardioDone = cardioExerciseIds.length > 0 && cardioExerciseIds.every((weId) => (plan.completedExerciseIds ?? []).includes(weId));
  const exerciseProgress = getExerciseCompletionProgress(plan);

  function toggleExerciseCompleted(workoutExerciseId: string) {
    const current = plan!.completedExerciseIds ?? [];
    const next = current.includes(workoutExerciseId)
      ? current.filter((wid) => wid !== workoutExerciseId)
      : [...current, workoutExerciseId];
    updateWorkoutPlan({ ...plan!, completedExerciseIds: next });
  }

  function toggleCardioDone() {
    const current = plan!.completedExerciseIds ?? [];
    const next = cardioDone
      ? current.filter((wid) => !cardioExerciseIds.includes(wid))
      : Array.from(new Set([...current, ...cardioExerciseIds]));
    updateWorkoutPlan({ ...plan!, completedExerciseIds: next });
  }

  function handleStartSession() {
    updateWorkoutPlan({ ...plan!, startedAt: new Date().toISOString() });
  }

  function handleFinishSession(durationSeconds: number) {
    // Guard esplicito: se per qualche motivo questa funzione venisse invocata
    // due volte sulla stessa sessione (non dovrebbe accadere, vedi
    // WorkoutSessionControls: i controlli "Fine allenamento" spariscono a
    // sessione completata), non incrementare due volte il contatore abbonamento.
    const alreadyCompleted = plan!.sessionStatus === 'completed';
    updateWorkoutPlan({
      ...plan!,
      startedAt: null,
      durationSeconds,
      sessionStatus: 'completed',
      completedAt: new Date().toISOString(),
    });
    if (!alreadyCompleted && plan!.subscriptionId) {
      incrementSubscriptionCompletedWorkouts(plan!.subscriptionId);
    }
  }

  const badgeLabel =
    sessionStatus === 'completed' ? 'Workout completato' : sessionStatus === 'skipped' ? 'Workout saltato' : 'Workout da fare';

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
      ]}>
      <Stack.Screen options={{ title: plan.name }} />

      {mode === 'edit' && isCoach ? (
        <>
          <WorkoutPlanForm initialPlan={plan} onSave={handleSave} saveLabel="Salva modifiche" />
          <View style={styles.editFooter}>
            <Pressable onPress={() => setMode('view')}>
              <ThemedText type="small" themeColor="textSecondary">
                Annulla e torna al dettaglio
              </ThemedText>
            </Pressable>
            <Pressable onPress={handleDelete}>
              <ThemedText type="small" themeColor="statusExpired">
                Elimina scheda
              </ThemedText>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.statusBadge, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              {badgeLabel}
            </ThemedText>
          </View>

          {isCoach && (
            <View style={styles.statusChipsRow}>
              {SESSION_STATUSES.map((status) => {
                const active = status === sessionStatus;
                return (
                  <Pressable key={status} onPress={() => setSessionStatus(status)}>
                    <View
                      style={[
                        styles.statusChip,
                        { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'primary' : 'textSecondary'} style={active && styles.statusChipActiveText}>
                        {SESSION_STATUS_LABEL[status]}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!isCoach && (
            cardioExerciseIds.length > 0 ? (
              <Pressable onPress={toggleCardioDone}>
                <View style={[styles.cardioButton, { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary">
                    {cardioDone ? '✓ Cardio completato' : '❤️ Cardio da fare'}
                  </ThemedText>
                </View>
              </Pressable>
            ) : (
              <View style={[styles.cardioButton, styles.cardioButtonEmpty, { borderColor: theme.border }]}>
                <ThemedText type="smallBold" themeColor="disabled">
                  Nessun cardio assegnato
                </ThemedText>
              </View>
            )
          )}

          <View style={styles.metaRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDayMonth(plan.startDate)}
              {plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''} · {client ? clientFullName(client) : 'Cliente non trovato'} ·{' '}
              {plan.exercises.length} esercizi · Scadenza {plan.expiryDate}
            </ThemedText>
          </View>

          <Pressable onPress={() => setMode('edit')} disabled={!isCoach} style={!isCoach && styles.hidden}>
            <View style={[styles.editButton, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">Modifica scheda</ThemedText>
            </View>
          </Pressable>

          <View style={styles.exercisesLabelRow}>
            <ThemedText type="smallBold">Esercizi</ThemedText>
            {!isCoach && (
              <ThemedText type="small" themeColor="textSecondary">
                {exerciseProgress.completed}/{exerciseProgress.total} completati
              </ThemedText>
            )}
          </View>

          {groups.map((group) => {
            if (group.items.length > 1 && group.groupId) {
              const technique = group.items[0].techniqueType === 'circuit' ? 'circuit' : 'superset';
              return (
                <SupersetBlock key={group.groupId} technique={technique}>
                  {group.items.map((we) => {
                    const exercise = resolveExercise(we.exerciseId);
                    if (!exercise) return null;
                    return (
                      <WorkoutExerciseRow
                        key={we.id}
                        exercise={exercise}
                        workoutExercise={we}
                        compact
                        onPress={() => router.push(isCoach ? `/esercizi/${exercise.id}` : `/esercizi/${exercise.id}?planId=${plan.id}`)}
                        completed={!isCoach ? (plan.completedExerciseIds ?? []).includes(we.id) : undefined}
                        onToggleComplete={!isCoach ? () => toggleExerciseCompleted(we.id) : undefined}
                      />
                    );
                  })}
                </SupersetBlock>
              );
            }
            const we = group.items[0];
            const exercise = resolveExercise(we.exerciseId);
            if (!exercise) return null;
            return (
              <WorkoutExerciseRow
                key={we.id}
                exercise={exercise}
                workoutExercise={we}
                onPress={() => router.push(`/esercizi/${exercise.id}`)}
                completed={!isCoach ? (plan.completedExerciseIds ?? []).includes(we.id) : undefined}
                onToggleComplete={!isCoach ? () => toggleExerciseCompleted(we.id) : undefined}
              />
            );
          })}

          {!isCoach && (
            <WorkoutSessionControls
              startedAt={plan.startedAt}
              isCompleted={sessionStatus === 'completed'}
              savedDurationSeconds={plan.durationSeconds}
              onStart={handleStartSession}
              onFinish={handleFinishSession}
            />
          )}
        </>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  statusChipsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statusChip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  statusChipActiveText: {
    fontWeight: '700',
  },
  metaRow: {
    marginTop: -Spacing.one,
  },
  editButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  exercisesLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  cardioButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  cardioButtonEmpty: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  editFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    display: 'none',
  },
});
