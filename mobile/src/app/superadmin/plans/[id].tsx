import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppTextField } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import type { CoachFeatureKey } from '@/lib/coach-gating';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

const KNOWN_FEATURES: CoachFeatureKey[] = [
  'clients',
  'workout_templates',
  'appointments',
  'messages_realtime',
  'push_notifications',
  'advanced_analytics',
];

export default function SuperadminPlanDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const planId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colors } = useAppTheme();
  const plans = useSuperadminStore((s) => s.plans);
  const updatePlan = useSuperadminStore((s) => s.updatePlan);
  const plan = plans.find((item) => item.code === planId);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [annualPrice, setAnnualPrice] = useState('');
  const [clientLimit, setClientLimit] = useState('');
  const [features, setFeatures] = useState<CoachFeatureKey[]>([]);
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan) return;
    setName(plan.name);
    setCode(plan.code);
    setMonthlyPrice(String(plan.monthlyPrice));
    setAnnualPrice(String(plan.annualPrice));
    setClientLimit(plan.clientLimit === null ? '' : String(plan.clientLimit));
    setFeatures(plan.features);
    setActive(plan.active);
  }, [plan]);

  if (!plan) {
    return (
      <SuperadminShell title="Piano non trovato">
        <AppCard style={styles.card}>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Il piano richiesto non e' disponibile.</Text>
          <AppButton label="Torna ai piani" onPress={() => router.replace('/superadmin/plans' as Href)} fullWidth />
        </AppCard>
      </SuperadminShell>
    );
  }

  const planCode = plan.code;

  function handleSave() {
    const parsedMonthly = Number(monthlyPrice);
    const parsedAnnual = Number(annualPrice);
    const parsedLimit = clientLimit.trim() === '' ? null : Number(clientLimit);
    if (!name.trim() || !code.trim()) {
      setError('Nome piano e codice sono obbligatori.');
      return;
    }
    if (Number.isNaN(parsedMonthly) || Number.isNaN(parsedAnnual) || Number.isNaN(parsedLimit)) {
      setError('Prezzi e limite clienti devono essere numeri. Lascia vuoto il limite per illimitato.');
      return;
    }
    updatePlan(planCode, {
      name: name.trim(),
      code: code.trim(),
      monthlyPrice: parsedMonthly,
      annualPrice: parsedAnnual,
      clientLimit: parsedLimit,
      features,
      active,
    });
    setError('');
    router.replace({ pathname: '/superadmin/plans/[id]', params: { id: code.trim() } });
  }

  function toggleFeature(feature: CoachFeatureKey) {
    setFeatures((current) => (current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]));
  }

  return (
    <SuperadminShell title={plan.name} description="Modifica manuale del piano.">
      <AppCard style={styles.card}>
        <AppTextField label="Nome piano" value={name} onChangeText={setName} placeholder="Es. Pro" />
        <AppTextField label="Codice" value={code} onChangeText={setCode} placeholder="pro" autoCapitalize="none" />
        <View style={styles.row}>
          <View style={styles.half}>
            <AppTextField label="Prezzo mensile" value={monthlyPrice} onChangeText={setMonthlyPrice} placeholder="49" keyboardType="decimal-pad" />
          </View>
          <View style={styles.half}>
            <AppTextField label="Prezzo annuale" value={annualPrice} onChangeText={setAnnualPrice} placeholder="490" keyboardType="decimal-pad" />
          </View>
        </View>
        <AppTextField label="Limite clienti" value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = illimitato" keyboardType="number-pad" />

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Funzionalita&apos;</Text>
          <View style={styles.options}>
            {KNOWN_FEATURES.map((feature) => {
              const selected = features.includes(feature);
              return (
                <Pressable
                  key={feature}
                  onPress={() => toggleFeature(feature)}
                  hitSlop={4}
                  style={[styles.option, { borderColor: colors.moss, backgroundColor: selected ? colors.moss : 'transparent' }]}>
                  <Text style={[styles.optionLabel, { color: selected ? colors.onMoss : colors.moss }]}>{getFeatureLabel(feature)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => setActive((current) => !current)}
          hitSlop={6}
          style={[styles.toggleButton, { borderColor: active ? colors.moss : colors.inkFaint }]}>
          <Text style={[styles.toggleLabel, { color: active ? colors.moss : colors.inkFaint }]}>
            {active ? 'Piano attivo' : 'Piano non attivo'}
          </Text>
        </Pressable>

        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

        <AppButton label="Salva piano" onPress={handleSave} fullWidth />
      </AppCard>
    </SuperadminShell>
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
  card: {
    gap: AppSpacing[3],
  },
  field: {
    gap: AppSpacing[2],
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  half: {
    flexBasis: 140,
    flexGrow: 1,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  option: {
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    minHeight: 40,
    paddingHorizontal: AppSpacing[3],
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: 1.5,
    minHeight: 48,
    width: '100%',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
