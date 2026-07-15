import { Redirect, useRouter, type Href } from 'expo-router';
import { Apple, Calendar, ClipboardList, Dumbbell, Megaphone, MessageCircle, TrendingUp, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppButton, AppCard, AppEmptyState, AppPressableCard, AppRingProgress, AppScreen, FitCoachLogo, UserAvatar } from '@/components/ui';
import { logClientNavPress } from '@/lib/client-navigation';
import { getClientById } from '@/lib/client-helpers';
import { formatDayMonth, formatFullDateEyebrow } from '@/lib/format-date';
import { getNextWorkoutPlan, getSessionDayLabel, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useBoardStore } from '@/store/board-store';
import { useBookingStore } from '@/store/booking-store';
import { useCheckinStore } from '@/store/checkin-store';
import { useClientStore } from '@/store/client-store';
import { useNutritionStore } from '@/store/nutrition-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

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

          <AppCard style={styles.workoutHero}>
            <View style={styles.workoutText}>
              <Text style={[styles.kicker, { color: colors.moss }]}>PIANO ATTUALE</Text>
              <Text
                style={[styles.workoutTitle, compact && styles.workoutTitleCompact, { color: colors.ink }]}
                numberOfLines={3}
                ellipsizeMode="tail">
                {nextPlan ? nextPlan.name : 'Allenamenti'}
              </Text>
              <Text style={[styles.workoutMeta, { color: colors.inkSoft }]}>
                {nextPlan ? `${nextPlan.exercises.length} esercizi - Giorno ${getSessionDayLabel(nextPlan)}` : 'Apri Workout per vedere lo storico'}
              </Text>
              <AppButton
                label="Inizia"
                onPress={() => navigate('cliente-home-inizia', nextPlan ? `/schede/${nextPlan.id}` : '/workout')}
                icon={<Dumbbell size={18} color={colors.onMoss} />}
                size="lg"
                fullWidth
              />
            </View>
            <View style={[styles.workoutVisual, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]} pointerEvents="none">
              <View style={[styles.visualBeam, { backgroundColor: colors.moss }]} />
              <Dumbbell size={56} color={colors.moss} strokeWidth={1.8} />
            </View>
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
    gap: AppSpacing[5],
    minHeight: 186,
    overflow: 'hidden',
    padding: AppSpacing[5],
  },
  glowWrap: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  heroBeam: {
    borderRadius: 999,
    height: 190,
    opacity: 0.14,
    position: 'absolute',
    right: -70,
    top: 34,
    width: 190,
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
    borderRadius: 22,
    flexDirection: 'row',
    gap: 14,
    minHeight: 306,
    overflow: 'hidden',
    padding: AppSpacing[5],
  },
  workoutText: {
    flex: 1.15,
    gap: AppSpacing[3],
    justifyContent: 'center',
    minWidth: 0,
  },
  kicker: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
    letterSpacing: 0,
  },
  workoutTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 31,
  },
  workoutTitleCompact: {
    fontSize: 23,
    lineHeight: 29,
  },
  workoutMeta: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
    lineHeight: 19,
  },
  workoutVisual: {
    alignItems: 'center',
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    flex: 0.95,
    justifyContent: 'center',
    minHeight: 218,
    overflow: 'hidden',
  },
  visualBeam: {
    height: 250,
    opacity: 0.4,
    position: 'absolute',
    right: -6,
    top: -32,
    transform: [{ rotate: '27deg' }],
    width: 42,
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
