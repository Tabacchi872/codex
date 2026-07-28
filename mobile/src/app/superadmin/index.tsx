import { router, type Href } from 'expo-router';
import {
  ChevronRight,
  CreditCard,
  Crown,
  Headphones,
  Info,
  Layers3,
  PackageCheck,
  Shield,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { FitCoachLogo } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { logSuperadminNavPress } from '@/lib/superadmin-navigation';
import { getSuperadminDashboard, type SuperadminDashboardData } from '@/lib/superadmin-platform-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

type Tone = 'lime' | 'orange' | 'green' | 'muted';

export default function SuperadminDashboard() {
  const { colors } = useAppTheme();
  const [data, setData] = useState<SuperadminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getSuperadminDashboard();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function navigate(source: string, target: Href) {
    logSuperadminNavPress(source, target.toString());
    router.push(target);
  }

  const kpis = data?.kpis;

  return (
    <SuperadminShell
      title="Superadmin"
      hideHeader
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.moss} />}>
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
          <Pressable onPress={load} style={[styles.retryButton, { borderColor: colors.moss }]} accessibilityRole="button">
            <Text style={[styles.retryLabel, { color: colors.moss }]}>Riprova</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.kpiGrid}>
        {loading || !kpis ? (
          [0, 1, 2, 3, 4, 5, 6, 7].map((item) => <SkeletonCard key={item} />)
        ) : (
          <>
            <KpiCard icon={Users} label="Coach attivi" value={String(kpis.activeCoaches)} tone="lime" onPress={() => navigate('superadmin-kpi-coach-attivi', '/superadmin/coaches?status=active' as Href)} />
            <KpiCard icon={UserRound} label="Clienti totali" value={String(kpis.totalClients)} tone="lime" onPress={() => navigate('superadmin-kpi-clienti', '/superadmin/clients' as Href)} />
            <KpiCard icon={UserRound} label="Clienti senza coach" value={String(kpis.clientsWithoutCoach)} tone="orange" onPress={() => navigate('superadmin-kpi-clienti-senza-coach', '/superadmin/clients' as Href)} />
            <KpiCard icon={PackageCheck} label="Client Pro attivi" value={String(kpis.clientProActive)} tone="green" onPress={() => navigate('superadmin-kpi-client-pro-attivi', '/superadmin/client-pro' as Href)} />
            <KpiCard icon={PackageCheck} label="Client Pro scaduti" value={String(kpis.clientProExpired)} tone="orange" onPress={() => navigate('superadmin-kpi-client-pro-scaduti', '/superadmin/client-pro' as Href)} />
            <KpiCard icon={Layers3} label="Programmi automatici" value={String(kpis.activeAutoPrograms)} tone="lime" onPress={() => navigate('superadmin-kpi-programmi', '/superadmin/clients' as Href)} />
            <KpiCard icon={Layers3} label="Revisioni da controllare" value={String(kpis.reviewsToCheck)} tone="orange" onPress={() => navigate('superadmin-kpi-revisioni', '/superadmin/clients' as Href)} />
            <KpiCard icon={Headphones} label="Ticket aperti" value={String(kpis.openTickets)} tone="muted" onPress={() => navigate('superadmin-kpi-ticket', '/superadmin/support' as Href)} />
          </>
        )}
      </View>

      <RecentSection
        title="Coach recenti"
        items={data?.recentCoaches ?? []}
        loading={loading}
        hrefBase="/superadmin/coaches"
        onSeeAll={() => navigate('superadmin-coach-tutti', '/superadmin/coaches' as Href)}
      />
      <RecentSection
        title="Clienti recenti"
        items={data?.recentClients ?? []}
        loading={loading}
        hrefBase="/superadmin/clients"
        onSeeAll={() => navigate('superadmin-clienti-tutti', '/superadmin/clients' as Href)}
      />

      {kpis ? (
        <View style={[styles.revenueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.revenueIcon, { backgroundColor: colors.mossSoft }]}>
            <Info size={17} color={colors.moss} />
          </View>
          <View style={styles.revenueCopy}>
            <Text style={[styles.revenueTitle, { color: colors.ink }]}>Dati economici</Text>
            <Text style={[styles.revenueText, { color: colors.inkSoft }]} numberOfLines={showRevenueDetails ? undefined : 2}>
              Incassi coach mese: {formatMoney(kpis.coachMonthRevenue, null)}. Incassi Client Pro reali: {formatMoney(kpis.clientProMonthRevenue, kpis.clientProMonthRevenueCurrency)}. {data?.notes?.coachRevenue ?? ''} {data?.notes?.clientProRevenue ?? ''}
            </Text>
          </View>
          <Pressable onPress={() => setShowRevenueDetails((value) => !value)} hitSlop={6} style={styles.detailButton}>
            <Text style={[styles.detailButtonText, { color: colors.moss }]}>{showRevenueDetails ? 'Chiudi' : 'Dettagli'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Azioni rapide</Text>
      <View style={styles.quickGrid}>
        <QuickAction title="Coach" subtitle="Coach registrati" icon={Users} onPress={() => navigate('superadmin-action-coach', '/superadmin/coaches' as Href)} />
        <QuickAction title="Clienti" subtitle="Clienti registrati" icon={UserRound} onPress={() => navigate('superadmin-action-clienti', '/superadmin/clients' as Href)} />
        <QuickAction title="Piani Coach" subtitle="Prezzi e limiti" icon={Layers3} onPress={() => navigate('superadmin-action-piani-coach', '/superadmin/plans' as Href)} />
        <QuickAction title="Client Pro" subtitle="RevenueCat clienti" icon={PackageCheck} onPress={() => navigate('superadmin-action-client-pro', '/superadmin/client-pro' as Href)} />
        <QuickAction title="Pagamenti" subtitle="Coach e Client Pro" icon={CreditCard} onPress={() => navigate('superadmin-action-pagamenti', '/superadmin/payment-events' as Href)} />
        <QuickAction title="Supporto" subtitle="Ticket & help" icon={Headphones} onPress={() => navigate('superadmin-action-supporto', '/superadmin/support' as Href)} />
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
        <Icon size={18} color={palette.strong} strokeWidth={2.1} />
      </View>
      <View style={styles.kpiCopy}>
        <Text style={[styles.kpiLabel, { color: colors.inkSoft }]} numberOfLines={2}>{label}</Text>
        <Text style={[styles.kpiValue, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      </View>
    </Pressable>
  );
}

function RecentSection({
  title,
  items,
  loading,
  hrefBase,
  onSeeAll,
}: {
  title: string;
  items: Array<{ id: string; name: string; email: string; createdAt: string }>;
  loading: boolean;
  hrefBase: '/superadmin/coaches' | '/superadmin/clients';
  onSeeAll: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <>
      <SectionHeader title={title} action="Vedi tutti" onPress={onSeeAll} />
      <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {loading ? (
          [0, 1, 2].map((item) => <ActivitySkeleton key={item} />)
        ) : items.length === 0 ? (
          <Text style={[styles.emptyActivity, { color: colors.inkSoft }]}>Nessun dato recente disponibile.</Text>
        ) : (
          items.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`${hrefBase}/${item.id}` as Href)}
              accessibilityRole="button"
              style={[styles.activityRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={[styles.avatar, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.avatarInitial, { color: colors.ink }]}>{getInitials(item.name || item.email)}</Text>
              </View>
              <View style={styles.activityCopy}>
                <Text style={[styles.activityTitle, { color: colors.ink }]} numberOfLines={1}>{item.name || 'Senza nome'}</Text>
                <Text style={[styles.activityDetail, { color: colors.inkSoft }]} numberOfLines={1}>{item.email}</Text>
              </View>
              <View style={styles.activityMeta}>
                <Text style={[styles.activityTime, { color: colors.inkFaint }]} numberOfLines={1}>{formatRelativeDate(item.createdAt)}</Text>
              </View>
              <ChevronRight size={20} color={colors.inkFaint} />
            </Pressable>
          ))
        )}
      </View>
    </>
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
      <Text style={[styles.quickTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
      <Text style={[styles.quickSubtitle, { color: colors.inkSoft }]} numberOfLines={1}>{subtitle}</Text>
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

function SkeletonCard() {
  return <View style={styles.skeletonCard} />;
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

function getTonePalette(colors: ReturnType<typeof useAppTheme>['colors'], tone: Tone) {
  const palettes = {
    lime: { strong: colors.moss, soft: colors.mossSoft },
    green: { strong: colors.moss, soft: colors.mossSoft },
    orange: { strong: colors.amber, soft: colors.amberSoft },
    muted: { strong: colors.inkFaint, soft: colors.surfaceSubtle },
  } satisfies Record<Tone, { strong: string; soft: string }>;
  return palettes[tone];
}

function formatMoney(value: number | null, currency: string | null) {
  if (value == null || !currency) return 'n/d';
  return `${currency} ${Number(value).toFixed(2)}`;
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Oggi, ${time}` : date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? 'C'}${parts[1]?.[0] ?? ''}`.toUpperCase();
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    width: '100%',
  },
  kpiCard: {
    backgroundColor: '#091018',
    borderColor: '#1B2B35',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 66,
    maxWidth: '48%',
    paddingHorizontal: 9,
    paddingVertical: 8,
    shadowColor: '#7BEA18',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: '48%',
  },
  kpiIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  kpiCopy: {
    flex: 1,
    minWidth: 0,
  },
  kpiLabel: {
    color: '#AEB7BE',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
  },
  kpiValue: {
    color: '#F7F9FA',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 2,
  },
  revenueCard: {
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  revenueIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  revenueCopy: {
    flex: 1,
    minWidth: 0,
  },
  revenueTitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  revenueText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  detailButton: {
    paddingTop: 2,
  },
  detailButtonText: {
    fontSize: 12,
    fontWeight: '800',
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
  avatar: {
    alignItems: 'center',
    backgroundColor: '#22303A',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatarInitial: {
    color: '#EDF4F0',
    fontSize: 12,
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
    minHeight: 70,
    minWidth: 150,
    padding: 9,
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
  skeletonCard: {
    backgroundColor: '#0C151C',
    borderColor: '#1B2B35',
    borderRadius: 14,
    borderWidth: 1,
    height: 66,
    maxWidth: '48%',
    opacity: 0.78,
    width: '48%',
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
