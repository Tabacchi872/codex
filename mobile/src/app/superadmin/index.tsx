import { router, type Href } from 'expo-router';
import {
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Crown,
  Euro,
  Headphones,
  Layers3,
  LifeBuoy,
  MessageSquare,
  Package,
  Shield,
  Users,
  WalletCards,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import type React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { FitCoachLogo } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminCoaches } from '@/hooks/use-superadmin-coaches';
import { DEMO_DATA_ENABLED } from '@/lib/demo-data';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { logSuperadminNavPress } from '@/lib/superadmin-navigation';
import { getSuperadminSupportConversations, useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AppBillingStatus, DemoPaymentEvent, SuperadminCoach, SuperadminNotification } from '@/types/superadmin';

type Tone = 'lime' | 'orange' | 'purple' | 'green' | 'red' | 'muted';

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export default function SuperadminDashboard() {
  const { colors } = useAppTheme();
  const { coaches, loading, error, reload } = useSuperadminCoaches();
  const paymentEvents = useSuperadminStore((s) => s.paymentEvents);
  const supportMessages = useSuperadminStore((s) => s.coachSupportMessages);
  const notifications = useSuperadminStore((s) => s.notifications);
  const localCoaches = useSuperadminStore((s) => s.coaches);
  const supportConversations = getSuperadminSupportConversations(localCoaches, supportMessages);

  const activeCoaches = coaches.filter((coach) => coach.billingStatus === 'active' && !coach.blocked).length;
  const activeSubscriptions = coaches.filter((coach) => coach.hasActivePackageSubscription).length;
  const unresolvedSupport = supportConversations.filter((conversation) => conversation.unreadCount > 0).length;
  const visiblePaymentEvents = DEMO_DATA_ENABLED ? paymentEvents : paymentEvents.filter((event) => event.provider !== 'demo' && event.provider !== 'demo_gateway');
  const monthRevenue = visiblePaymentEvents
    .filter((event) => event.status === 'succeeded' && isCurrentMonth(event.createdAt))
    .reduce((sum, event) => sum + (event.amount ?? 0), 0);
  const recentCoaches = [...coaches].sort(sortByRecentActivity).slice(0, 3);
  const recentActivities = buildRecentActivities(coaches, visiblePaymentEvents, notifications, supportConversations).slice(0, 4);

  function navigate(source: string, target: Href) {
    logSuperadminNavPress(source, target.toString());
    router.push(target);
  }

  return (
    <SuperadminShell
      title="Superadmin"
      hideHeader
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.moss} />}>
      <View style={styles.header}>
        <View style={styles.headerGlow} pointerEvents="none" />
        <View style={styles.headerText}>
          <FitCoachLogo size="sm" style={styles.headerLogo} />
          <Text style={[styles.headerTitle, { color: colors.ink }]}>Superadmin</Text>
          <Text style={[styles.headerSubtitle, { color: colors.inkSoft }]}>Controllo piattaforma</Text>
        </View>
        <Pressable
          onPress={() => navigate('superadmin-profile-notifiche', '/superadmin/notifications' as Href)}
          accessibilityRole="button"
          accessibilityLabel="Notifiche superadmin"
          style={styles.adminProfile}>
          <Shield size={23} color={colors.moss} />
          <Crown size={13} color={colors.moss} style={styles.crownIcon} />
          <View style={[styles.onlineDot, { backgroundColor: colors.moss }]} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Dati non disponibili</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={reload} style={[styles.retryButton, { borderColor: colors.moss }]} accessibilityRole="button">
            <Text style={[styles.retryLabel, { color: colors.moss }]}>Riprova</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroller}>
        {loading ? (
          [0, 1, 2, 3].map((item) => <SkeletonCard key={item} width={72} height={116} />)
        ) : (
          <>
            <KpiCard icon={Users} label="Coach attivi" value={String(activeCoaches)} tone="lime" onPress={() => navigate('superadmin-kpi-coach-attivi', '/superadmin/coaches?status=active' as Href)} />
            <KpiCard icon={CalendarDays} label="Abbonamenti attivi" value={formatCompact(activeSubscriptions)} tone="lime" onPress={() => navigate('superadmin-kpi-abbonamenti', '/superadmin/coaches?status=all' as Href)} />
            <KpiCard icon={Euro} label="Incassi mese" value={monthRevenue > 0 ? currencyFormatter.format(monthRevenue) : '-'} tone="green" onPress={() => navigate('superadmin-kpi-incassi', '/superadmin/payment-events' as Href)} />
            <KpiCard icon={MessageSquare} label="Ticket aperti" value={String(unresolvedSupport)} tone="orange" onPress={() => navigate('superadmin-kpi-ticket', '/superadmin/support' as Href)} />
          </>
        )}
      </ScrollView>

      <SectionHeader title="Coach recenti" action="Vedi tutti" onPress={() => navigate('superadmin-coach-tutti', '/superadmin/coaches' as Href)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachScroller}>
        {loading ? (
          [0, 1, 2].map((item) => <SkeletonCard key={item} width={96} height={150} />)
        ) : recentCoaches.length === 0 ? (
          <EmptyPanel title="Nessun coach registrato" detail="Quando Supabase restituira' coach reali, compariranno qui." />
        ) : (
          recentCoaches.map((coach) => (
            <CoachCard key={coach.id} coach={coach} onPress={() => navigate('superadmin-coach-card', `/superadmin/coaches/${coach.id}` as Href)} />
          ))
        )}
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Azioni rapide</Text>
      <View style={styles.quickGrid}>
        <QuickAction title="Piani" subtitle="Gestisci piani" icon={Layers3} onPress={() => navigate('superadmin-action-piani', '/superadmin/plans' as Href)} />
        <QuickAction title="Pacchetti" subtitle="Gestisci pacchetti" icon={Package} onPress={() => navigate('superadmin-action-pacchetti', '/superadmin/pacchetti' as Href)} />
        <QuickAction title="Pagamenti" subtitle="Transazioni" icon={CreditCard} onPress={() => navigate('superadmin-action-pagamenti', '/superadmin/payment-events' as Href)} />
        <QuickAction title="Supporto" subtitle="Ticket & help" icon={Headphones} onPress={() => navigate('superadmin-action-supporto', '/superadmin/support' as Href)} />
      </View>

      <SectionHeader title="Attivita' recenti" action="Vedi tutte" onPress={() => navigate('superadmin-attivita', '/superadmin/notifications' as Href)} />
      <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {loading ? (
          [0, 1, 2].map((item) => <ActivitySkeleton key={item} />)
        ) : recentActivities.length === 0 ? (
          <Text style={[styles.emptyActivity, { color: colors.inkSoft }]}>Nessuna attivita' recente disponibile.</Text>
        ) : (
          recentActivities.map((activity, index) => (
            <ActivityRow key={activity.id} item={activity} showBorder={index > 0} onPress={() => navigate(`superadmin-activity-${activity.id}`, activity.href)} />
          ))
        )}
      </View>
    </SuperadminShell>
  );
}

function KpiCard({ icon: Icon, label, value, tone, onPress }: { icon: LucideIcon; label: string; value: string; tone: Tone; onPress: () => void }) {
  const { colors } = useAppTheme();
  const palette = getTonePalette(colors, tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.kpiIcon, { backgroundColor: palette.soft }]}>
        <Icon size={19} color={palette.strong} strokeWidth={2.1} />
      </View>
      <Text style={[styles.kpiLabel, { color: colors.inkSoft }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={styles.kpiDeltaRow}>
        <ArrowUp size={11} color={palette.strong} />
        <Text style={[styles.kpiDelta, { color: palette.strong }]}>n/d</Text>
      </View>
      <Text style={[styles.kpiVs, { color: colors.inkFaint }]}>vs mese scorso</Text>
    </Pressable>
  );
}

function CoachCard({ coach, onPress }: { coach: SuperadminCoach; onPress: () => void }) {
  const { colors } = useAppTheme();
  const status = getStatusPresentation(colors, coach.billingStatus);
  const planName = coach.activePackageName ?? planCodeLabel(coach.planCode);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Apri dettaglio coach ${coach.name}`}
      style={[styles.coachCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ChevronRight size={19} color={colors.inkFaint} style={styles.cardChevron} />
      <View style={[styles.avatar, { backgroundColor: colors.surfaceSubtle }]}>
        <Text style={[styles.avatarInitial, { color: colors.ink }]}>{getInitials(coach.name)}</Text>
        <View style={[styles.avatarOnline, { backgroundColor: coach.blocked ? colors.inkFaint : colors.moss, borderColor: colors.surface }]} />
      </View>
      <Text style={[styles.coachName, { color: colors.ink }]} numberOfLines={1}>{coach.name}</Text>
      <Text style={[styles.coachPlan, { color: status.color }]} numberOfLines={1}>{planName}</Text>
      <Text style={[styles.coachMetaLabel, { color: colors.inkFaint }]}>Clienti</Text>
      <Text style={[styles.coachUsage, { color: colors.ink }]}>{formatUsage(coach.clientsUsed, coach.activePackageMaxClients)}</Text>
      <View style={[styles.coachDivider, { backgroundColor: colors.border }]} />
      <Text style={[styles.coachMetaLabel, { color: colors.inkFaint }]}>Abbonamento</Text>
      <View style={[styles.statusPill, { backgroundColor: status.soft }]}>
        {status.icon}
        <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
      </View>
    </Pressable>
  );
}

function QuickAction({ title, subtitle, icon: Icon, onPress }: { title: string; subtitle: string; icon: LucideIcon; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.quickIcon}>
        <Icon size={22} color={colors.moss} />
      </View>
      <ChevronRight size={18} color={colors.inkFaint} style={styles.quickChevron} />
      <Text style={[styles.quickTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.quickSubtitle, { color: colors.inkSoft }]}>{subtitle}</Text>
    </Pressable>
  );
}

type ActivityItem = {
  id: string;
  createdAt: string;
  title: string;
  detail: string;
  value: string;
  time: string;
  tone: Tone;
  icon: LucideIcon;
  href: Href;
};

function ActivityRow({ item, showBorder, onPress }: { item: ActivityItem; showBorder: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const palette = getTonePalette(colors, item.tone);
  const Icon = item.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.activityRow, showBorder && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.activityIcon, { backgroundColor: palette.soft }]}>
        <Icon size={19} color={palette.strong} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={[styles.activityTitle, { color: colors.ink }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.activityDetail, { color: colors.inkSoft }]} numberOfLines={1}>{item.detail}</Text>
      </View>
      <View style={styles.activityMeta}>
        <Text style={[styles.activityValue, { color: palette.strong }]} numberOfLines={1}>{item.value}</Text>
        <Text style={[styles.activityTime, { color: colors.inkFaint }]} numberOfLines={1}>{item.time}</Text>
      </View>
      <ChevronRight size={20} color={colors.inkFaint} />
    </Pressable>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      <Pressable onPress={onPress} hitSlop={6} style={styles.sectionAction}>
        <Text style={[styles.sectionLink, { color: colors.moss }]}>{action}</Text>
        <ChevronRight size={16} color={colors.moss} />
      </Pressable>
    </View>
  );
}

function SkeletonCard({ width, height }: { width: number; height: number }) {
  return <View style={[styles.skeletonCard, { width, height }]} />;
}

function ActivitySkeleton() {
  return (
    <View style={styles.activityRow}>
      <View style={styles.skeletonIcon} />
      <View style={styles.activityCopy}>
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLine} />
      </View>
    </View>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.emptyPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.emptyPanelTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyPanelDetail, { color: colors.inkSoft }]}>{detail}</Text>
    </View>
  );
}

function buildRecentActivities(
  coaches: SuperadminCoach[],
  paymentEvents: DemoPaymentEvent[],
  notifications: SuperadminNotification[],
  supportConversations: ReturnType<typeof getSuperadminSupportConversations>,
): ActivityItem[] {
  const paymentItems: ActivityItem[] = paymentEvents.map((event) => {
    const coach = coaches.find((item) => item.id === event.coachId);
    const failed = event.status === 'failed';
    return {
      id: `payment-${event.id}`,
      createdAt: event.createdAt,
      title: failed ? 'Pagamento fallito' : event.eventType === 'subscription_renewed' ? 'Pagamento ricevuto' : 'Evento pagamento',
      detail: `${coach?.name ?? 'Coach'} · ${getPaymentEventLabel(event.eventType)}`,
      value: event.amount === undefined ? '-' : currencyFormatter.format(event.amount),
      time: formatRelativeDate(event.createdAt),
      tone: failed ? 'orange' : 'green',
      icon: failed ? WalletCards : Euro,
      href: '/superadmin/payment-events' as Href,
    };
  });

  const supportItems: ActivityItem[] = supportConversations.map((conversation) => ({
    id: `support-${conversation.lastMessage.id}`,
    createdAt: conversation.lastMessage.createdAt,
    title: 'Nuovo ticket aperto',
    detail: `${conversation.coach.name} · ${conversation.lastMessage.text}`,
    value: `#${conversation.lastMessage.id.slice(-6).toUpperCase()}`,
    time: formatRelativeDate(conversation.lastMessage.createdAt),
    tone: 'purple',
    icon: LifeBuoy,
    href: `/superadmin/support/${conversation.coach.id}` as Href,
  }));

  const notificationItems: ActivityItem[] = notifications.map((notification) => ({
    id: `notification-${notification.id}`,
    createdAt: notification.createdAt,
    title: notification.title,
    detail: notification.description,
    value: notification.read ? 'Letta' : 'Nuova',
    time: formatRelativeDate(notification.createdAt),
    tone: notification.type === 'payment_past_due' ? 'orange' : notification.type === 'coach_support_message' ? 'purple' : 'lime',
    icon: notification.type === 'payment_past_due' ? CreditCard : notification.type === 'coach_support_message' ? MessageSquare : Shield,
    href: '/superadmin/notifications' as Href,
  }));

  return [...paymentItems, ...supportItems, ...notificationItems].sort((a, b) => getActivityTime(b) - getActivityTime(a));
}

function getActivityTime(item: ActivityItem) {
  const timestamp = new Date(item.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getPaymentEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    subscription_renewed: 'Piano rinnovato',
    trial_started: 'Prova attivata',
    invoice_payment_failed: 'Problema di incasso',
    access_blocked_manual: 'Account sospeso',
  };
  return labels[eventType] ?? 'Evento';
}

function getStatusPresentation(colors: ReturnType<typeof useAppTheme>['colors'], status: AppBillingStatus) {
  const label = getBillingStatusLabel(status);
  if (status === 'active') return { label: 'Attivo', color: colors.moss, soft: colors.mossSoft, icon: <CheckCircle2 size={12} color={colors.moss} /> };
  if (status === 'trial') return { label: 'Prova gratuita', color: '#B887FF', soft: '#2B1D42', icon: <Shield size={12} color="#B887FF" /> };
  if (status === 'past_due') return { label: 'In scadenza', color: colors.amber, soft: colors.amberSoft, icon: <CalendarDays size={12} color={colors.amber} /> };
  if (status === 'blocked') return { label: 'Sospeso', color: colors.inkFaint, soft: colors.surfaceSubtle, icon: <XCircle size={12} color={colors.inkFaint} /> };
  return { label, color: colors.rust, soft: colors.rustSoft, icon: <XCircle size={12} color={colors.rust} /> };
}

function getTonePalette(colors: ReturnType<typeof useAppTheme>['colors'], tone: Tone) {
  const palettes = {
    lime: { strong: colors.moss, soft: colors.mossSoft },
    green: { strong: colors.moss, soft: colors.mossSoft },
    orange: { strong: colors.amber, soft: colors.amberSoft },
    purple: { strong: '#A55CFF', soft: '#291946' },
    red: { strong: colors.rust, soft: colors.rustSoft },
    muted: { strong: colors.inkFaint, soft: colors.surfaceSubtle },
  } satisfies Record<Tone, { strong: string; soft: string }>;
  return palettes[tone];
}

function formatUsage(used: number, limit: number | null | undefined) {
  return `${used} / ${limit == null ? '∞' : limit}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('it-IT', { notation: value >= 1000 ? 'compact' : 'standard' }).format(value);
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Oggi, ${time}` : date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function sortByRecentActivity(a: SuperadminCoach, b: SuperadminCoach) {
  return new Date(b.periodStartsAt || 0).getTime() - new Date(a.periodStartsAt || 0).getTime();
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? 'C'}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function planCodeLabel(value: string) {
  if (value === 'starter') return 'Studio';
  if (value === 'pro') return 'Pro';
  if (value === 'free') return 'Free';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
    minHeight: 104,
    overflow: 'hidden',
    position: 'relative',
  },
  headerGlow: {
    backgroundColor: '#7BEA18',
    borderRadius: 180,
    height: 180,
    opacity: 0.1,
    position: 'absolute',
    right: -104,
    top: -82,
    transform: [{ rotate: '-24deg' }],
    width: 180,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  headerLogo: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  headerTitle: {
    color: '#F7F9FA',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 33,
  },
  headerSubtitle: {
    color: '#A8B0B7',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  adminProfile: {
    alignItems: 'center',
    borderColor: '#7BEA18',
    borderRadius: 999,
    borderWidth: 1.3,
    height: 50,
    justifyContent: 'center',
    shadowColor: '#7BEA18',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    width: 50,
  },
  crownIcon: {
    position: 'absolute',
    top: 20,
  },
  onlineDot: {
    borderColor: '#07100A',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 5,
    height: 12,
    position: 'absolute',
    right: 2,
    width: 12,
  },
  errorBox: {
    backgroundColor: '#180E10',
    borderColor: '#70323A',
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: AppSpacing[3],
  },
  errorTitle: {
    color: '#FF8F9D',
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: '#D5B7BC',
    fontSize: AppFontSize.sm + 2,
    lineHeight: 21,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  kpiScroller: {
    gap: 6,
    paddingRight: AppSpacing[2],
  },
  kpiCard: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    minHeight: 116,
    padding: 7,
    shadowColor: '#7BEA18',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: 72,
  },
  kpiIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  kpiLabel: {
    color: '#AEB7BE',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
    minHeight: 24,
  },
  kpiValue: {
    color: '#F7F9FA',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 22,
  },
  kpiDeltaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  kpiDelta: {
    fontSize: 12,
    fontWeight: '800',
  },
  kpiVs: {
    color: '#9AA4AE',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#F7F9FA',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '800',
  },
  coachScroller: {
    gap: 6,
    paddingRight: AppSpacing[2],
  },
  coachCard: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 150,
    padding: 9,
    position: 'relative',
    width: 96,
  },
  cardChevron: {
    position: 'absolute',
    right: 8,
    top: 22,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#22303A',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    marginBottom: 7,
    width: 36,
  },
  avatarInitial: {
    color: '#EDF4F0',
    fontSize: 13,
    fontWeight: '800',
  },
  avatarOnline: {
    borderColor: '#091018',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 1,
    height: 11,
    position: 'absolute',
    right: -1,
    width: 11,
  },
  coachName: {
    color: '#F7F9FA',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  coachPlan: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  coachMetaLabel: {
    color: '#9AA4AE',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 5,
  },
  coachUsage: {
    color: '#F7F9FA',
    fontSize: 12,
    fontWeight: '800',
  },
  coachDivider: {
    backgroundColor: '#1B2B35',
    height: StyleSheet.hairlineWidth,
    marginTop: 5,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    minHeight: 20,
    paddingHorizontal: 5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickAction: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 76,
    padding: 10,
    position: 'relative',
  },
  quickIcon: {
    marginBottom: 6,
  },
  quickChevron: {
    position: 'absolute',
    right: 8,
    top: 15,
  },
  quickTitle: {
    color: '#F7F9FA',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  quickSubtitle: {
    color: '#9AA4AE',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
  activityCard: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  activityBorder: {
    borderTopColor: '#172631',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  activityIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  activityCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: '#F7F9FA',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  activityDetail: {
    color: '#9AA4AE',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
  activityMeta: {
    alignItems: 'flex-end',
    maxWidth: 70,
  },
  activityValue: {
    fontSize: 11,
    fontWeight: '800',
  },
  activityTime: {
    color: '#9AA4AE',
    fontSize: 9,
    fontWeight: '600',
  },
  emptyActivity: {
    color: '#9AA4AE',
    fontSize: 14,
    fontWeight: '600',
    padding: AppSpacing[3],
  },
  emptyPanel: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 128,
    padding: AppSpacing[3],
    width: 220,
  },
  emptyPanelTitle: {
    color: '#F7F9FA',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyPanelDetail: {
    color: '#9AA4AE',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  skeletonCard: {
    backgroundColor: '#0C151C',
    borderColor: '#1B2B35',
    borderRadius: 18,
    borderWidth: 1,
    opacity: 0.78,
  },
  skeletonIcon: {
    backgroundColor: '#16242E',
    borderRadius: 999,
    height: 34,
    width: 34,
  },
  skeletonLineWide: {
    backgroundColor: '#16242E',
    borderRadius: 999,
    height: 12,
    marginBottom: 8,
    width: '74%',
  },
  skeletonLine: {
    backgroundColor: '#16242E',
    borderRadius: 999,
    height: 10,
    width: '52%',
  },
});
