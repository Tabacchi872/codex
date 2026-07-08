import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { DemoAppPlan } from '@/types/superadmin';

export default function SuperadminPlans() {
  const plans = useSuperadminStore((s) => s.plans);
  return (
    <SuperadminShell title="Piani" description="Catalogo piani demo dell'app coach. Prezzi e limiti sono locali.">
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
            EUR {plan.monthlyPrice}/mese demo
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
          {plan.active ? 'attivo' : 'non attivo'}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          Prezzo annuale
        </ThemedText>
        <ThemedText type="smallBold">EUR {plan.annualPrice}/anno demo</ThemedText>
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
            {feature}
          </ThemedText>
        ))}
      </View>

      <Pressable onPress={() => router.push({ pathname: '/superadmin/plans/[id]', params: { id: plan.code } })} style={[styles.editButton, { borderColor: theme.primary }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          Modifica piano
        </ThemedText>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
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
