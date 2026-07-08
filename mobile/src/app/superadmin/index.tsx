import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const demoMrr = coaches.reduce((total, coach) => {
    if (coach.billingStatus !== 'active') return total;
    return total + (plans.find((plan) => plan.code === coach.planCode)?.monthlyPrice ?? 0);
  }, 0);
  const paymentAlerts = coaches.filter((coach) => coach.billingStatus === 'past_due' || coach.billingStatus === 'blocked');

  return (
    <SuperadminShell
      title="Dashboard"
      description="Controllo demo locale di coach, piani e abbonamenti app. Nessun provider reale collegato.">
      <View style={styles.grid}>
        <MetricCard label="Coach totali" value={String(totalCoaches)} />
        <MetricCard label="Coach attivi" value={String(activeCoaches)} tone="active" />
        <MetricCard label="Trial" value={String(trialCoaches)} tone="warning" />
        <MetricCard label="Past due" value={String(pastDueCoaches)} tone="expired" />
        <MetricCard label="Bloccati" value={String(blockedCoaches)} tone="expired" />
        <MetricCard label="MRR demo" value={`EUR ${demoMrr}`} />
      </View>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold">Alert pagamento scaduto</ThemedText>
          <Link href="/superadmin/coaches">
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Vedi coach
            </ThemedText>
          </Link>
        </View>
        {paymentAlerts.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nessun coach con pagamento scaduto nella demo.
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
                {coach.billingStatus}
              </ThemedText>
            </View>
          ))
        )}
      </Card>
    </SuperadminShell>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'active' | 'warning' | 'expired' }) {
  const theme = useTheme();
  const color =
    tone === 'active' ? theme.statusActive : tone === 'warning' ? theme.statusWarning : tone === 'expired' ? theme.statusExpired : theme.text;

  return (
    <Card style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={[styles.metricValue, { color }]}>
        {value}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metric: {
    flexBasis: 150,
    flexGrow: 1,
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
