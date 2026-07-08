import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CoachFeatureKey } from '@/lib/coach-gating';
import { useSuperadminStore } from '@/store/superadmin-store';

const KNOWN_FEATURES: CoachFeatureKey[] = [
  'clients',
  'workout_templates',
  'appointments',
  'messages_realtime',
  'push_notifications',
  'advanced_analytics',
];

export default function SuperadminPlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const plans = useSuperadminStore((s) => s.plans);
  const updatePlan = useSuperadminStore((s) => s.updatePlan);
  const plan = plans.find((item) => item.code === id);
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
        <Card style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Il piano richiesto non e' disponibile.
          </ThemedText>
          <Pressable onPress={() => router.replace('/superadmin/plans')} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              Torna ai piani
            </ThemedText>
          </Pressable>
        </Card>
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
      <Card style={styles.card}>
        <Field label="Nome piano">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Es. Pro" />
        </Field>
        <Field label="Codice">
          <ThemedTextInput value={code} onChangeText={setCode} placeholder="pro" autoCapitalize="none" />
        </Field>
        <View style={styles.row}>
          <Field label="Prezzo mensile" style={styles.half}>
            <ThemedTextInput value={monthlyPrice} onChangeText={setMonthlyPrice} placeholder="49" keyboardType="decimal-pad" />
          </Field>
          <Field label="Prezzo annuale" style={styles.half}>
            <ThemedTextInput value={annualPrice} onChangeText={setAnnualPrice} placeholder="490" keyboardType="decimal-pad" />
          </Field>
        </View>
        <Field label="Limite clienti">
          <ThemedTextInput value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = illimitato" keyboardType="number-pad" />
        </Field>

        <View style={styles.field}>
          <ThemedText type="smallBold">Funzionalita'</ThemedText>
          <View style={styles.options}>
            {KNOWN_FEATURES.map((feature) => {
              const selected = features.includes(feature);
              return (
                <Pressable
                  key={feature}
                  onPress={() => toggleFeature(feature)}
                  style={[
                    styles.option,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.softRed : theme.backgroundElement,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.textSecondary }}>
                    {getFeatureLabel(feature)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => setActive((current) => !current)}
          style={[styles.toggleButton, { borderColor: active ? theme.statusActive : theme.disabled }]}>
          <ThemedText type="smallBold" style={{ color: active ? theme.statusActive : theme.disabled }}>
            {active ? 'Piano attivo' : 'Piano non attivo'}
          </ThemedText>
        </Pressable>

        {error ? <ThemedText type="small" style={{ color: theme.statusExpired }}>{error}</ThemedText> : null}

        <Pressable onPress={handleSave} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Salva piano
          </ThemedText>
        </Pressable>
      </Card>
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

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  half: {
    flexBasis: 140,
    flexGrow: 1,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    width: '100%',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    width: '100%',
  },
});
