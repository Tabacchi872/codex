import { Link, router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';

export default function SuperadminDashboard() {
  const theme = useTheme();
  const coaches = useSuperadminStore((s) => s.coaches);
  const plans = useSuperadminStore((s) => s.plans);

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
      <View style={styles.grid}>
        <MetricCard label="Coach totali" value={String(totalCoaches)} onPress={() => router.push('/superadmin/coaches?status=all' as Href)} />
        <MetricCard label="Coach attivi" value={String(activeCoaches)} tone="active" onPress={() => router.push('/superadmin/coaches?status=active' as Href)} />
        <MetricCard label="In prova" value={String(trialCoaches)} tone="warning" onPress={() => router.push('/superadmin/coaches?status=trial' as Href)} />
        <MetricCard label="Pagamento scaduto" value={String(pastDueCoaches)} tone="expired" onPress={() => router.push('/superadmin/coaches?status=past_due' as Href)} />
        <MetricCard label="Bloccati" value={String(blockedCoaches)} tone="expired" onPress={() => router.push('/superadmin/coaches?status=blocked' as Href)} />
        <MetricCard label="Ricavi mensili stimati" value={`EUR ${monthlyRecurringRevenue}`} onPress={() => router.push('/superadmin/payment-events' as Href)} />
      </View>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold">Alert pagamento scaduto</ThemedText>
          <Link href={'/superadmin/coaches' as Href}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Vedi coach
            </ThemedText>
          </Link>
        </View>
        {paymentAlerts.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nessun coach con pagamento scaduto.
          </ThemedText>
        ) : (
          paymentAlerts.map((coach) => (
            <View key={coach.id} style={[styles.alertRow, { borderColor: theme.border }]}>
              <View style={styles.alertText}>
                <ThemedText type="smallBold">{coach.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {coach.email}
                </ThemedText>
              </View>
              <ThemedText
                type="smallBold"
                style={[
                  styles.badge,
                  { backgroundColor: theme.dangerSoft, color: theme.statusExpired, borderColor: theme.statusExpired },
                ]}>
                {getBillingStatusLabel(coach.billingStatus)}
              </ThemedText>
            </View>
          ))
        )}
      </Card>
    </SuperadminShell>
  );
}

function MetricCard({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  tone?: 'active' | 'warning' | 'expired';
  onPress: () => void;
}) {
  const theme = useTheme();
  const color =
    tone === 'active' ? theme.statusActive : tone === 'warning' ? theme.statusWarning : tone === 'expired' ? theme.statusExpired : theme.text;

  return (
    <Pressable onPress={onPress} hitSlop={4} style={styles.metricPressable}>
      <Card style={styles.metric}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="subtitle" style={[styles.metricValue, { color }]}>
          {value}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metricPressable: {
    flexBasis: 150,
    flexGrow: 1,
    minWidth: 0,
  },
  metric: {
    justifyContent: 'space-between',
    minHeight: 110,
  },
  metricValue: {
    fontSize: 28,
    lineHeight: 34,
  },
  card: {
    gap: Spacing.two,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  alertRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  alertText: {
    flex: 1,
  },
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
