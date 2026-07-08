import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { AppBillingStatus, DemoCoachAccount } from '@/types/superadmin';

export default function SuperadminCoaches() {
  const coaches = useSuperadminStore((s) => s.coaches);
  const plans = useSuperadminStore((s) => s.plans);

  return (
    <SuperadminShell title="Coach" description="Gestione amministrativa di coach, stato pagamento e abbonamento app.">
      <Link href="/superadmin/coaches/new" asChild>
        <Pressable style={styles.primaryButton}>
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            + Aggiungi coach
          </ThemedText>
        </Pressable>
      </Link>

      {coaches.map((coach) => {
        const plan = plans.find((item) => item.code === coach.planCode);
        const clientLimit = coach.clientLimitOverride ?? plan?.clientLimit ?? null;
        return (
          <Pressable
            key={coach.id}
            style={styles.coachLink}
            onPress={() => router.push({ pathname: '/superadmin/coaches/[id]', params: { id: coach.id } })}>
            <CoachCard coach={coach} planName={plan?.name ?? coach.planCode} clientLimit={clientLimit} />
          </Pressable>
        );
      })}
    </SuperadminShell>
  );
}

function CoachCard({
  coach,
  planName,
  clientLimit,
}: {
  coach: DemoCoachAccount;
  planName: string;
  clientLimit: number | null;
}) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.coachIdentity}>
          <ThemedText type="smallBold">{coach.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {coach.email}
          </ThemedText>
        </View>
        <StatusBadge status={coach.billingStatus} />
      </View>

      <View style={styles.dataGrid}>
        <Field label="Piano attivo" value={planName} />
        <Field label="Clienti usati" value={String(coach.clientsUsed)} />
        <Field label="Limite clienti" value={clientLimit === null ? 'Illimitato' : String(clientLimit)} />
        <Field label="Scadenza periodo" value={coach.periodEndsAt} />
      </View>

      <View style={[styles.footer, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Apri dettaglio e modifica
        </ThemedText>
      </View>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function StatusBadge({ status }: { status: AppBillingStatus }) {
  const theme = useTheme();
  const color =
    status === 'active'
      ? theme.statusActive
      : status === 'trial'
        ? theme.statusWarning
        : status === 'canceled'
          ? theme.disabled
          : theme.statusExpired;

  return (
    <ThemedText type="smallBold" style={[styles.badge, { borderColor: color, color }]}>
      {getBillingStatusLabel(status)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  coachLink: {
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#C90018',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  coachIdentity: {
    flex: 1,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  field: {
    flexBasis: 130,
    flexGrow: 1,
    gap: Spacing.half,
  },
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
});
