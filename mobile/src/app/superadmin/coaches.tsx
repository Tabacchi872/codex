import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { AppBillingStatus, AppPlanCode, DemoCoachAccount } from '@/types/superadmin';

const PLAN_ORDER: AppPlanCode[] = ['free', 'starter', 'pro', 'studio', 'unlimited'];

export default function SuperadminCoaches() {
  const coaches = useSuperadminStore((s) => s.coaches);
  const plans = useSuperadminStore((s) => s.plans);
  const toggleCoachBlocked = useSuperadminStore((s) => s.toggleCoachBlocked);
  const changeCoachPlan = useSuperadminStore((s) => s.changeCoachPlan);
  const [expandedCoachId, setExpandedCoachId] = useState<string | null>(null);

  function getNextPlanCode(currentPlanCode: AppPlanCode) {
    const currentIndex = PLAN_ORDER.indexOf(currentPlanCode);
    return PLAN_ORDER[(currentIndex + 1) % PLAN_ORDER.length];
  }

  return (
    <SuperadminShell title="Coach" description="Lista demo dei coach con stato pagamento, piano e azioni manuali locali.">
      {coaches.map((coach) => {
        const plan = plans.find((item) => item.code === coach.planCode);
        const isExpanded = expandedCoachId === coach.id;
        return (
          <CoachCard
            key={coach.id}
            coach={coach}
            planName={plan?.name ?? coach.planCode}
            clientLimit={plan?.clientLimit ?? null}
            isExpanded={isExpanded}
            onToggleBlocked={() => toggleCoachBlocked(coach.id)}
            onChangePlan={() => changeCoachPlan(coach.id, getNextPlanCode(coach.planCode))}
            onToggleDetails={() => setExpandedCoachId(isExpanded ? null : coach.id)}
          />
        );
      })}
    </SuperadminShell>
  );
}

function CoachCard({
  coach,
  planName,
  clientLimit,
  isExpanded,
  onToggleBlocked,
  onChangePlan,
  onToggleDetails,
}: {
  coach: DemoCoachAccount;
  planName: string;
  clientLimit: number | null;
  isExpanded: boolean;
  onToggleBlocked: () => void;
  onChangePlan: () => void;
  onToggleDetails: () => void;
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

      {isExpanded ? (
        <View style={[styles.details, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Dettaglio demo: il gating e' preparato in coach-gating.ts. In questa versione non blocca ancora davvero
            l'accesso coach.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Stato interno: {coach.blocked ? 'bloccato manualmente' : 'accesso demo consentito'}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton label={coach.blocked ? 'Sblocca' : 'Blocca'} tone={coach.blocked ? 'primary' : 'danger'} onPress={onToggleBlocked} />
        <ActionButton label="Cambia piano" onPress={onChangePlan} />
        <ActionButton label={isExpanded ? 'Chiudi dettagli' : 'Vedi dettagli'} onPress={onToggleDetails} />
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
    status === 'active' ? theme.statusActive : status === 'trial' ? theme.statusWarning : status === 'past_due' ? theme.statusExpired : theme.textSecondary;

  return (
    <ThemedText type="smallBold" style={[styles.badge, { borderColor: color, color }]}>
      {status}
    </ThemedText>
  );
}

function ActionButton({ label, tone, onPress }: { label: string; tone?: 'primary' | 'danger'; onPress: () => void }) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.statusExpired : tone === 'primary' ? theme.primary : theme.textSecondary;

  return (
    <Pressable onPress={onPress} style={[styles.actionButton, { borderColor: color }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
