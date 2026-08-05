import { Image, type ImageProps } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ScreenBackground } from '@/components/screen-background';
import { SupersetBlock } from '@/components/superset-block';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppBadge, AppButton, AppCard, BackHeader } from '@/components/ui';
import { WorkoutExerciseRow } from '@/components/workout-exercise-row';
import { WorkoutPlanForm } from '@/components/workout-plan-form';
import { WorkoutSessionControls } from '@/components/workout-session-controls';
import { BottomTabInset, CardShadow, Radius, Spacing } from '@/constants/theme';
import { resolveExerciseCatalogThumbnail } from '@/data/exercise-image-catalog';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import { getCurrentSession } from '@/lib/auth-service';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { supabaseConfig } from '@/lib/supabase';
import { getCardioExerciseIds, getExerciseCompletionProgress } from '@/lib/workout-progress';
import { deleteWorkoutPlan as deleteWorkoutPlanRemote, updateWorkoutPlan as updateWorkoutPlanRemote, updateWorkoutSessionProgress } from '@/lib/workout-plan-service';
import { isWorkoutSessionCompleted } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { SESSION_STATUS_LABEL, type Exercise, type WorkoutExercise, type WorkoutPlan, type WorkoutSessionStatus } from '@/types/training';

const SESSION_STATUSES: WorkoutSessionStatus[] = ['todo', 'completed', 'skipped', 'cancelled'];
const DEFAULT_WORKOUT_HERO = require('../../../assets/images/workouts/default-workout-hero.png');
const DEFAULT_WORKOUT_HERO_LIGHT = require('../../../assets/images/workouts/default-workout-hero-light.png');

// Card cliente con foto di sfondo (schede/[id].tsx, hero "isClientView"): il
// testo sta SEMPRE sopra un'immagine reale, mai sopra lo sfondo dell'app —
// deve restare leggibile a prescindere dal tema chiaro/scuro dell'app, quindi
// questi colori sono fissi (non useTheme()), non i token del tema. Overlay
// nero fisso (stesso valore gia' usato SOLO in tema scuro prima di questo
// fix, qui esteso a entrambi i temi per un risultato identico ovunque).
const HERO_OVERLAY_COLOR = '#05090D';
const HERO_TEXT_PRIMARY = '#FFFFFF';
const HERO_TEXT_SECONDARY = 'rgba(255,255,255,0.74)';
const HERO_TRACK_BACKGROUND = 'rgba(255,255,255,0.28)';
// Stessi colori (chiaro/testo scuro) di AppBadge in tema chiaro
// (components/ui/app-badge.tsx), fissati qui perche' il badge sta sulla foto:
// deve restare leggibile anche quando l'app e' in tema scuro.
const HERO_BADGE_COLORS: Record<'moss' | 'amber' | 'neutral', { background: string; color: string }> = {
  moss: { background: '#DFF6D4', color: '#67D42D' },
  amber: { background: '#FCEACB', color: '#E3922A' },
  neutral: { background: '#EAF1E7', color: '#536052' },
};

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
  const { width } = useWindowDimensions();
  const stackHero = width < 390;
  const theme = useTheme();
  const colorScheme = useEffectiveColorScheme();
  const isLight = colorScheme === 'light';
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const updateWorkoutPlanLocal = useTrainingStore((s) => s.updateWorkoutPlan);
  const replaceWorkoutPlanLocal = useTrainingStore((s) => s.replaceWorkoutPlan);
  const deleteWorkoutPlanLocal = useTrainingStore((s) => s.deleteWorkoutPlan);
  const clients = useClientStore((s) => s.clients);
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
    if (isSessionLocked) {
      setSaveError('Questa sessione è completata e non può essere modificata.');
      return;
    }
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

  // Dopo l'eliminazione di una scheda REALE del cliente, il coach deve
  // tornare al cliente da cui era partito (Clienti → cliente → tab Schede),
  // mai alla libreria globale dei modelli (`/schede`, un contesto
  // completamente diverso — bug reale corretto qui: prima il redirect era lo
  // stesso indiscriminatamente). Il clientId usato e' SEMPRE plan!.clientId
  // (il piano gia' caricato con RLS scoped al coach), mai un parametro URL —
  // questa schermata legge oggi solo `id` da useLocalSearchParams, quindi non
  // esisterebbe comunque un clientId da URL di cui fidarsi o non fidarsi.
  // Stesso pattern di navigazione tipizzata gia' usato da "Vai al cliente"
  // in schede/modello/[templateId].tsx dopo un'assegnazione riuscita.
  function goToClientSchede(clientId: string) {
    router.replace({ pathname: '/clienti/[id]', params: { id: clientId, tab: 'schede' } });
  }

  async function handleDelete() {
    if (isSessionLocked) {
      setSaveError('Questa sessione è completata e non può essere eliminata.');
      return;
    }
    // plan!.clientId e' tipizzato come string non opzionale (types/training.ts)
    // e proviene da una riga gia' caricata: in pratica sempre presente. Se mai
    // fosse vuoto, il fallback resta comunque nell'area coach del cliente
    // (`/clienti`, l'elenco) — mai un salto silenzioso alla libreria modelli,
    // che non ha alcuna relazione con "elimina la scheda di un cliente".
    const clientId = plan!.clientId;
    if (!supabaseConfig.isConfigured) {
      deleteWorkoutPlanLocal(plan!.id);
      if (clientId) {
        goToClientSchede(clientId);
      } else {
        router.replace('/clienti');
      }
      return;
    }
    setSaveError('');
    setSaving(true);
    const result = await deleteWorkoutPlanRemote(plan!.id);
    setSaving(false);
    if (!result.ok) {
      // Errore reale mostrato, incluso WORKOUT_LOCKED (una scheda completed
      // e' bloccata anche server-side dai trigger di immutabilita', gia'
      // applicati — vedi describeSaveError/deleteWorkoutPlan in
      // workout-plan-service.ts): nessuna navigazione in caso di fallimento,
      // resto nel dettaglio con l'errore visibile.
      setSaveError(result.message);
      return;
    }
    deleteWorkoutPlanLocal(plan!.id);
    if (clientId) {
      goToClientSchede(clientId);
    } else {
      router.replace('/clienti');
    }
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
    if (isSessionLocked) return;
    const completedAt = status === 'completed' ? (plan!.completedAt ?? new Date().toISOString()) : undefined;
    updateWorkoutPlanLocal({ ...plan!, sessionStatus: status, completedAt: completedAt ?? plan!.completedAt });
    syncSessionProgress(plan!.id, completedAt ? { sessionStatus: status, completedAt } : { sessionStatus: status });
  }

  const cardioExerciseIds = getCardioExerciseIds(plan);
  const cardioDone = cardioExerciseIds.length > 0 && cardioExerciseIds.every((weId) => (plan.completedExerciseIds ?? []).includes(weId));
  const exerciseProgress = getExerciseCompletionProgress(plan);
  const primaryExercise = plan.exercises[0] ? (resolveExercise(plan.exercises[0].exerciseId) ?? null) : null;
  const heroImageSource = getWorkoutHeroSource(plan, primaryExercise, colorScheme);
  const isClientView = !isCoach;
  const isInProgress = isClientView && Boolean(plan.startedAt) && sessionStatus !== 'completed';
  const heroBadgeLabel =
    sessionStatus === 'completed'
      ? 'Completata'
      : sessionStatus === 'skipped' || sessionStatus === 'cancelled'
        ? 'Saltata'
        : isInProgress
          ? 'In corso'
          : 'Workout da fare';
  const heroCtaLabel = isInProgress ? 'Continua' : sessionStatus === 'completed' ? 'Completata' : 'Inizia';

  function toggleExerciseCompleted(workoutExerciseId: string) {
    if (isSessionLocked) return;
    const current = plan!.completedExerciseIds ?? [];
    if (current.includes(workoutExerciseId)) return;
    const next = [...current, workoutExerciseId];
    updateWorkoutPlanLocal({ ...plan!, completedExerciseIds: next });
    syncSessionProgress(plan!.id, { completedExerciseIds: next });
  }

  function toggleCardioDone() {
    if (isSessionLocked || cardioDone) return;
    const current = plan!.completedExerciseIds ?? [];
    const missingCardioIds = cardioExerciseIds.filter((wid) => !current.includes(wid));
    if (missingCardioIds.length === 0) return;
    const next = Array.from(new Set([...current, ...missingCardioIds]));
    updateWorkoutPlanLocal({ ...plan!, completedExerciseIds: next });
    syncSessionProgress(plan!.id, { completedExerciseIds: next });
  }

  function handleStartSession() {
    if (isSessionLocked) return;
    const startedAt = new Date().toISOString();
    updateWorkoutPlanLocal({ ...plan!, startedAt });
    syncSessionProgress(plan!.id, { startedAt });
  }

  function handleFinishSession(durationSeconds: number) {
    if (isSessionLocked) return;
    const completedAt = new Date().toISOString();
    updateWorkoutPlanLocal({
      ...plan!,
      startedAt: null,
      durationSeconds,
      sessionStatus: 'completed',
      completedAt,
    });
    syncSessionProgress(plan!.id, { startedAt: null, durationSeconds, sessionStatus: 'completed', completedAt });
  }

  const badgeLabel =
    sessionStatus === 'completed' ? 'Workout completato' : sessionStatus === 'skipped' ? 'Workout saltato' : 'Workout da fare';
  const isSessionLocked = isWorkoutSessionCompleted(plan);

  // clientId ed exerciseId passati esplicitamente come dati di VALIDAZIONE
  // (autorevole: plan.clientId viene dalla riga Supabase gia' caricata con
  // RLS scoped al coach, mai da un nome o da un indice), ma la chiave che
  // identifica davvero la riga aperta e' workoutExerciseId (we.id, la riga
  // reale workout_day_exercise) — mai solo exerciseId: lo stesso esercizio
  // puo' comparire due volte nella stessa scheda (es. due varianti/serie
  // separate), e planId+exerciseId da soli non distinguerebbero le due righe.
  // esercizi/[id].tsx trova ESCLUSIVAMENTE quella riga tramite
  // workoutExerciseId, poi verifica che appartenga a planId, che il suo
  // exerciseId corrisponda e che il clientId reale del piano combaci —
  // mai un selettore, mai un fallback sulla prima assegnazione trovata.
  function openExerciseDetail(workoutExerciseId: string, exerciseId: string) {
    router.push({
      pathname: '/esercizi/[id]',
      params: { id: exerciseId, planId: plan!.id, clientId: plan!.clientId, workoutExerciseId },
    });
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <BackHeader title="Dettaglio scheda" fallbackHref={(isCoach ? '/schede' : '/workout') as Href} />

      {mode === 'edit' && isCoach && !isSessionLocked ? (
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
          {progressError ? (
            <ThemedText type="small" themeColor="statusExpired">
              {progressError}
            </ThemedText>
          ) : null}

          {isClientView ? (
            <AppCard
              padded={false}
              style={[
                styles.clientDetailHero,
                stackHero && styles.clientDetailHeroCompact,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                isLight && CardShadow,
              ]}>
              <Image
                source={heroImageSource}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                contentPosition={isLight ? { left: '50%', top: '50%' } : stackHero ? { left: '66%', top: '50%' } : { left: '58%', top: '50%' }}
              />
              <WorkoutHeroOverlay overlayColor={HERO_OVERLAY_COLOR} />
              <View style={styles.clientHeroContent}>
                <View style={styles.clientHeroText}>
                  <HeroBadge
                    label={heroBadgeLabel}
                    tone={sessionStatus === 'completed' || isInProgress ? 'moss' : sessionStatus === 'skipped' || sessionStatus === 'cancelled' ? 'amber' : 'neutral'}
                  />
                  <Text style={[styles.clientPlanTitle, { color: HERO_TEXT_PRIMARY }]} numberOfLines={3} ellipsizeMode="tail">
                    {plan.name}
                  </Text>
                  <View style={styles.clientHeroMetaGrid}>
                    <ClientHeroMeta label="Data" value={`${formatDayMonth(plan.startDate)}${plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''}`} />
                    <ClientHeroMeta label="Scadenza" value={formatDayMonth(plan.expiryDate)} />
                    <ClientHeroMeta label="Completati" value={`${exerciseProgress.completed}/${exerciseProgress.total}`} />
                  </View>
                </View>
              </View>
              <View style={styles.clientHeroBottom}>
                <View style={styles.clientProgressRow}>
                  <Text style={[styles.clientProgressLabel, { color: HERO_TEXT_SECONDARY }]}>Progresso</Text>
                  <Text style={[styles.clientProgressValue, { color: HERO_TEXT_PRIMARY }]}>
                    {exerciseProgress.completed}/{exerciseProgress.total}
                  </Text>
                </View>
                <View style={[styles.clientProgressTrack, { backgroundColor: HERO_TRACK_BACKGROUND }]}>
                  <View
                    style={[
                      styles.clientProgressFill,
                      {
                        backgroundColor: theme.primary,
                        width: `${exerciseProgress.total > 0 ? Math.min(exerciseProgress.completed / exerciseProgress.total, 1) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Pressable
                  onPress={!plan.startedAt && sessionStatus !== 'completed' ? handleStartSession : undefined}
                  disabled={sessionStatus === 'completed'}
                  accessibilityRole="button"
                  accessibilityLabel={heroCtaLabel}
                  style={({ pressed }) => [styles.clientHeroAction, { backgroundColor: theme.primary, opacity: sessionStatus === 'completed' ? 0.72 : pressed ? 0.9 : 1 }]}>
                  <Text style={[styles.clientHeroActionLabel, { color: theme.onPrimary }]}>{heroCtaLabel}</Text>
                  <ArrowRight size={19} color={theme.onPrimary} strokeWidth={2.4} />
                </Pressable>
              </View>
            </AppCard>
          ) : (
          <AppCard style={styles.detailHero}>
            <View style={[styles.heroTop, stackHero && styles.heroTopStacked]}>
              <View style={styles.heroCopy}>
                <AppBadge
                  label={badgeLabel}
                  tone={sessionStatus === 'completed' ? 'moss' : sessionStatus === 'todo' ? 'neutral' : sessionStatus === 'skipped' ? 'amber' : 'rust'}
                />
                <Text style={[styles.planTitle, { color: theme.text }]} numberOfLines={2} ellipsizeMode="tail">
                  {plan.name}
                </Text>
                {isCoach ? (
                  <Text style={[styles.clientName, { color: theme.textSecondary }]} numberOfLines={1}>
                    {client ? clientFullName(client) : 'Cliente non trovato'}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.heroVisual,
                  stackHero && styles.heroVisualStacked,
                  { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
                ]}>
                <Text style={[styles.exerciseCount, { color: theme.primary }]}>{plan.exercises.length}</Text>
                <Text style={[styles.exerciseCountLabel, { color: theme.textSecondary }]}>esercizi</Text>
              </View>
            </View>
            <View style={styles.heroMetaGrid}>
              <HeroMeta label="Data" value={`${formatDayMonth(plan.startDate)}${plan.scheduledTime ? ` · ${plan.scheduledTime}` : ''}`} />
              <HeroMeta label="Scadenza" value={formatDayMonth(plan.expiryDate)} />
              {!isCoach ? <HeroMeta label="Completati" value={`${exerciseProgress.completed}/${exerciseProgress.total}`} /> : null}
            </View>
            {!isCoach ? (
              <View style={[styles.heroProgressTrack, { backgroundColor: theme.background }]}>
                <View
                  style={[
                    styles.heroProgressFill,
                    {
                      backgroundColor: theme.primary,
                      width: `${exerciseProgress.total > 0 ? Math.min(exerciseProgress.completed / exerciseProgress.total, 1) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
            ) : null}
          </AppCard>
          )}

          {isCoach && !isSessionLocked && (
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

          {!isCoach && cardioExerciseIds.length > 0 ? (
            <AppButton
              label={cardioDone ? 'Cardio completato' : 'Cardio da fare'}
              onPress={toggleCardioDone}
              variant={cardioDone ? 'outline' : 'secondary'}
              disabled={cardioDone || isSessionLocked}
              fullWidth
            />
          ) : null}

          {isCoach && !isSessionLocked ? <AppButton label="Modifica scheda" onPress={() => setMode('edit')} variant="outline" fullWidth /> : null}

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
                    const isExerciseLocked = isSessionLocked || (plan.completedExerciseIds ?? []).includes(we.id);
                    return (
                      <WorkoutExerciseRow
                        key={we.id}
                        exercise={exercise}
                        workoutExercise={we}
                        compact
                        onPress={() => openExerciseDetail(we.id, exercise.id)}
                        completed={isExerciseLocked}
                        onToggleComplete={!isExerciseLocked ? () => toggleExerciseCompleted(we.id) : undefined}
                      />
                    );
                  })}
                </SupersetBlock>
              );
            }
            const we = group.items[0];
            const exercise = resolveExercise(we.exerciseId);
            if (!exercise) return null;
            const isExerciseLocked = isSessionLocked || (plan.completedExerciseIds ?? []).includes(we.id);
            return (
              <WorkoutExerciseRow
                key={we.id}
                exercise={exercise}
                workoutExercise={we}
                onPress={() => openExerciseDetail(we.id, exercise.id)}
                completed={isExerciseLocked}
                onToggleComplete={!isExerciseLocked ? () => toggleExerciseCompleted(we.id) : undefined}
              />
            );
          })}

          {!isCoach && (plan.startedAt || sessionStatus === 'completed') ? (
            <WorkoutSessionControls
              startedAt={plan.startedAt}
              isCompleted={sessionStatus === 'completed'}
              savedDurationSeconds={plan.durationSeconds}
              onStart={handleStartSession}
              onFinish={handleFinishSession}
            />
          ) : null}
        </>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

function HeroMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroMetaItem}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

// Colori fissi (mai useTheme()): questo meta sta sempre sopra la foto della
// card cliente, vedi HERO_TEXT_PRIMARY/HERO_TEXT_SECONDARY in testa al file.
function ClientHeroMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.clientHeroMetaItem}>
      <Text style={[styles.clientHeroMetaLabel, { color: HERO_TEXT_SECONDARY }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.clientHeroMetaValue, { color: HERO_TEXT_PRIMARY }]} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

// Stessa visuale di AppBadge (components/ui/app-badge.tsx) ma con colori
// FISSI (mai da tema): usato solo nella card cliente con foto di sfondo, dove
// il badge deve restare leggibile a prescindere dal tema chiaro/scuro
// dell'app. Le altre AppBadge del file (card coach, senza foto) restano
// invariate.
function HeroBadge({ label, tone }: { label: string; tone: 'moss' | 'amber' | 'neutral' }) {
  const { background, color } = HERO_BADGE_COLORS[tone];
  return (
    <Text style={[styles.heroBadge, { backgroundColor: background, color }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

function WorkoutHeroOverlay({ overlayColor }: { overlayColor: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="detailLeftOverlay" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={overlayColor} stopOpacity="0.97" />
            <Stop offset="46%" stopColor={overlayColor} stopOpacity="0.8" />
            <Stop offset="74%" stopColor={overlayColor} stopOpacity="0.28" />
            <Stop offset="100%" stopColor={overlayColor} stopOpacity="0.06" />
          </LinearGradient>
          <LinearGradient id="detailBottomOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={overlayColor} stopOpacity="0" />
            <Stop offset="56%" stopColor={overlayColor} stopOpacity="0.64" />
            <Stop offset="100%" stopColor={overlayColor} stopOpacity="0.94" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#detailLeftOverlay)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#detailBottomOverlay)" />
      </Svg>
    </View>
  );
}

function getWorkoutHeroSource(plan: WorkoutPlan | null | undefined, exercise: Exercise | null, scheme: 'light' | 'dark'): ImageProps['source'] {
  const planImageUri = getOptionalImageUri(plan);
  if (planImageUri) return { uri: planImageUri };

  const exerciseImageUri = getOptionalImageUri(exercise);
  if (exerciseImageUri) return { uri: exerciseImageUri };

  if (exercise) {
    const catalogThumbnail = resolveExerciseCatalogThumbnail(exercise);
    if (catalogThumbnail.kind === 'image') return catalogThumbnail.source;
  }

  return scheme === 'light' ? DEFAULT_WORKOUT_HERO_LIGHT : DEFAULT_WORKOUT_HERO;
}

function getOptionalImageUri(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const uri = record.imageUrl ?? record.coverImageUrl ?? record.heroImageUrl ?? record.thumbnailUrl;
  return typeof uri === 'string' && uri.trim() ? uri.trim() : null;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  clientDetailHero: {
    borderRadius: 20,
    justifyContent: 'space-between',
    minHeight: 292,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    width: '100%',
  },
  clientDetailHeroCompact: {
    borderRadius: 20,
    minHeight: 270,
    padding: 13,
  },
  clientHeroContent: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  clientHeroText: {
    flexShrink: 1,
    gap: Spacing.two,
    justifyContent: 'center',
    maxWidth: '62%',
    minWidth: 0,
    paddingTop: Spacing.two,
  },
  clientPlanTitle: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 29,
    minWidth: 0,
  },
  clientHeroMetaGrid: {
    gap: 7,
    marginTop: 2,
    minWidth: 0,
  },
  clientHeroMetaItem: {
    minWidth: 0,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    fontSize: 9.5,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clientHeroMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  clientHeroMetaValue: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
    minWidth: 0,
  },
  clientHeroBottom: {
    gap: Spacing.two,
    position: 'relative',
    zIndex: 1,
  },
  clientProgressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  clientProgressLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  clientProgressValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  clientProgressTrack: {
    borderRadius: Radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  clientProgressFill: {
    borderRadius: Radius.pill,
    height: '100%',
  },
  clientHeroAction: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    flexDirection: 'row',
    height: 46,
    justifyContent: 'center',
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  clientHeroActionLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'center',
  },
  detailHero: {
    gap: 14,
    padding: 22,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  heroTopStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1,
    flexShrink: 1,
    gap: Spacing.two,
    minWidth: 0,
  },
  // Ridotto da 29/35 (bug reale: un titolo lungo tipo "Powerbuilding — Lower
  // Hypertrophy" andava a capo su 3 righe disordinate accanto al blocco
  // "N esercizi", sbilanciando la card) — ora coerente con numberOfLines={2}
  // sul Text: qualunque titolo piu' lungo tronca con ellipsis invece di
  // rompere su una terza riga.
  planTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 26,
    minWidth: 0,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  heroVisual: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexShrink: 0,
    height: 72,
    justifyContent: 'center',
    width: 78,
  },
  heroVisualStacked: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    height: 48,
    paddingHorizontal: Spacing.three,
    width: 'auto',
  },
  exerciseCount: {
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 31,
  },
  exerciseCountLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroMetaItem: {
    flex: 1,
    minWidth: 92,
  },
  heroProgressTrack: {
    borderRadius: Radius.pill,
    height: 10,
    overflow: 'hidden',
  },
  heroProgressFill: {
    borderRadius: Radius.pill,
    height: '100%',
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statusChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  statusChipActiveText: {
    fontWeight: '700',
  },
  exercisesLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  editFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  savingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  retryButton: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  notFound: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.two,
    justifyContent: 'center',
  },
  hidden: {
    display: 'none',
  },
});
