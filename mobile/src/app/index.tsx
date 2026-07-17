import { Image } from 'expo-image';
import { Redirect, useRouter, type Href } from 'expo-router';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Headphones,
  Plus,
  Settings,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, FitCoachLogo, UserAvatar } from '@/components/ui';
import { YmoveAutoLinkBanner } from '@/components/ymove-autolink-banner';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { logCoachNavPress } from '@/lib/coach-navigation';
import { formatDayMonth } from '@/lib/format-date';
import { getWorkoutCounter } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { Client } from '@/types/client';
import {
  computeSubscriptionStatus,
  getCurrentSubscription,
  type ComputedSubscriptionStatus,
  type SubscriptionPackage,
} from '@/types/subscription';

const COACH_HERO_IMAGE = require('../../assets/images/coach-dashboard-hero.png');

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const { clients, loading: clientsLoading } = useCoachClients();
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const subscriptionsHydrated = useSubscriptionStore((s) => s.hasHydrated);
  const appointments = useAppointmentStore((s) => s.appointments);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);

  const statuses = clients.map((client) => getDashboardClientStatus(client, getCurrentSubscription(subscriptions, client.id)));
  const activeClients = statuses.filter((s) => s === 'active').length;
  const expiringClients = statuses.filter((s) => s === 'expiring').length;
  const expiredClients = statuses.filter((s) => s === 'expired').length;
  const nowKey = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments
    .filter((a) => a.status === 'scheduled' && a.date === nowKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 3);
  const recentClients = [...clients]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
  const activeWorkoutPlans = workoutPlans.filter((plan) => plan.sessionStatus !== 'completed' && plan.sessionStatus !== 'skipped').length;

  function navigate(source: string, target: string) {
    logCoachNavPress(source, target);
    router.push(target as Href);
  }

  if (currentRole === 'cliente') {
    return <Redirect href="/cliente-home" />;
  }

  if (clientsLoading || !subscriptionsHydrated) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: colors.inkSoft }]}>Caricamento...</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentStyle={styles.screenContent}>
      <View style={styles.hero}>
        <Image source={COACH_HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ left: '70%', top: '42%' }} />
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="coachHeroBottom" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#05090D" stopOpacity="0" />
              <Stop offset="70%" stopColor="#05090D" stopOpacity="0" />
              <Stop offset="100%" stopColor="#05090D" stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#coachHeroBottom)" />
        </Svg>

        <View style={styles.heroCopy}>
          <FitCoachLogo size="md" variant="onDark" />
          <Text style={styles.heroTitle}>
            Dashboard <Text style={styles.heroAccent}>Coach.</Text>
          </Text>
          <Text style={styles.heroSubtitle}>Gestisci i tuoi clienti, schede e appuntamenti.</Text>
        </View>

        <View style={styles.kpiRow}>
          <KpiCard icon={Users} label="Clienti attivi" value={String(activeClients)} delta={`+${expiringClients}`} detail="in scadenza" />
          <KpiCard icon={ClipboardList} label="Schede attive" value={String(activeWorkoutPlans)} delta={`+${expiredClients}`} detail="da rivedere" />
          <KpiCard icon={CheckCircle2} label="Check-in oggi" value={String(todayAppointments.length)} delta="+0" detail="vs ieri" />
          <KpiCard icon={TrendingUp} label="Fatturato" value="-" delta="n/d" detail="dato non disponibile" featured />
        </View>
      </View>

      <YmoveAutoLinkBanner />

      <SectionHeader title="Clienti recenti" action="Vedi tutti" onPress={() => navigate('dashboard-clienti-tutti', '/clienti')} />
      <View style={[styles.clientsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {recentClients.length === 0 ? (
          <EmptyState text="Nessun cliente collegato." />
        ) : (
          recentClients.map((client, index) => {
            const counter = getWorkoutCounter(subscriptions, workoutPlans, client, client.id);
            const progress = counter.total > 0 ? Math.min(counter.completed / counter.total, 1) : 0;
            const subscription = getCurrentSubscription(subscriptions, client.id);
            return (
              <ClientRow
                key={client.id}
                client={client}
                counter={`${counter.completed}/${counter.total}`}
                progress={progress}
                expiresAt={subscription?.endDate}
                showBorder={index > 0}
                onPress={() => navigate('dashboard-cliente-recente', `/clienti/${client.id}`)}
              />
            );
          })
        )}
      </View>

      <SectionHeader title="Agenda di oggi" action="Vedi calendario" onPress={() => navigate('dashboard-agenda-calendario', '/appuntamenti')} />
      <View style={[styles.agendaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {todayAppointments.length === 0 ? (
          <EmptyState text="Nessun appuntamento oggi." icon={CalendarDays} />
        ) : (
          todayAppointments.map((appointment, index) => {
            const appointmentClient = getClientById(clients, appointment.clientId);
            return (
              <AgendaRow
                key={appointment.id}
                time={appointment.startTime}
                title={appointmentClient ? clientFullName(appointmentClient) : 'Cliente'}
                detail={appointment.endTime ? `Fino alle ${appointment.endTime}` : 'Check-in'}
                client={appointmentClient}
                pending={index === todayAppointments.length - 1}
                showBorder={index > 0}
                onPress={() => navigate('dashboard-agenda-oggi', '/appuntamenti')}
              />
            );
          })
        )}
      </View>

      <Pressable onPress={() => navigate('dashboard-nuovo-cliente', '/clienti/new')} accessibilityRole="button" style={styles.primaryAction}>
        <View style={styles.primaryIcon}>
          <Plus size={22} color="#7BEA18" strokeWidth={2.6} />
        </View>
        <Text style={styles.primaryActionLabel}>Nuovo cliente</Text>
      </Pressable>

      <Text style={[styles.quickSectionTitle, { color: colors.ink }]}>Azioni rapide</Text>
      <View style={styles.quickGrid}>
        <QuickActionCard icon={CalendarDays} title="Nuovo appuntamento" onPress={() => navigate('dashboard-nuovo-appuntamento', '/appuntamenti/new')} />
        <QuickActionCard icon={ClipboardList} title="Assegna scheda" onPress={() => navigate('dashboard-assegna-scheda', '/schede/new')} />
        <QuickActionCard icon={Headphones} title="Supporto" onPress={() => navigate('dashboard-supporto', '/supporto')} />
        <QuickActionCard icon={Settings} title="Impostazioni" onPress={() => navigate('dashboard-impostazioni', '/impostazioni')} />
      </View>
    </AppScreen>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  detail,
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  detail: string;
  featured?: boolean;
}) {
  return (
    <View style={[styles.kpiCard, featured && styles.kpiCardFeatured]}>
      <Icon size={20} color="#7BEA18" strokeWidth={2.2} />
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.kpiValue, featured && styles.kpiValueFeatured]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiDelta} numberOfLines={2}>
        <Text style={styles.kpiDeltaStrong}>{delta}</Text> {detail}
      </Text>
    </View>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      <Pressable onPress={onPress} hitSlop={6} style={styles.sectionAction} accessibilityRole="button">
        <Text style={[styles.sectionActionText, { color: colors.moss }]}>{action}</Text>
        <ChevronRight size={18} color={colors.moss} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function QuickActionCard({ icon: Icon, title, onPress }: { icon: LucideIcon; title: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.quickActionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.quickActionIcon, { backgroundColor: colors.mossSoft }]}>
        <Icon size={18} color={colors.moss} strokeWidth={2.2} />
      </View>
      <Text style={[styles.quickActionTitle, { color: colors.ink }]} numberOfLines={2}>
        {title}
      </Text>
      <ChevronRight size={18} color={colors.inkFaint} strokeWidth={2.3} />
    </Pressable>
  );
}

function ClientRow({
  client,
  counter,
  progress,
  expiresAt,
  showBorder,
  onPress,
}: {
  client: Client;
  counter: string;
  progress: number;
  expiresAt?: string;
  showBorder: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.clientRow, showBorder && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <UserAvatar firstName={client.firstName} lastName={client.lastName} imageUrl={client.avatarUrl} preset={client.avatarPreset} size={48} />
      <View style={styles.clientCopy}>
        <Text style={[styles.clientName, { color: colors.ink }]} numberOfLines={1}>
          {clientFullName(client)}
        </Text>
        <Text style={[styles.clientPlan, { color: colors.inkSoft }]} numberOfLines={1}>
          Piano <Text style={{ color: colors.moss }}>{client.status === 'attivo' ? 'Premium' : client.status === 'in_pausa' ? 'Basic' : 'Scaduto'}</Text>
        </Text>
        <View style={styles.expiryRow}>
          <CalendarDays size={13} color={colors.inkFaint} />
          <Text style={[styles.expiryText, { color: colors.inkFaint }]} numberOfLines={1}>
            {expiresAt ? `Scade il ${formatDayMonth(expiresAt)}` : 'Scadenza non impostata'}
          </Text>
        </View>
      </View>
      <View style={styles.clientProgress}>
        <Text style={[styles.clientCounter, { color: colors.ink }]}>{counter}</Text>
        <Text style={[styles.clientCounterLabel, { color: colors.inkSoft }]}>Allenamenti</Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.moss }]} />
        </View>
      </View>
      <ChevronRight size={24} color={colors.inkFaint} strokeWidth={2.4} />
    </Pressable>
  );
}

function AgendaRow({
  time,
  title,
  detail,
  client,
  pending,
  showBorder,
  onPress,
}: {
  time: string;
  title: string;
  detail: string;
  client?: Client;
  pending: boolean;
  showBorder: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.agendaRow, showBorder && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.timeMarker, { backgroundColor: colors.moss }]} />
      <Text style={[styles.agendaTime, { color: colors.ink }]}>{time}</Text>
      <UserAvatar
        firstName={client?.firstName}
        lastName={client?.lastName}
        imageUrl={client?.avatarUrl}
        preset={client?.avatarPreset}
        size={36}
      />
      <View style={styles.agendaCopy}>
        <Text style={[styles.agendaName, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.agendaDetailRow}>
          <Dumbbell size={12} color={colors.inkFaint} />
          <Text style={[styles.agendaDetail, { color: colors.inkFaint }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>
      <View style={[styles.agendaStatus, { backgroundColor: pending ? colors.amberSoft : colors.mossSoft }]}>
        <Text style={[styles.agendaStatusText, { color: pending ? colors.amber : colors.moss }]}>{pending ? 'In attesa' : 'Confermato'}</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ text, icon: Icon = CalendarDays }: { text: string; icon?: LucideIcon }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.emptyState}>
      <Icon size={24} color={colors.inkFaint} />
      <Text style={[styles.emptyText, { color: colors.inkSoft }]}>{text}</Text>
    </View>
  );
}

function getDashboardClientStatus(client: Client, subscription: SubscriptionPackage | null): ComputedSubscriptionStatus {
  if (subscription) return computeSubscriptionStatus(subscription);
  if (client.status === 'attivo') return 'active';
  if (client.status === 'in_pausa') return 'expiring';
  return 'expired';
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 13,
    paddingHorizontal: AppSpacing[4],
  },
  hero: {
    borderColor: '#1B2B35',
    borderRadius: 30,
    borderWidth: 1,
    height: 322,
    overflow: 'hidden',
    padding: 19,
    position: 'relative',
  },
  heroCopy: {
    gap: 10,
    maxWidth: '70%',
    minWidth: 0,
  },
  heroTitle: {
    color: '#F7F9FA',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 33,
  },
  heroAccent: {
    color: '#7BEA18',
  },
  heroSubtitle: {
    color: '#C6CCD2',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  kpiRow: {
    bottom: 14,
    flexDirection: 'row',
    gap: 6,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  kpiCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 21, 28, 0.88)',
    borderColor: '#24313A',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 92,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  kpiCardFeatured: {
    borderColor: '#7BEA18',
    shadowColor: '#7BEA18',
    shadowOpacity: 0.32,
    shadowRadius: 12,
  },
  kpiLabel: {
    color: '#C6CCD2',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
    minHeight: 22,
    textAlign: 'center',
  },
  kpiValue: {
    color: '#F7F9FA',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
    textAlign: 'center',
  },
  kpiValueFeatured: {
    color: '#7BEA18',
    fontSize: 18,
  },
  kpiDelta: {
    color: '#C6CCD2',
    fontSize: 8,
    fontWeight: '500',
    lineHeight: 11,
    textAlign: 'center',
  },
  kpiDeltaStrong: {
    color: '#7BEA18',
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#F7F9FA',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  sectionActionText: {
    color: '#7BEA18',
    fontSize: 13,
    fontWeight: '700',
  },
  clientsCard: {
    backgroundColor: 'rgba(10, 18, 24, 0.96)',
    borderColor: '#24313A',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 94,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowBorder: {
    borderTopColor: '#172631',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  clientCopy: {
    flex: 1,
    minWidth: 0,
  },
  clientName: {
    color: '#F7F9FA',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  clientPlan: {
    color: '#C6CCD2',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  limeText: {
    color: '#7BEA18',
  },
  expiryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  expiryText: {
    color: '#A8B0B7',
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
  },
  clientProgress: {
    alignItems: 'flex-end',
    gap: 2,
    width: 92,
  },
  clientCounter: {
    color: '#F7F9FA',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  clientCounterLabel: {
    color: '#A8B0B7',
    fontSize: 10,
    fontWeight: '500',
  },
  progressTrack: {
    backgroundColor: '#1F2A31',
    borderRadius: AppRadius.pill,
    height: 7,
    marginTop: 7,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    backgroundColor: '#7BEA18',
    borderRadius: AppRadius.pill,
    height: '100%',
    minWidth: 4,
  },
  agendaCard: {
    backgroundColor: 'rgba(10, 18, 24, 0.96)',
    borderColor: '#24313A',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  agendaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timeMarker: {
    backgroundColor: '#7BEA18',
    borderRadius: AppRadius.pill,
    height: 32,
    width: 4,
  },
  agendaTime: {
    color: '#F7F9FA',
    fontSize: 16,
    fontWeight: '700',
    width: 48,
  },
  agendaCopy: {
    flex: 1,
    minWidth: 0,
  },
  agendaName: {
    color: '#F7F9FA',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  agendaDetailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  agendaDetail: {
    color: '#A8B0B7',
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
  },
  agendaStatus: {
    backgroundColor: '#173516',
    borderRadius: AppRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  agendaStatusPending: {
    backgroundColor: '#3A2710',
  },
  agendaStatusText: {
    color: '#7BEA18',
    fontSize: 10,
    fontWeight: '800',
  },
  agendaStatusTextPending: {
    color: '#F2A43A',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: '#7BEA18',
    borderColor: '#B8FF4F',
    borderRadius: 22,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 54,
    shadowColor: '#7BEA18',
    shadowOpacity: 0.36,
    shadowRadius: 16,
  },
  primaryIcon: {
    alignItems: 'center',
    backgroundColor: '#07110B',
    borderRadius: AppRadius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  primaryActionLabel: {
    color: '#07110B',
    fontSize: 16,
    fontWeight: '800',
  },
  quickSectionTitle: {
    color: '#F7F9FA',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 2,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 18, 24, 0.96)',
    borderColor: '#24313A',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '48%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  quickActionIcon: {
    alignItems: 'center',
    backgroundColor: '#173516',
    borderRadius: AppRadius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  quickActionTitle: {
    color: '#F7F9FA',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
    minWidth: 0,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    minHeight: 108,
  },
  emptyText: {
    color: '#A8B0B7',
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#A8B0B7',
    fontSize: AppFontSize.sm,
  },
});
