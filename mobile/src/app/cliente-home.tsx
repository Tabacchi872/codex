import { Image, type ImageProps } from 'expo-image';
import { Redirect, useRouter, type Href } from 'expo-router';
import { Apple, ArrowRight, Calendar, ClipboardList, Clock, Dumbbell, Gauge, Megaphone, MessageCircle, TrendingUp, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppButton, AppCard, AppEmptyState, AppPressableCard, AppRingProgress, AppScreen, FitCoachLogo, UserAvatar } from '@/components/ui';
import { resolveExerciseCatalogThumbnail } from '@/data/exercise-image-catalog';
import { logClientNavPress } from '@/lib/client-navigation';
import { getClientById } from '@/lib/client-helpers';
import { formatDayMonth, formatFullDateEyebrow } from '@/lib/format-date';
import { getNextWorkoutPlan, getWorkoutCounter } from '@/lib/workout-progress';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useAuthStore } from '@/store/auth-store';
import { useBoardStore } from '@/store/board-store';
import { useBookingStore } from '@/store/booking-store';
import { useCheckinStore } from '@/store/checkin-store';
import { useClientStore } from '@/store/client-store';
import { useNutritionStore } from '@/store/nutrition-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { Difficulty, Exercise, WorkoutPlan } from '@/types/training';

const DEFAULT_WORKOUT_HERO = require('../../assets/images/workouts/default-workout-hero.png');
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Base',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};

export default function ClienteHomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const narrow = width < 390;
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const hasHydrated = useTrainingStore((s) => s.hasHydrated);
  const nutritionPlans = useNutritionStore((s) => s.plans);
  const checkins = useCheckinStore((s) => s.checkins);
  const bookings = useBookingStore((s) => s.bookings);
  const boardPosts = useBoardStore((s) => s.posts);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const { resolve: resolveExercise } = useExerciseResolver();

  const client = getClientById(clients, currentClientId);

  function navigate(source: string, target: string) {
    logClientNavPress(source, target);
    router.push(target as Href);
  }

  if (currentRole === 'coach') return <Redirect href="/" />;

  if (!hasHydrated) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento...</Text>
        </View>
      </AppScreen>
    );
  }

  const { completed: completedCount, total: purchasedTotal } = getWorkoutCounter(subscriptions, workoutPlans, client, currentClientId);
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const nutritionPlan = nutritionPlans.find((p) => p.clientId === currentClientId) ?? null;
  const lastCheckin = checkins
    .filter((c) => c.clientId === currentClientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const nextBooking = bookings
    .filter((b) => b.clientId === currentClientId && b.status === 'confermata')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const relevantPosts = boardPosts.filter((p) => p.scope === 'globale' || p.clientId === currentClientId);
  const totalSets = nextPlan ? nextPlan.exercises.reduce((sum, item) => sum + item.sets, 0) : 0;
  const nextExercise = nextPlan?.exercises[0] ? resolveExercise(nextPlan.exercises[0].exerciseId) : null;
  const workoutHeroSource = getWorkoutHeroSource(nextPlan, nextExercise ?? null);
  const nextPlanMeta = nextPlan
    ? [
        { kind: 'exercises', label: `${nextPlan.exercises.length} esercizi` },
        nextPlan.durationSeconds ? { kind: 'duration', label: formatDuration(nextPlan.durationSeconds) } : null,
        nextExercise?.difficulty ? { kind: 'difficulty', label: DIFFICULTY_LABEL[nextExercise.difficulty as Difficulty] ?? nextExercise.difficulty } : null,
      ].filter((item): item is { kind: 'exercises' | 'duration' | 'difficulty'; label: string } => Boolean(item))
    : [];

  return (
    <AppScreen contentStyle={styles.screenContent}>
      <View style={styles.topBar}>
        <FitCoachLogo size="md" />
        <UserAvatar
          firstName={client?.firstName}
          lastName={client?.lastName}
          imageUrl={client?.avatarUrl}
          preset={client?.avatarPreset}
          size={compact ? 54 : 60}
        />
      </View>

      <View style={styles.heroHeader}>
        <Text style={[styles.heroTitle, compact && styles.heroTitleCompact, { color: colors.ink }]} numberOfLines={2}>
          Ciao{client ? ', ' : ''}
          {client ? <Text style={{ color: colors.moss }}>{client.firstName}</Text> : null}
        </Text>
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{formatFullDateEyebrow(new Date())}</Text>
      </View>

      {!client ? (
        <AppCard>
          <AppEmptyState icon={<User size={20} color={colors.moss} strokeWidth={2} />} title="Nessun profilo cliente collegato a questo account." />
        </AppCard>
      ) : (
        <>
          <AppCard style={styles.progressHero}>
            <View style={styles.glowWrap} pointerEvents="none">
              <View style={[styles.heroBeam, { backgroundColor: colors.moss }]} />
            </View>
            <AppRingProgress value={completedCount} max={purchasedTotal} label="WORKOUT" size={compact ? 112 : narrow ? 122 : 128} strokeWidth={11} />
            <View style={styles.progressCopy}>
              <Text style={[styles.progressTitle, { color: colors.ink }]}>Allenamenti completati</Text>
              <Text style={[styles.remainingText, { color: colors.moss }]}>{Math.max(0, purchasedTotal - completedCount)} rimanenti</Text>
              <View style={styles.progressMetaRow}>
                <Calendar size={15} color={colors.inkSoft} />
                <Text style={[styles.progressMeta, { color: colors.inkSoft }]} numberOfLines={2}>
                  {nextPlan ? 'Prossimo allenamento disponibile' : 'Nessun allenamento assegnato'}
                </Text>
              </View>
            </View>
          </AppCard>

          <AppCard padded={false} style={[styles.workoutHero, compact && styles.workoutHeroCompact, { borderColor: colors.border }]}>
            <Image
              source={workoutHeroSource}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition={compact ? { left: '66%', top: '50%' } : { left: '58%', top: '50%' }}
            />
            <WorkoutHeroOverlay />
            <View style={[styles.workoutContent, compact && styles.workoutContentCompact]}>
              <View style={styles.workoutText}>
                <Text style={[styles.kicker, { color: colors.moss }]}>PIANO ATTUALE</Text>
                <Text style={[styles.workoutTitle, compact && styles.workoutTitleCompact]} numberOfLines={3} ellipsizeMode="tail">
                  {nextPlan ? nextPlan.name : 'Allenamenti'}
                </Text>
                <View style={styles.workoutMetaWrap}>
                  {nextPlan ? (
                    nextPlanMeta.map((item) => (
                      <View key={item.kind} style={styles.workoutMetaPill}>
                        {item.kind === 'exercises' ? (
                          <Dumbbell size={15} color={colors.moss} />
                        ) : item.kind === 'duration' ? (
                          <Clock size={15} color={colors.moss} />
                        ) : (
                          <Gauge size={15} color={colors.moss} />
                        )}
                        <Text style={styles.workoutMeta} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.workoutMetaPill}>
                      <Dumbbell size={15} color={colors.moss} />
                      <Text style={styles.workoutMeta} numberOfLines={1}>
                        Apri Workout
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => navigate('cliente-home-inizia', nextPlan ? `/schede/${nextPlan.id}` : '/workout')}
              accessibilityRole="button"
              accessibilityLabel="Inizia"
              style={({ pressed }) => [styles.workoutAction, { backgroundColor: colors.moss, opacity: pressed ? 0.9 : 1 }]}>
              <Text style={[styles.workoutActionLabel, { color: colors.onMoss }]}>Inizia</Text>
              <ArrowRight size={19} color={colors.onMoss} strokeWidth={2.4} />
            </Pressable>
          </AppCard>

          <View style={styles.quickGrid}>
            <QuickTile
              title="Nutrizione"
              subtitle={nutritionPlan ? nutritionPlan.title : 'Piani e ricette'}
              icon={<Apple size={compact ? 27 : 30} color={colors.moss} />}
              onPress={() => navigate('cliente-home-nutrizione', '/nutrizione')}
            />
            <QuickTile
              title="Check-in"
              subtitle={lastCheckin ? `Ultimo ${formatDayMonth(lastCheckin.date)}` : 'Tieni il ritmo'}
              icon={<ClipboardList size={compact ? 27 : 30} color={colors.moss} />}
              onPress={() => navigate('cliente-home-checkin', '/questionario')}
            />
            <QuickTile
              title="Prenotazioni"
              subtitle={nextBooking ? `${formatDayMonth(nextBooking.date)} ${nextBooking.time}` : 'I tuoi appuntamenti'}
              icon={<Calendar size={compact ? 27 : 30} color={colors.moss} />}
              onPress={() => navigate('cliente-home-prenota', '/prenotazioni')}
            />
            <QuickTile
              title="Bacheca"
              subtitle={relevantPosts.length ? `${relevantPosts.length} aggiornamenti` : 'News e aggiornamenti'}
              icon={<Megaphone size={compact ? 27 : 30} color={colors.moss} />}
              onPress={() => navigate('cliente-home-bacheca', '/bacheca')}
            />
          </View>

          <AppCard style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <TrendingUp size={21} color={colors.moss} />
              <Text style={[styles.summaryTitle, { color: colors.ink }]}>I tuoi progressi</Text>
            </View>
            <View style={[styles.summaryStats, compact && styles.summaryStatsCompact]}>
              <SummaryMetric label="Workout" value={String(completedCount)} compact={compact} />
              <SummaryMetric label="Serie" value={String(totalSets)} divided={!compact} compact={compact} />
              <SummaryMetric label="Progresso" value={`${Math.round((completedCount / Math.max(1, purchasedTotal)) * 100)}%`} divided={!compact} compact={compact} />
            </View>
          </AppCard>

          <AppButton
            label="Chat con il coach"
            variant="outline"
            icon={<MessageCircle size={16} color={colors.moss} />}
            onPress={() => navigate('cliente-home-coach', '/chat')}
            fullWidth
          />
        </>
      )}
    </AppScreen>
  );
}

function WorkoutHeroOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="workoutLeftOverlay" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#050705" stopOpacity="0.96" />
            <Stop offset="46%" stopColor="#050705" stopOpacity="0.78" />
            <Stop offset="74%" stopColor="#050705" stopOpacity="0.24" />
            <Stop offset="100%" stopColor="#050705" stopOpacity="0.04" />
          </LinearGradient>
          <LinearGradient id="workoutBottomOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#050705" stopOpacity="0" />
            <Stop offset="58%" stopColor="#050705" stopOpacity="0.62" />
            <Stop offset="100%" stopColor="#050705" stopOpacity="0.92" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#workoutLeftOverlay)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#workoutBottomOverlay)" />
      </Svg>
    </View>
  );
}

function getWorkoutHeroSource(plan: WorkoutPlan | null | undefined, exercise: Exercise | null): ImageProps['source'] {
  const planImageUri = getOptionalImageUri(plan);
  if (planImageUri) return { uri: planImageUri };

  const exerciseImageUri = getOptionalImageUri(exercise);
  if (exerciseImageUri) return { uri: exerciseImageUri };

  if (exercise) {
    const catalogThumbnail = resolveExerciseCatalogThumbnail(exercise);
    if (catalogThumbnail.kind === 'image') return catalogThumbnail.source;
  }

  return DEFAULT_WORKOUT_HERO;
}

function getOptionalImageUri(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const uri = record.imageUrl ?? record.coverImageUrl ?? record.heroImageUrl ?? record.thumbnailUrl;
  return typeof uri === 'string' && uri.trim() ? uri.trim() : null;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function QuickTile({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: ReactNode; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={title} style={styles.quickTile}>
      <View style={styles.quickTop}>
        {icon}
        <Text style={[styles.quickArrow, { color: colors.inkFaint }]}>›</Text>
      </View>
      <View style={styles.quickText}>
        <Text style={[styles.quickTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.quickSubtitle, { color: colors.inkSoft }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </AppPressableCard>
  );
}

function SummaryMetric({
  label,
  value,
  divided = false,
  compact = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.summaryMetric, compact && styles.summaryMetricCompact, divided && { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.summaryValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 18,
    paddingHorizontal: 18,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: AppSpacing[3],
    marginBottom: AppSpacing[1],
  },
  heroHeader: {
    gap: AppSpacing[1],
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 42,
  },
  heroTitleCompact: {
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: AppFontSize.sm + 1,
    fontWeight: '500',
    textTransform: 'none',
  },
  progressHero: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    gap: AppSpacing[4],
    minHeight: 184,
    overflow: 'hidden',
    padding: AppSpacing[5],
  },
  glowWrap: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  heroBeam: {
    borderRadius: 999,
    height: 160,
    opacity: 0.08,
    position: 'absolute',
    right: -92,
    top: 46,
    width: 160,
  },
  progressCopy: {
    flex: 1,
    minWidth: 0,
  },
  progressTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 27,
  },
  remainingText: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: AppSpacing[2],
  },
  progressMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    marginTop: AppSpacing[4],
    minWidth: 0,
  },
  progressMeta: {
    fontSize: AppFontSize.sm,
    flex: 1,
    fontWeight: '500',
    lineHeight: 19,
    minWidth: 0,
  },
  workoutHero: {
    borderRadius: 24,
    justifyContent: 'space-between',
    minHeight: 330,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    width: '100%',
  },
  workoutHeroCompact: {
    borderRadius: 22,
    minHeight: 310,
    padding: 16,
  },
  workoutContent: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingBottom: AppSpacing[3],
    paddingTop: AppSpacing[2],
    width: '62%',
    zIndex: 1,
  },
  workoutContentCompact: {
    width: '62%',
  },
  workoutText: {
    flexShrink: 1,
    gap: AppSpacing[2],
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
  },
  kicker: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  workoutTitle: {
    color: '#F7F6EE',
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 35,
    minWidth: 0,
  },
  workoutTitleCompact: {
    fontSize: 26,
    lineHeight: 32,
  },
  workoutMetaWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  workoutMetaPill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  workoutMeta: {
    color: '#E7E9DF',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    minWidth: 0,
  },
  workoutAction: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    flexDirection: 'row',
    height: 54,
    justifyContent: 'center',
    marginTop: AppSpacing[3],
    paddingHorizontal: AppSpacing[4],
    position: 'relative',
    zIndex: 1,
  },
  workoutActionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  quickTile: {
    borderRadius: 22,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'space-between',
    minHeight: 116,
    padding: AppSpacing[4],
  },
  quickTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickArrow: {
    fontSize: 23,
    fontWeight: '600',
  },
  quickText: {
    gap: 3,
  },
  quickTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
    lineHeight: 21,
  },
  quickSubtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
    lineHeight: 18,
  },
  summaryCard: {
    borderRadius: 22,
    gap: AppSpacing[4],
    padding: AppSpacing[5],
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryStats: {
    flexDirection: 'row',
  },
  summaryStatsCompact: {
    flexWrap: 'wrap',
    rowGap: AppSpacing[3],
  },
  summaryMetric: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: AppSpacing[2],
  },
  summaryMetricCompact: {
    flexBasis: '47%',
    flexGrow: 1,
    borderLeftWidth: 0,
  },
  summaryValue: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  summaryLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
  },
});

