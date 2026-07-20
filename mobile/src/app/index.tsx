import { Image } from 'expo-image';
import { Redirect, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { getWorkoutCounter } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { Client, CoachClientConnectionStatus } from '@/types/client';

const COACH_HERO_IMAGE_DARK = require('../../assets/images/coach-dashboard-hero.png');
const COACH_HERO_IMAGE_LIGHT = require('../../assets/images/coach-dashboard-hero-light.png');

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors, scheme, cardShadow } = useAppTheme();
  const isLight = scheme === 'light';
  const heroImage = isLight ? COACH_HERO_IMAGE_LIGHT : COACH_HERO_IMAGE_DARK;
  const heroOverlayColor = isLight ? colors.surface : colors.background;
  const currentRole = useAuthStore((s) => s.currentRole);
  const { clients, loading: clientsLoading } = useCoachClients();
  const appointments = useAppointmentStore((s) => s.appointments);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);

  const activeClients = clients.filter((client) => getDashboardClientStatus(client) === 'active').length;
  const suspendedClients = clients.filter((client) => getDashboardClientStatus(client) === 'suspended').length;
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

  if (clientsLoading) {
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
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }, isLight && cardShadow]}>
        <Image source={heroImage} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ left: '70%', top: '42%' }} />
        {!isLight ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="coachHeroBottom" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={heroOverlayColor} stopOpacity="0" />
                <Stop offset="68%" stopColor={heroOverlayColor} stopOpacity="0" />
                <Stop offset="100%" stopColor={heroOverlayColor} stopOpacity="0.9" />
              </LinearGradient>
              <LinearGradient id="coachHeroLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={heroOverlayColor} stopOpacity="0.05" />
                <Stop offset="52%" stopColor={heroOverlayColor} stopOpacity="0" />
                <Stop offset="100%" stopColor={heroOverlayColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#coachHeroLeft)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#coachHeroBottom)" />
          </Svg>
        ) : null}

        <View style={styles.heroCopy}>
          <FitCoachLogo size="md" variant={isLight ? 'theme' : 'onDark'} />
          <Text style={[styles.heroTitle, { color: colors.ink }]}>
            Dashboard <Text style={{ color: colors.moss }}>Coach.</Text>
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.inkSoft }]}>Gestisci i tuoi clienti, schede e appuntamenti.</Text>
        </View>

        <View style={styles.kpiRow}>
          <KpiCard icon={Users} label="Clienti attivi" value={String(activeClients)} delta={`${suspendedClients}`} detail="sospesi" />
          <KpiCard icon={ClipboardList} label="Schede attive" value={String(activeWorkoutPlans)} delta="+0" detail="da rivedere" />
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
            const counter = getWorkoutCounter([], workoutPlans, client, client.id);
            const progress = counter.total > 0 ? Math.min(counter.completed / counter.total, 1) : 0;
            const status = getDashboardClientStatus(client);
            return (
              <ClientRow
                key={client.id}
                client={client}
                counter={`${counter.completed}/${counter.total}`}
                progress={progress}
                status={status}
                assignedPlans={counter.total}
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

      <Pressable
        onPress={() => navigate('dashboard-nuovo-cliente', '/clienti/new')}
        accessibilityRole="button"
        style={[
          styles.primaryAction,
          {
            backgroundColor: colors.moss,
            borderColor: withAlpha(colors.moss, isLight ? 0.48 : 0.82),
            shadowColor: colors.moss,
          },
        ]}>
        <View style={[styles.primaryIcon, { backgroundColor: colors.onMoss }]}>
          <Plus size={22} color={colors.moss} strokeWidth={2.6} />
        </View>
        <Text style={[styles.primaryActionLabel, { color: colors.onMoss }]}>Nuovo cliente</Text>
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
  const { colors, scheme, cardShadow } = useAppTheme();
  const isLight = scheme === 'light';

  return (
    <View
      style={[
        styles.kpiCard,
        {
          backgroundColor: isLight ? withAlpha(colors.surface, 0.94) : withAlpha(colors.surface, 0.88),
          borderColor: featured ? colors.moss : colors.border,
        },
        isLight && cardShadow,
        featured && {
          shadowColor: colors.moss,
          shadowOpacity: isLight ? 0.16 : 0.32,
          shadowRadius: isLight ? 10 : 12,
          elevation: 3,
        },
      ]}>
      <Icon size={20} color={colors.moss} strokeWidth={2.2} />
      <Text style={[styles.kpiLabel, { color: colors.inkSoft }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.kpiValue, { color: featured ? colors.moss : colors.ink }, featured && styles.kpiValueFeatured]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.kpiDelta, { color: colors.inkSoft }]} numberOfLines={2}>
        <Text style={{ color: colors.moss, fontWeight: '800' }}>{delta}</Text> {detail}
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
  status,
  assignedPlans,
  showBorder,
  onPress,
}: {
  client: Client;
  counter: string;
  progress: number;
  status: Exclude<CoachClientConnectionStatus, 'removed'>;
  assignedPlans: number;
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
          Stato cliente <Text style={{ color: status === 'suspended' ? colors.amber : colors.moss }}>{status === 'suspended' ? 'Sospeso' : 'Attivo'}</Text>
        </Text>
        <View style={styles.expiryRow}>
          <CalendarDays size={13} color={colors.inkFaint} />
          <Text style={[styles.expiryText, { color: colors.inkFaint }]} numberOfLines={1}>
            {assignedPlans === 1 ? '1 scheda assegnata' : `${assignedPlans} schede assegnate`}
          </Text>
        </View>
      </View>
      <View style={styles.clientProgress}>
        <Text style={[styles.clientCounter, { color: colors.ink }]}>{counter}</Text>
        <Text style={[styles.clientCounterLabel, { color: colors.inkSoft }]}>Schede</Text>
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

function getDashboardClientStatus(client: Client): Exclude<CoachClientConnectionStatus, 'removed'> {
  return client.connectionStatus === 'suspended' ? 'suspended' : 'active';
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 13,
    paddingHorizontal: AppSpacing[4],
  },
  hero: {
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 33,
  },
  heroSubtitle: {
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
  kpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
    minHeight: 22,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
    textAlign: 'center',
  },
  kpiValueFeatured: {
    fontSize: 18,
  },
  kpiDelta: {
    fontSize: 8,
    fontWeight: '500',
    lineHeight: 11,
    textAlign: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
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
    fontSize: 13,
    fontWeight: '700',
  },
  clientsCard: {
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
  clientCopy: {
    flex: 1,
    minWidth: 0,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  clientPlan: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  expiryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  expiryText: {
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
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  clientCounterLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  progressTrack: {
    borderRadius: AppRadius.pill,
    height: 7,
    marginTop: 7,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: AppRadius.pill,
    height: '100%',
    minWidth: 4,
  },
  agendaCard: {
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
    borderRadius: AppRadius.pill,
    height: 32,
    width: 4,
  },
  agendaTime: {
    fontSize: 16,
    fontWeight: '700',
    width: 48,
  },
  agendaCopy: {
    flex: 1,
    minWidth: 0,
  },
  agendaName: {
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
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
  },
  agendaStatus: {
    borderRadius: AppRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  agendaStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 54,
    shadowOpacity: 0.36,
    shadowRadius: 16,
  },
  primaryIcon: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  primaryActionLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  quickSectionTitle: {
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
    borderRadius: AppRadius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  quickActionTitle: {
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
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: AppFontSize.sm,
  },
});
