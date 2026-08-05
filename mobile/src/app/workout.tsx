import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Calendar, ChevronRight, ClipboardList, Dumbbell, FileWarning, Hourglass, LockKeyhole, ShieldAlert } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { AppBadge, AppButton, AppCard, AppPressableCard } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import {
  assignInitialAutoProgram,
  getMyActiveProgramCycle,
  getMyProgramCycleSessions,
  updateProgramCycleSessionProgress,
} from '@/lib/auto-program-service';
import { logClientNavPress } from '@/lib/client-navigation';
import { getClientFitnessProfileStatus } from '@/lib/client-fitness-profile-service';
import { getClientOnboardingStatus } from '@/lib/client-onboarding-service';
import { getMySelfGuidedPlanAccess } from '@/lib/client-plan-access-service';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { getClientPlans, getSessionDayLabel, getSessionWeekLabel } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useProgramEditStore } from '@/store/program-edit-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { ActiveProgramCycle, ProgramCycleSession } from '@/types/client-fitness-profile';
import { SESSION_STATUS_LABEL, type WorkoutPlan } from '@/types/training';

type Tab = 'todo' | 'past';
type WorkoutAccessState =
  | { kind: 'loading' }
  | { kind: 'coach_guided' }
  | { kind: 'client_pro_required'; reason: 'expired' | 'missing' }
  | { kind: 'questionnaire_required' }
  | { kind: 'generating'; message: string }
  | { kind: 'pending_safety_review'; cycle: ActiveProgramCycle }
  | { kind: 'pending_template'; cycle: ActiveProgramCycle }
  | { kind: 'active_program'; cycle: ActiveProgramCycle | null }
  | { kind: 'error'; message: string };

// Lista allenamenti del SOLO cliente autenticato (a differenza di schede/index.tsx,
// che è la vista coach su tutti i clienti e resta bloccata al cliente da
// CoachOnlyNotice). Schermata nuova invece di riadattare quella coach.
// FlatList non puo' stare dentro AppScreen (ScrollView annidate non
// supportate): sfondo/padding replicano manualmente quelli di AppScreen.
export default function WorkoutClienteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const [tab, setTab] = useState<Tab>('todo');
  const { loading: remoteLoading, error: remoteError, refresh } = useWorkoutPlansSync();
  const [accessState, setAccessState] = useState<WorkoutAccessState>({ kind: 'loading' });
  const autoAssignAttemptedRef = useRef(false);
  // Occorrenze pianificate (client_program_cycle_sessions) del ciclo attivo:
  // popolate SOLO quando accessState e' 'active_program' con un ciclo
  // auto_system reale. null = non ancora caricate/non applicabile (ciclo
  // coach_guided, o ciclo creato prima di questa funzionalita' senza
  // occorrenze) — in quel caso il rendering ricade sulle schede grezze come
  // gia' faceva prima di questa aggiunta, nessuna regressione.
  const [sessions, setSessions] = useState<ProgramCycleSession[] | null>(null);
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(null);

  function navigateToPlan(planId: string) {
    const target = `/schede/${planId}`;
    logClientNavPress(`workout-${tab}`, target);
    router.push(target as Href);
  }

  const myPlans = useMemo(() => getClientPlans(workoutPlans, currentClientId), [workoutPlans, currentClientId]);

  const filtered = useMemo(() => {
    return myPlans.filter((p) => {
      const status = p.sessionStatus ?? 'todo';
      return tab === 'todo' ? status === 'todo' : status !== 'todo';
    });
  }, [myPlans, tab]);

  const loadWorkoutAccessState = useCallback(async () => {
    if (!currentClientId) {
      setAccessState({ kind: 'error', message: 'Account cliente non disponibile. Effettua di nuovo il login.' });
      return;
    }

    setAccessState({ kind: 'loading' });
    const onboarding = await getClientOnboardingStatus(currentClientId);
    if (__DEV__) console.log('WORKOUT_ACCESS_ONBOARDING', { ok: onboarding.ok, mode: onboarding.ok ? onboarding.data.mode : null });
    if (!onboarding.ok) {
      setAccessState({ kind: 'error', message: onboarding.message });
      return;
    }
    if (onboarding.data.mode !== 'self_guided') {
      setAccessState({ kind: 'coach_guided' });
      return;
    }

    const planAccess = await getMySelfGuidedPlanAccess();
    if (__DEV__) console.log('WORKOUT_ACCESS_PLAN', { ok: planAccess.ok, active: planAccess.ok ? planAccess.data.active : null });
    if (!planAccess.ok) {
      setAccessState({ kind: 'error', message: planAccess.message });
      return;
    }
    if (!planAccess.data.active) {
      setAccessState({ kind: 'client_pro_required', reason: planAccess.data.reason === 'expired' ? 'expired' : 'missing' });
      return;
    }

    const fitnessProfile = await getClientFitnessProfileStatus();
    if (__DEV__) console.log('WORKOUT_ACCESS_FITNESS_PROFILE', { ok: fitnessProfile.ok, completed: fitnessProfile.ok ? fitnessProfile.data.completed : null });
    if (!fitnessProfile.ok) {
      setAccessState({ kind: 'error', message: fitnessProfile.message });
      return;
    }
    if (!fitnessProfile.data.completed) {
      setAccessState({ kind: 'questionnaire_required' });
      return;
    }

    let cycleResult = await getMyActiveProgramCycle();
    if (__DEV__) console.log('WORKOUT_ACCESS_CYCLE', { ok: cycleResult.ok, status: cycleResult.ok ? (cycleResult.data?.status ?? 'none') : null });
    if (!cycleResult.ok) {
      setAccessState({ kind: 'error', message: cycleResult.message });
      return;
    }

    if (!cycleResult.data && !autoAssignAttemptedRef.current) {
      autoAssignAttemptedRef.current = true;
      setAccessState({ kind: 'generating', message: 'Stiamo generando il tuo programma automatico.' });
      const assigned = await assignInitialAutoProgram();
      if (__DEV__) console.log('AUTO_PROGRAM_ASSIGN_ATTEMPT', { ok: assigned.ok });
      if (!assigned.ok) {
        // BUG corretto qui: il ref sopra impediva PER SEMPRE (per tutta la
        // vita di questo mount, incluso ogni "Riprova" successivo) un nuovo
        // tentativo dopo un primo fallimento — anche se la causa del
        // fallimento (es. entitlement Client Pro non ancora sincronizzato dal
        // webhook, arrivato con qualche secondo di ritardo) si risolveva da
        // sola poco dopo. assign_initial_auto_program e' gia' idempotente e
        // sicura da richiamare piu' volte (vedi commento sulla funzione):
        // il reset qui sotto e' cio' che rende "Riprova" un vero nuovo
        // tentativo, non un vicolo cieco.
        autoAssignAttemptedRef.current = false;
        cycleResult = await getMyActiveProgramCycle();
        if (!cycleResult.ok) {
          setAccessState({ kind: 'error', message: assigned.message });
          return;
        }
        if (!cycleResult.data) {
          setAccessState({ kind: 'error', message: assigned.message });
          return;
        }
      } else {
        cycleResult = await getMyActiveProgramCycle();
        if (!cycleResult.ok) {
          setAccessState({ kind: 'error', message: cycleResult.message });
          return;
        }
      }
    }

    const cycle = cycleResult.data;
    if (!cycle) {
      setAccessState({ kind: 'generating', message: 'Programma non ancora disponibile. Riprova tra poco.' });
      return;
    }
    if (cycle.status === 'pending_safety_review') {
      setAccessState({ kind: 'pending_safety_review', cycle });
      return;
    }
    if (cycle.status === 'pending_template') {
      setAccessState({ kind: 'pending_template', cycle });
      return;
    }
    if (cycle.status === 'draft' || cycle.status === 'review_pending') {
      setAccessState({ kind: 'generating', message: cycle.decisionReason ?? 'Il programma automatico e in elaborazione.' });
      return;
    }
    if (cycle.status === 'pending_subscription' || cycle.status === 'paused_subscription') {
      setAccessState({ kind: 'client_pro_required', reason: 'expired' });
      return;
    }
    setAccessState({ kind: 'active_program', cycle });

    const sessionsResult = await getMyProgramCycleSessions(cycle.id);
    if (__DEV__) console.log('WORKOUT_ACCESS_SESSIONS', { ok: sessionsResult.ok, count: sessionsResult.ok ? sessionsResult.data.length : null });
    // null in caso di errore o lista vuota: il rendering ricade sulle schede
    // grezze (comportamento identico a prima di questa funzionalita'), mai
    // un blocco/errore mostrato per un problema di sola visualizzazione.
    setSessions(sessionsResult.ok && sessionsResult.data.length > 0 ? sessionsResult.data : null);
  }, [currentClientId]);

  async function reloadSessions(cycleId: string) {
    const sessionsResult = await getMyProgramCycleSessions(cycleId);
    setSessions(sessionsResult.ok && sessionsResult.data.length > 0 ? sessionsResult.data : null);
  }

  async function handleCompleteSession(session: ProgramCycleSession) {
    if (completingSessionId) return;
    setCompletingSessionId(session.id);
    const result = await updateProgramCycleSessionProgress(session.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    setCompletingSessionId(null);
    if (!result.ok) return;
    if (accessState.kind === 'active_program' && accessState.cycle) {
      await reloadSessions(accessState.cycle.id);
    }
  }

  function retryAccessState() {
    void loadWorkoutAccessState();
    refresh();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
      void loadWorkoutAccessState();
    }, [refresh, loadWorkoutAccessState]),
  );

  if (!hasHydrated || accessState.kind === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento…</Text>
        </View>
      </View>
    );
  }

  if (accessState.kind === 'client_pro_required') {
    const expired = accessState.reason === 'expired';
    return (
      <StatusScreen
        title={expired ? 'Client Pro è scaduto' : 'Client Pro richiesto'}
        message={expired ? 'Rinnova Client Pro per continuare e ricevere il tuo programma automatico.' : 'Per usare gli allenamenti automatici senza coach serve un piano Client Pro attivo.'}
        icon={<LockKeyhole size={28} color={colors.moss} />}
        primaryLabel={expired ? 'Rinnova Client Pro' : 'Vai ai Piani'}
        onPrimary={() => router.push('/abbonamento-cliente')}
      />
    );
  }

  if (accessState.kind === 'questionnaire_required') {
    return (
      <StatusScreen
        title="Questionario richiesto"
        message="Completa il questionario fitness per generare il programma automatico."
        icon={<ClipboardList size={28} color={colors.moss} />}
        primaryLabel="Apri questionario"
        onPrimary={() => router.push('/questionario-fitness')}
      />
    );
  }

  if (accessState.kind === 'generating') {
    return (
      <StatusScreen
        title="Programma in generazione"
        message={accessState.message}
        icon={<Hourglass size={28} color={colors.moss} />}
        primaryLabel="Riprova"
        onPrimary={retryAccessState}
      />
    );
  }

  if (accessState.kind === 'pending_safety_review') {
    return (
      <StatusScreen
        title="Revisione sicurezza"
        message={accessState.cycle.decisionReason ?? 'Il team sta verificando il profilo prima di rendere disponibile il programma.'}
        icon={<ShieldAlert size={28} color={colors.moss} />}
        primaryLabel="Aggiorna"
        onPrimary={retryAccessState}
      />
    );
  }

  if (accessState.kind === 'pending_template') {
    return (
      <StatusScreen
        title="Programma non ancora disponibile"
        message="Non abbiamo ancora un programma automatico perfettamente compatibile con le risposte del questionario. Puoi riprovare la generazione oppure controllare le risposte inserite."
        icon={<FileWarning size={28} color={colors.moss} />}
        primaryLabel="Riprova"
        onPrimary={retryAccessState}
        secondaryLabel="Controlla questionario"
        onSecondary={() => {
          useProgramEditStore.getState().start();
          router.push('/onboarding-cliente');
        }}
      />
    );
  }

  if (accessState.kind === 'error') {
    return (
      <StatusScreen
        title="Impossibile caricare Workout"
        message={accessState.message}
        icon={<FileWarning size={28} color={colors.rust} />}
        primaryLabel="Riprova"
        onPrimary={retryAccessState}
      />
    );
  }

  if (remoteLoading && myPlans.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={{ color: colors.inkSoft, marginTop: AppSpacing[2] }}>Caricamento allenamenti…</Text>
        </View>
      </View>
    );
  }

  if (remoteError && myPlans.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Impossibile caricare i tuoi allenamenti.</Text>
          <Text style={{ color: colors.inkSoft, marginTop: 4, textAlign: 'center', paddingHorizontal: AppSpacing[5] }}>{remoteError}</Text>
          <View style={{ marginTop: AppSpacing[3] }}>
            <AppButton label="Riprova" onPress={refresh} />
          </View>
        </View>
      </View>
    );
  }

  if (accessState.kind === 'active_program' && !remoteLoading && myPlans.length === 0) {
    return (
      <StatusScreen
        title="Programma attivo"
        message="Il ciclo automatico risulta attivo, ma gli allenamenti non sono stati caricati. Riprova la sincronizzazione."
        icon={<Dumbbell size={28} color={colors.moss} />}
        primaryLabel="Riprova"
        onPrimary={retryAccessState}
      />
    );
  }

  // Ciclo automatico con occorrenze pianificate (client_program_cycle_
  // sessions): A/B/C... ripetute per 4 settimane, mai schede duplicate. Ogni
  // occorrenza ha il proprio stato indipendente — vedi
  // update_program_cycle_session_progress. Se le occorrenze non sono
  // disponibili (sessions === null: ciclo coach_guided, o ciclo creato prima
  // di questa funzionalita'), si ricade sulla lista di schede grezze sotto,
  // comportamento identico a prima.
  if (accessState.kind === 'active_program' && sessions) {
    const filteredSessions = sessions.filter((s) => (tab === 'todo' ? s.status === 'todo' : s.status !== 'todo'));
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
              paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
            },
          ]}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={[AppTextStyle.title, { color: colors.ink }]}>I tuoi allenamenti</Text>
              <View style={styles.tabRow}>
                <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
                <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
              </View>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: AppSpacing[3] }} />}
          ListEmptyComponent={
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
              {tab === 'todo' ? 'Nessuna sessione da fare al momento.' : 'Nessuna sessione passata ancora.'}
            </Text>
          }
          renderItem={({ item }) => (
            <ProgramSessionRow
              session={item}
              plan={myPlans.find((p) => p.id === item.workoutPlanId) ?? null}
              completing={completingSessionId === item.id}
              onOpen={() => navigateToPlan(item.workoutPlanId)}
              onComplete={() => handleCompleteSession(item)}
            />
          )}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[AppTextStyle.title, { color: colors.ink }]}>I tuoi allenamenti</Text>
            <View style={styles.tabRow}>
              <TabButton label="Da fare" active={tab === 'todo'} onPress={() => setTab('todo')} />
              <TabButton label="Passati" active={tab === 'past'} onPress={() => setTab('past')} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[3] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {tab === 'todo' ? 'Nessun allenamento da fare al momento.' : 'Nessun allenamento passato ancora.'}
          </Text>
        }
        renderItem={({ item }) => <WorkoutRow plan={item} myPlans={myPlans} onPress={() => navigateToPlan(item.id)} />}
      />
    </View>
  );
}

function StatusScreen({
  title,
  message,
  icon,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  message: string;
  icon: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.statusShell}>
        <AppCard style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: colors.mossSoft }]}>{icon}</View>
          <Text style={[styles.statusTitle, { color: colors.ink }]}>{title}</Text>
          <Text style={[styles.statusMessage, { color: colors.inkSoft }]}>{message}</Text>
          <AppButton label={primaryLabel} onPress={onPrimary} fullWidth />
          {secondaryLabel && onSecondary ? <AppButton label={secondaryLabel} onPress={onSecondary} variant="outline" fullWidth /> : null}
        </AppCard>
      </View>
    </View>
  );
}

function WorkoutRow({ plan, myPlans, onPress }: { plan: WorkoutPlan; myPlans: WorkoutPlan[]; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const status = plan.sessionStatus ?? 'todo';
  const weekLabel = getSessionWeekLabel(myPlans, plan);
  const dayLabel = getSessionDayLabel(plan);
  const firstExercise = plan.exercises[0] ? resolve(plan.exercises[0].exerciseId) : null;
  const thumbnailSize = 84;

  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri allenamento ${plan.name}`} style={styles.card}>
      <View style={styles.cardRow}>
        {firstExercise ? (
          <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={thumbnailSize} />
        ) : (
          <View style={[styles.planPlaceholder, { backgroundColor: colors.mossSoft }]}>
            <Dumbbell size={26} color={colors.moss} />
          </View>
        )}
        <View style={styles.cardCopy}>
          <View style={styles.badgeRow}>
            <AppBadge label={`GIORNO ${dayLabel}`} tone="moss" />
            {status !== 'todo' ? (
              <AppBadge
                label={SESSION_STATUS_LABEL[status]}
                tone={status === 'completed' ? 'moss' : status === 'skipped' ? 'amber' : 'rust'}
              />
            ) : null}
          </View>
          <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
            {plan.name}
          </Text>
          <View style={styles.metaRow}>
            <Calendar size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {formatWeekday(plan.startDate)} · {formatDayMonth(plan.startDate)}
              {plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Dumbbell size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {plan.exercises.length} esercizi · Settimana {weekLabel}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.inkFaint} />
      </View>
    </AppPressableCard>
  );
}

function ProgramSessionRow({
  session,
  plan,
  completing,
  onOpen,
  onComplete,
}: {
  session: ProgramCycleSession;
  plan: WorkoutPlan | null;
  completing: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const firstExercise = plan?.exercises[0] ? resolve(plan.exercises[0].exerciseId) : null;
  const thumbnailSize = 84;
  const [focused, setFocused] = useState(false);

  // "Apri scheda" (onOpen) e "Segna completata" (onComplete) sono due azioni
  // distinte: la card intera non puo' quindi essere un solo Pressable con
  // AppButton annidato (su web react-native-web renderizza accessibilityRole
  // "button" come <button>, e <button> dentro <button> e' HTML non valido,
  // causa errore di idratazione). AppCard (visivo, non interattivo) resta il
  // contenitore; il Pressable "apri" e l'AppButton "completa" sono fratelli
  // al suo interno, mai l'uno dentro l'altro.
  return (
    <AppCard style={styles.card}>
      <Pressable
        onPress={onOpen}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel={`Apri allenamento ${session.dayLabel}`}
        hitSlop={2}
        style={({ pressed }) => [
          styles.cardRow,
          pressed && styles.cardRowPressed,
          focused && Platform.OS === 'web' ? styles.cardRowFocused : null,
        ]}>
        {firstExercise ? (
          <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={thumbnailSize} />
        ) : (
          <View style={[styles.planPlaceholder, { backgroundColor: colors.mossSoft }]}>
            <Dumbbell size={26} color={colors.moss} />
          </View>
        )}
        <View style={styles.cardCopy}>
          <View style={styles.badgeRow}>
            <AppBadge label={`GIORNO ${session.dayLabel.toUpperCase()}`} tone="moss" />
            {session.status !== 'todo' ? (
              <AppBadge
                label={SESSION_STATUS_LABEL[session.status]}
                tone={session.status === 'completed' ? 'moss' : session.status === 'skipped' ? 'amber' : 'rust'}
              />
            ) : null}
          </View>
          <Text style={[styles.planName, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
            {plan?.name ?? session.dayLabel}
          </Text>
          <View style={styles.metaRow}>
            <Calendar size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              Settimana {session.weekNumber}
              {session.scheduledDate ? ` · ${formatWeekday(session.scheduledDate)} ${formatDayMonth(session.scheduledDate)}` : ''}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Dumbbell size={13} color={colors.inkSoft} />
            <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
              {plan ? `${plan.exercises.length} esercizi` : ''} · Occorrenza {session.occurrenceNumber}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.inkFaint} />
      </Pressable>
      {session.status === 'todo' ? (
        <View style={styles.completeButtonWrap}>
          <AppButton label="Segna completata" onPress={onComplete} loading={completing} disabled={completing} size="sm" />
        </View>
      ) : null}
    </AppCard>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.tabButton, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
      <Text style={[styles.tabButtonLabel, { color: active ? colors.onMoss : colors.moss }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[4],
  },
  header: {
    gap: AppSpacing[2],
    marginBottom: AppSpacing[1],
  },
  tabRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  tabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  card: {
    padding: 11,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  cardRowPressed: {
    opacity: 0.88,
  },
  cardRowFocused: {
    borderRadius: AppRadius.lg,
    outlineColor: '#B7F04A',
    outlineStyle: 'solid',
    outlineWidth: 2,
  } as ViewStyle,
  cardCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  // Allinea il bottone "Segna completata" (ora fratello del Pressable "apri",
  // non piu' annidato al suo interno: vedi ProgramSessionRow) sotto la
  // colonna di testo, come nella posizione originale dentro cardCopy.
  completeButtonWrap: {
    marginLeft: 84 + AppSpacing[2],
    marginTop: AppSpacing[1],
  },
  planPlaceholder: {
    alignItems: 'center',
    borderRadius: AppRadius.xl,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    flex: 1,
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    minWidth: 0,
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    minWidth: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusShell: {
    flex: 1,
    justifyContent: 'center',
    padding: AppSpacing[4],
  },
  statusCard: {
    alignItems: 'center',
    gap: AppSpacing[3],
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  statusTitle: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
});
