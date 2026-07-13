import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import { getCurrentSession } from '@/lib/auth-service';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { supabaseConfig } from '@/lib/supabase';
import { getCardioExerciseIds, getExerciseCompletionProgress } from '@/lib/workout-progress';
import { deleteWorkoutPlan as deleteWorkoutPlanRemote, updateWorkoutPlan as updateWorkoutPlanRemote, updateWorkoutSessionProgress } from '@/lib/workout-plan-service';
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
  const updateWorkoutPlanLocal = useTrainingStore((s) => s.updateWorkoutPlan);
  const replaceWorkoutPlanLocal = useTrainingStore((s) => s.replaceWorkoutPlan);
  const deleteWorkoutPlanLocal = useTrainingStore((s) => s.deleteWorkoutPlan);
  const clients = useClientStore((s) => s.clients);
  const incrementSubscriptionCompletedWorkouts = useSubscriptionStore((s) => s.incrementCompletedWorkouts);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [progressError, setProgressError] = useState('');
  // Bug reale trovato e corretto (2026-07-13): questa vista usava ancora
  // getExerciseById diretto (solo i 44 esercizi locali) per renderizzare gli
  // esercizi della scheda — un esercizio importato/collegato a YMove (id
  // Supabase, non nella libreria locale) spariva silenziosamente dalla lista
  // subito dopo il salvataggio. Il resolver (gia' usato in
  // workout-plan-form.tsx/esercizi/[id].tsx) risolve prima il locale, poi
  // FitCoach/Supabase in background.
  const { resolve: resolveExercise } = useExerciseResolver();
  const { loading: remoteLoading, error: remoteError, refresh } = useWorkoutPlansSync();

  // Refresh ad ogni apertura/foreground di questa schermata (2026-07-14,
  // migrazione Supabase): un deep link diretto a /schede/:id (es. da un altro
  // dispositivo o da un link) deve sempre vedere la scheda aggiornata, non
  // solo affidarsi a quanto gia' caricato altrove.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const plan = workoutPlans.find((p) => p.id === id);

  if (!plan) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          {remoteLoading ? (
            <>
              <ActivityIndicator />
              <ThemedText type="default" themeColor="textSecondary">
                Caricamento scheda…
              </ThemedText>
            </>
          ) : remoteError ? (
            <>
              <ThemedText type="default">Impossibile caricare la scheda.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {remoteError}
              </ThemedText>
              <Pressable onPress={refresh}>
                <View style={[styles.retryButton, { borderColor: theme.primary }]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Riprova
                  </ThemedText>
                </View>
              </Pressable>
            </>
          ) : (
            <ThemedText type="default">Scheda non trovata.</ThemedText>
          )}
        </ThemedView>
      </ScreenBackground>
    );
  }

  const client = getClientById(clients, plan.clientId);
  const sessionStatus = plan.sessionStatus ?? 'todo';
  const groups = useMemo(() => groupExercises(plan.exercises), [plan.exercises]);

  // Salvataggio strutturale (nome/date/esercizi/serie/ripetizioni/ecc.): SEMPRE
  // atteso, con errore reale mostrato se fallisce — a differenza degli
  // aggiornamenti di sessione sotto (toggle stato/completamento), che restano
  // ottimistici per non appesantire interazioni frequenti e a basso rischio.
  async function handleSave(updated: WorkoutPlan) {
    // Se la sessione era "Saltato" e il coach ha cambiato data o ora, la
    // riprogrammazione implicita riporta lo stato a "Da fare" (Programmato):
    // altrimenti restava bloccata su "Saltato" per sempre dopo qualunque
    // modifica, anche solo cambiare il nome — vedi docs/BUGS.md.
    const dateOrTimeChanged = updated.startDate !== plan!.startDate || updated.scheduledTime !== plan!.scheduledTime;
    const shouldReschedule = plan!.sessionStatus === 'skipped' && dateOrTimeChanged;
    const toSave = shouldReschedule ? { ...updated, sessionStatus: 'todo' as WorkoutSessionStatus } : updated;

    if (!supabaseConfig.isConfigured) {
      updateWorkoutPlanLocal(toSave);
      setMode('view');
      return;
    }

    setSaveError('');
    setSaving(true);
    const session = await getCurrentSession();
    const realCoachId = session.ok ? (session.data?.user.id ?? null) : null;
    if (!realCoachId) {
      setSaving(false);
      setSaveError('Nessuna sessione coach reale trovata. Prova a rifare il login.');
      return;
    }
    const result = await updateWorkoutPlanRemote({ ...toSave, coachId: realCoachId });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    // Bug reale corretto (2026-07-14): se questo era il PRIMO salvataggio
    // remoto di un piano ancora con un id placeholder locale (es. "1"),
    // Postgres restituisce un id UUID nuovo — updateWorkoutPlanLocal da solo
    // non basta (il suo `.map()` cerca una riga con lo STESSO id, non la
    // trova mai, e non aggiunge nulla): il piano vecchio restava nello store
    // mentre la scheda salvata non compariva da nessuna parte finche' non
    // arrivava un refresh completo. replaceWorkoutPlan rimuove sempre
    // plan!.id (anche se coincide con result.data.id, caso normale) e
    // aggiunge result.data: un solo piano, mai un doppione.
    const idChanged = result.data.id !== plan!.id;
    replaceWorkoutPlanLocal(plan!.id, result.data);
    setMode('view');
    if (idChanged) {
      router.replace(`/schede/${result.data.id}`);
    }
  }

  async function handleDelete() {
    if (!supabaseConfig.isConfigured) {
      deleteWorkoutPlanLocal(plan!.id);
      router.replace('/schede');
      return;
    }
    setSaveError('');
    setSaving(true);
    const result = await deleteWorkoutPlanRemote(plan!.id);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    deleteWorkoutPlanLocal(plan!.id);
    router.replace('/schede');
  }

  // Aggiornamenti di sessione (stato/timer/completamento): ottimistici — la
  // UI si aggiorna subito localmente, la sincronizzazione con Supabase (via
  // la RPC update_workout_session_progress, l'unica che il CLIENTE puo'
  // chiamare) avviene in background. Un fallimento di rete qui viene
  // segnalato ma non blocca l'interazione: sono toggle frequenti e a basso
  // rischio, non il salvataggio strutturale sopra.
  function syncSessionProgress(planId: string, update: Parameters<typeof updateWorkoutSessionProgress>[1]) {
    if (!supabaseConfig.isConfigured) return;
    updateWorkoutSessionProgress(planId, update).then((result) => {
      if (!result.ok) {
        console.error('WORKOUT_REMOTE_SAVE_ERROR', { message: result.message });
        setProgressError(result.message);
      }
    });
  }

  function setSessionStatus(status: WorkoutSessionStatus) {
    updateWorkoutPlanLocal({ ...plan!, sessionStatus: status });
    syncSessionProgress(plan!.id, { sessionStatus: status });
  }

  const cardioExerciseIds = getCardioExerciseIds(plan);
  const cardioDone = cardioExerciseIds.length > 0 && cardioExerciseIds.every((weId) => (plan.completedExerciseIds ?? []).includes(weId));
  const exerciseProgress = getExerciseCompletionProgress(plan);

  function toggleExerciseCompleted(workoutExerciseId: string) {
    const current = plan!.completedExerciseIds ?? [];
    const next = current.includes(workoutExerciseId)
      ? current.filter((wid) => wid !== workoutExerciseId)
      : [...current, workoutExerciseId];
    updateWorkoutPlanLocal({ ...plan!, completedExerciseIds: next });
    syncSessionProgress(plan!.id, { completedExerciseIds: next });
  }

  function toggleCardioDone() {
    const current = plan!.completedExerciseIds ?? [];
    const next = cardioDone
      ? current.filter((wid) => !cardioExerciseIds.includes(wid))
      : Array.from(new Set([...current, ...cardioExerciseIds]));
    updateWorkoutPlanLocal({ ...plan!, completedExerciseIds: next });
    syncSessionProgress(plan!.id, { completedExerciseIds: next });
  }

  function handleStartSession() {
    const startedAt = new Date().toISOString();
    updateWorkoutPlanLocal({ ...plan!, startedAt });
    syncSessionProgress(plan!.id, { startedAt });
  }

  function handleFinishSession(durationSeconds: number) {
    // Guard esplicito: se per qualche motivo questa funzione venisse invocata
    // due volte sulla stessa sessione (non dovrebbe accadere, vedi
    // WorkoutSessionControls: i controlli "Fine allenamento" spariscono a
    // sessione completata), non incrementare due volte il contatore abbonamento.
    const alreadyCompleted = plan!.sessionStatus === 'completed';
    const completedAt = new Date().toISOString();
    updateWorkoutPlanLocal({
      ...plan!,
      startedAt: null,
      durationSeconds,
      sessionStatus: 'completed',
      completedAt,
    });
    syncSessionProgress(plan!.id, { startedAt: null, durationSeconds, sessionStatus: 'completed', completedAt });
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
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                Salvataggio su Supabase…
              </ThemedText>
            </View>
          ) : null}
          {saveError ? (
            <ThemedText type="small" themeColor="statusExpired">
              {saveError}
            </ThemedText>
          ) : null}
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

          {progressError ? (
            <ThemedText type="small" themeColor="statusExpired">
              {progressError}
            </ThemedText>
          ) : null}

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
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  retryButton: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  hidden: {
    display: 'none',
  },
});
