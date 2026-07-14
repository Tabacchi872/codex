import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppCard, AppStatCard } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminCoaches } from '@/hooks/use-superadmin-coaches';
import { useTwoColumnGrid } from '@/hooks/use-two-column-grid';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

export default function SuperadminDashboard() {
  const { colors } = useAppTheme();
  const { coaches } = useSuperadminCoaches();
  const plans = useSuperadminStore((s) => s.plans);
  // Stessa griglia misurata della dashboard coach (fix BUG-020): niente
  // percentuali+minWidth+flexGrow, che a 320-412px causavano righe piu'
  // larghe del contenitore e la sovrapposizione con la card alert sotto.
  const { onLayout: handleGridLayout, itemStyle: gridItemStyle } = useTwoColumnGrid(AppSpacing[2]);

  const totalCoaches = coaches.length;
  const activeCoaches = coaches.filter((coach) => coach.billingStatus === 'active').length;
  const trialCoaches = coaches.filter((coach) => coach.billingStatus === 'trial').length;
  const pastDueCoaches = coaches.filter((coach) => coach.billingStatus === 'past_due').length;
  const blockedCoaches = coaches.filter((coach) => coach.billingStatus === 'blocked').length;
  const monthlyRecurringRevenue = coaches.reduce((total, coach) => {
    if (coach.billingStatus !== 'active') return total;
    return total + (plans.find((plan) => plan.code === coach.planCode)?.monthlyPrice ?? 0);
  }, 0);
  const paymentAlerts = coaches.filter((coach) => coach.billingStatus === 'past_due');

  return (
    <SuperadminShell title="Dashboard" description="Controllo amministrativo di coach, piani e abbonamenti app.">
      <View style={styles.grid} onLayout={handleGridLayout}>
        <AppStatCard
          size="sm"
          label="Coach totali"
          value={String(totalCoaches)}
          onPress={() => router.push('/superadmin/coaches?status=all' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Coach attivi"
          value={String(activeCoaches)}
          accentColor={colors.moss}
          onPress={() => router.push('/superadmin/coaches?status=active' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="In prova"
          value={String(trialCoaches)}
          accentColor={colors.amber}
          onPress={() => router.push('/superadmin/coaches?status=trial' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Pagamento scaduto"
          value={String(pastDueCoaches)}
          accentColor={colors.rust}
          onPress={() => router.push('/superadmin/coaches?status=past_due' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Bloccati"
          value={String(blockedCoaches)}
          accentColor={colors.rust}
          onPress={() => router.push('/superadmin/coaches?status=blocked' as Href)}
          style={gridItemStyle}
        />
        <AppStatCard
          size="sm"
          label="Ricavi mensili stimati"
          value={`EUR ${monthlyRecurringRevenue}`}
          onPress={() => router.push('/superadmin/payment-events' as Href)}
          style={gridItemStyle}
        />
      </View>

      <AppCard style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Alert pagamento scaduto</Text>
          <Pressable onPress={() => router.push('/superadmin/coaches' as Href)} hitSlop={6}>
            <Text style={[styles.sectionLink, { color: colors.moss }]}>Vedi coach</Text>
          </Pressable>
        </View>
        {paymentAlerts.length === 0 ? (
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun coach con pagamento scaduto.</Text>
        ) : (
          paymentAlerts.map((coach) => (
            <View key={coach.id} style={[styles.alertRow, { borderColor: colors.border }]}>
              <View style={styles.alertText}>
                <Text style={[styles.alertName, { color: colors.ink }]}>{coach.name}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>{coach.email}</Text>
              </View>
              <AppBadge label={getBillingStatusLabel(coach.billingStatus)} tone="rust" />
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
  },
  alertName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
});
