import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CoachFeatureKey } from '@/lib/coach-gating';
import { demoPlanBillingRule, useSuperadminStore } from '@/store/superadmin-store';
import type { DemoAppPlan } from '@/types/superadmin';

export default function SuperadminPlans() {
  const plans = useSuperadminStore((s) => s.plans);
  return (
    <SuperadminShell title="Piani" description="Catalogo piani dell'app coach con prezzi, limiti e funzionalita'.">
      <Card style={styles.ruleCard}>
        <ThemedText type="smallBold">Regola prezzi</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          EUR {demoPlanBillingRule.monthlyPricePerClient} per cliente al mese. Extra +{demoPlanBillingRule.extraClientStep} clienti = EUR{' '}
          {demoPlanBillingRule.extraMonthlyPricePerStep}/mese.
        </ThemedText>
      </Card>
      {plans.map((plan) => (
        <PlanCard key={plan.code} plan={plan} />
      ))}
    </SuperadminShell>
  );
}

function PlanCard({ plan }: { plan: DemoAppPlan }) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <ThemedText type="smallBold">{plan.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            €{plan.monthlyPrice}/mese
          </ThemedText>
        </View>
        <ThemedText
          type="smallBold"
          style={[
            styles.badge,
            {
              borderColor: plan.active ? theme.statusActive : theme.disabled,
              color: plan.active ? theme.statusActive : theme.disabled,
            },
          ]}>
          {plan.active ? 'Attivo' : 'Non attivo'}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          Prezzo annuale
        </ThemedText>
        <ThemedText type="smallBold">€{plan.annualPrice}/anno</ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          Limite clienti
        </ThemedText>
        <ThemedText type="smallBold">{plan.clientLimit === null ? 'Illimitato' : String(plan.clientLimit)}</ThemedText>
      </View>

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <ThemedText key={feature} type="small" themeColor="textSecondary" style={[styles.feature, { borderColor: theme.border }]}>
            {getFeatureLabel(feature)}
          </ThemedText>
        ))}
      </View>

      <Pressable
        onPress={() => router.push({ pathname: '/superadmin/plans/[id]', params: { id: plan.code } })}
        hitSlop={6}
        style={[styles.editButton, { borderColor: theme.primary }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Modifica piano
        </ThemedText>
      </Pressable>
    </Card>
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
    gap: Spacing.one,
  },
  card: {
    gap: Spacing.two,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  editButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    paddingVertical: Spacing.three,
    width: '100%',
  },
  feature: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
