import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import type { CoachFeatureKey } from '@/lib/coach-gating';
import { demoPlanBillingRule, useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { DemoAppPlan } from '@/types/superadmin';

export default function SuperadminPlans() {
  const plans = useSuperadminStore((s) => s.plans);
  const { colors } = useAppTheme();
  return (
    <SuperadminShell title="Piani" description="Catalogo piani dell'app coach con prezzi, limiti e funzionalita'.">
      <AppCard style={styles.ruleCard}>
        <Text style={[styles.ruleTitle, { color: colors.ink }]}>Regola prezzi</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          EUR {demoPlanBillingRule.monthlyPricePerClient} per cliente al mese. Extra +{demoPlanBillingRule.extraClientStep} clienti = EUR{' '}
          {demoPlanBillingRule.extraMonthlyPricePerStep}/mese.
        </Text>
      </AppCard>
      {plans.map((plan) => (
        <PlanCard key={plan.code} plan={plan} />
      ))}
    </SuperadminShell>
  );
}

function PlanCard({ plan }: { plan: DemoAppPlan }) {
  const { colors } = useAppTheme();

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={[styles.planName, { color: colors.ink }]}>{plan.name}</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>€{plan.monthlyPrice}/mese</Text>
        </View>
        <AppBadge label={plan.active ? 'Attivo' : 'Non attivo'} tone={plan.active ? 'moss' : 'neutral'} />
      </View>

      <View style={styles.row}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Prezzo annuale</Text>
        <Text style={[styles.rowValue, { color: colors.ink }]}>€{plan.annualPrice}/anno</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Limite clienti</Text>
        <Text style={[styles.rowValue, { color: colors.ink }]}>{plan.clientLimit === null ? 'Illimitato' : String(plan.clientLimit)}</Text>
      </View>

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <AppBadge key={feature} label={getFeatureLabel(feature)} tone="neutral" />
        ))}
      </View>

      <AppButton
        label="Modifica piano"
        onPress={() => router.push({ pathname: '/superadmin/plans/[id]', params: { id: plan.code } })}
        variant="outline"
        fullWidth
      />
    </AppCard>
  );
}

function getFeatureLabel(feature: CoachFeatureKey) {
  const labels: Record<CoachFeatureKey, string> = {
    clients: 'Clienti',
    workout_templates: 'Modelli allenamento',
    appointments: 'Appuntamenti',
    messages_realtime: 'Messaggi',
    push_notifications: 'Notifiche app',
    advanced_analytics: 'Analisi avanzate',
  };
  return labels[feature];
}

const styles = StyleSheet.create({
  ruleCard: {
    gap: 4,
  },
  ruleTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  card: {
    gap: AppSpacing[2],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  planName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  rowValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
});
