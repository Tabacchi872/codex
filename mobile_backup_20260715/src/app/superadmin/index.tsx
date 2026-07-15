import { router, type Href } from 'expo-router';
import { CreditCard, LifeBuoy, Package, Shield, Ticket, Users } from 'lucide-react-native';
import type React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppCard, AppStatCard } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminCoaches } from '@/hooks/use-superadmin-coaches';
import { useTwoColumnGrid } from '@/hooks/use-two-column-grid';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { logSuperadminNavPress } from '@/lib/superadmin-navigation';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

export default function SuperadminDashboard() {
  const { colors } = useAppTheme();
  const { coaches } = useSuperadminCoaches();
  // Stessa griglia misurata della dashboard coach (fix BUG-020): niente
  // percentuali+minWidth+flexGrow, che a 320-412px causavano righe piu'
  // larghe del contenitore e la sovrapposizione con la card alert sotto.
  const { onLayout: handleGridLayout, itemStyle: gridItemStyle } = useTwoColumnGrid(AppSpacing[2]);

  const totalCoaches = coaches.length;
  const activeCoaches = coaches.filter((coach) => coach.billingStatus === 'active').length;
  const trialCoaches = coaches.filter((coach) => coach.billingStatus === 'trial').length;
  const pastDueCoaches = coaches.filter((coach) => coach.billingStatus === 'past_due').length;
  const blockedCoaches = coaches.filter((coach) => coach.billingStatus === 'blocked').length;
  const coachesWithActivePackage = coaches.filter((coach) => coach.hasActivePackageSubscription).length;
  const paymentAlerts = coaches.filter((coach) => coach.billingStatus === 'past_due');
  const recentCoaches = [...coaches].slice(0, 3);
  const activityItems = [
    ...paymentAlerts.slice(0, 2).map((coach) => ({ id: `payment-${coach.id}`, label: coach.name, detail: 'Pagamento scaduto', tone: 'rust' as const })),
    ...coaches
      .filter((coach) => coach.billingStatus === 'trial')
      .slice(0, 2)
      .map((coach) => ({ id: `trial-${coach.id}`, label: coach.name, detail: 'Coach in prova', tone: 'amber' as const })),
  ].slice(0, 4);

  function navigate(source: string, target: Href) {
    logSuperadminNavPress(source, target.toString());
    router.push(target);
  }

  return (
    <SuperadminShell title="Dashboard" description="Controllo amministrativo di coach, piani e abbonamenti app.">
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.moss }]}>FITCOACH PRO</Text>
          <Text style={[styles.heroTitle, { color: colors.ink }]}>Superadmin</Text>
          <Text style={[styles.heroSubtitle, { color: colors.inkSoft }]}>
            Stato piattaforma, coach e pacchetti in un'unica vista.
          </Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: colors.mossSoft, borderColor: colors.border }]}>
          <Shield size={36} color={colors.moss} />
        </View>
      </View>

      <View style={styles.grid} onLayout={handleGridLayout}>
        <AppStatCard
          size="sm"
          label="Coach totali"
          value={String(totalCoaches)}
          onPress={() => navigate('superadmin-stat-coach-totali', '/superadmin/coaches?status=all' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Coach attivi"
          value={String(activeCoaches)}
          accentColor={colors.moss}
          onPress={() => navigate('superadmin-stat-coach-attivi', '/superadmin/coaches?status=active' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="In prova"
          value={String(trialCoaches)}
          accentColor={colors.amber}
          onPress={() => navigate('superadmin-stat-coach-trial', '/superadmin/coaches?status=trial' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Pagamento scaduto"
          value={String(pastDueCoaches)}
          accentColor={colors.rust}
          onPress={() => navigate('superadmin-stat-coach-scaduti', '/superadmin/coaches?status=past_due' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Bloccati"
          value={String(blockedCoaches)}
          accentColor={colors.rust}
          onPress={() => navigate('superadmin-stat-coach-bloccati', '/superadmin/coaches?status=blocked' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Coach con pacchetto"
          value={String(coachesWithActivePackage)}
          onPress={() => navigate('superadmin-stat-pacchetti-attivi', '/superadmin/coaches?status=all' as Href)}
          style={gridItemStyle}
        />
      </View>

      <View style={styles.sectionPair}>
        <AppCard style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Coach recenti</Text>
            <Pressable onPress={() => navigate('superadmin-vedi-coach', '/superadmin/coaches' as Href)} hitSlop={6}>
              <Text style={[styles.sectionLink, { color: colors.moss }]}>Vedi coach</Text>
            </Pressable>
          </View>
          {recentCoaches.length === 0 ? (
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun coach disponibile.</Text>
          ) : (
            recentCoaches.map((coach, index) => (
              <Pressable
                key={coach.id}
                onPress={() => navigate('superadmin-coach-recente', `/superadmin/coaches/${coach.id}` as Href)}
                style={[styles.coachRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.avatarFallback, { backgroundColor: colors.mossSoft }]}>
                  <Text style={[styles.avatarText, { color: colors.moss }]}>{coach.name.trim().charAt(0).toUpperCase() || 'C'}</Text>
                </View>
                <View style={styles.alertText}>
                  <Text style={[styles.alertName, { color: colors.ink }]} numberOfLines={1}>
                    {coach.name}
                  </Text>
                  <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }} numberOfLines={1}>
                    {coach.hasActivePackageSubscription ? coach.activePackageName ?? 'Pacchetto attivo' : 'Nessun pacchetto attivo'}
                  </Text>
                </View>
                <AppBadge label={getBillingStatusLabel(coach.billingStatus)} tone={coach.billingStatus === 'active' ? 'moss' : coach.billingStatus === 'trial' ? 'amber' : 'rust'} />
              </Pressable>
            ))
          )}
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Azioni rapide</Text>
          <View style={styles.actionGrid}>
            <QuickAdminAction label="Coach" icon={<Users size={20} color={colors.moss} />} onPress={() => navigate('superadmin-quick-coach', '/superadmin/coaches' as Href)} />
            <QuickAdminAction label="Piani" icon={<Ticket size={20} color={colors.moss} />} onPress={() => navigate('superadmin-quick-piani', '/superadmin/plans' as Href)} />
            <QuickAdminAction label="Pacchetti" icon={<Package size={20} color={colors.moss} />} onPress={() => navigate('superadmin-quick-pacchetti', '/superadmin/pacchetti' as Href)} />
            <QuickAdminAction label="Pagamenti" icon={<CreditCard size={20} color={colors.moss} />} onPress={() => navigate('superadmin-quick-pagamenti', '/superadmin/payment-events' as Href)} />
            <QuickAdminAction label="Supporto" icon={<LifeBuoy size={20} color={colors.moss} />} onPress={() => navigate('superadmin-quick-supporto', '/superadmin/support' as Href)} />
          </View>
        </AppCard>
      </View>

      <AppCard style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Attività recenti</Text>
          <Pressable onPress={() => navigate('superadmin-vedi-coach', '/superadmin/coaches' as Href)} hitSlop={6}>
            <Text style={[styles.sectionLink, { color: colors.moss }]}>Vedi coach</Text>
          </Pressable>
        </View>
        {activityItems.length === 0 ? (
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessuna attività recente da segnalare.</Text>
        ) : (
          activityItems.map((item) => (
            <View key={item.id} style={[styles.alertRow, { borderColor: colors.border }]}>
              <View style={styles.alertText}>
                <Text style={[styles.alertName, { color: colors.ink }]}>{item.label}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>{item.detail}</Text>
              </View>
              <AppBadge label={item.tone === 'rust' ? 'Alert' : 'Trial'} tone={item.tone} />
            </View>
          ))
        )}
      </AppCard>
    </SuperadminShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  hero: {
    alignItems: 'center',
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: AppSpacing[5],
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: AppFontSize.xs,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  heroSubtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: AppSpacing[1],
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  sectionPair: {
    gap: AppSpacing[3],
  },
  card: {
    gap: AppSpacing[2],
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  sectionLink: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  alertRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
    paddingTop: AppSpacing[2],
  },
  alertText: {
    flex: 1,
    minWidth: 0,
  },
  alertName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  coachRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    minHeight: 62,
    paddingVertical: AppSpacing[2],
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: {
    fontSize: AppFontSize.base,
    fontWeight: '900',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  quickAction: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 48,
    minWidth: '46%',
    paddingHorizontal: AppSpacing[3],
  },
  quickActionLabel: {
    flexShrink: 1,
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
});

function QuickAdminAction({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} hitSlop={4} style={[styles.quickAction, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
      {icon}
      <Text style={[styles.quickActionLabel, { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
