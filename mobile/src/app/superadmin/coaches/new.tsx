import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { AppBillingStatus, AppPlanCode } from '@/types/superadmin';

const STATUSES: AppBillingStatus[] = ['trial', 'active', 'past_due', 'canceled', 'blocked'];

export default function NewSuperadminCoach() {
  const theme = useTheme();
  const plans = useSuperadminStore((s) => s.plans);
  const createCoach = useSuperadminStore((s) => s.createCoach);
  const firstPlan = plans[0]?.code ?? 'free';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [planCode, setPlanCode] = useState<AppPlanCode>(firstPlan);
  const [billingStatus, setBillingStatus] = useState<AppBillingStatus>('trial');
  const [clientLimit, setClientLimit] = useState('');
  const [periodStartsAt, setPeriodStartsAt] = useState('2026-07-08');
  const [periodEndsAt, setPeriodEndsAt] = useState('2026-08-08');
  const [error, setError] = useState('');

  function handleSave() {
    if (!name.trim() || !email.trim()) {
      setError('Nome ed email sono obbligatori.');
      return;
    }
    const plan = plans.find((item) => item.code === planCode);
    const parsedLimit = clientLimit.trim() === '' ? plan?.clientLimit ?? null : Number(clientLimit);
    if (Number.isNaN(parsedLimit)) {
      setError('Il limite clienti deve essere un numero oppure vuoto.');
      return;
    }
    const coach = createCoach({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      planCode,
      billingStatus,
      clientLimitOverride: parsedLimit,
      periodStartsAt,
      periodEndsAt,
    });
    router.replace({ pathname: '/superadmin/coaches/[id]', params: { id: coach.id } });
  }

  return (
    <SuperadminShell title="Nuovo coach" description="Crea un coach e assegna piano, stato pagamento e periodo di validita'.">
      <Card style={styles.card}>
        <Field label="Nome">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Es. Laura Bassi" />
        </Field>
        <Field label="Email">
          <ThemedTextInput value={email} onChangeText={setEmail} placeholder="coach@email.it" autoCapitalize="none" keyboardType="email-address" />
        </Field>
        <Field label="Telefono opzionale">
          <ThemedTextInput value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
        </Field>
        <OptionGroup label="Piano" options={plans.map((plan) => ({ value: plan.code, label: plan.name }))} value={planCode} onChange={setPlanCode} />
        <OptionGroup
          label="Status pagamento"
          options={STATUSES.map((status) => ({ value: status, label: getBillingStatusLabel(status) }))}
          value={billingStatus}
          onChange={setBillingStatus}
        />
        <Field label="Limite clienti">
          <ThemedTextInput value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = limite piano" keyboardType="number-pad" />
        </Field>
        <View style={styles.row}>
          <Field label="Inizio periodo" style={styles.half}>
            <ThemedTextInput value={periodStartsAt} onChangeText={setPeriodStartsAt} placeholder="2026-07-08" />
          </Field>
          <Field label="Fine periodo" style={styles.half}>
            <ThemedTextInput value={periodEndsAt} onChangeText={setPeriodEndsAt} placeholder="2026-08-08" />
          </Field>
        </View>
        {error ? <ThemedText type="small" style={{ color: theme.statusExpired }}>{error}</ThemedText> : null}
        <Pressable onPress={handleSave} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Salva coach
          </ThemedText>
        </Pressable>
      </Card>
    </SuperadminShell>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.options}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: active ? theme.primary : theme.textSecondary }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
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
  saveButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    width: '100%',
  },
});
