import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppTextField } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AppBillingStatus, AppPlanCode } from '@/types/superadmin';

const STATUSES: AppBillingStatus[] = ['trial', 'active', 'past_due', 'canceled', 'blocked'];

export default function NewSuperadminCoach() {
  const { colors } = useAppTheme();
  const plans = useSuperadminStore((s) => s.plans);
  const createCoach = useSuperadminStore((s) => s.createCoach);
  const firstPlan = plans[0]?.code ?? 'free';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [planCode, setPlanCode] = useState<AppPlanCode>(firstPlan);
  const [billingStatus, setBillingStatus] = useState<AppBillingStatus>('trial');
  const [clientLimit, setClientLimit] = useState('');
  const [clientsUsed, setClientsUsed] = useState('0');
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
    const parsedClientsUsed = clientsUsed.trim() === '' ? 0 : Number(clientsUsed);
    if (Number.isNaN(parsedLimit) || Number.isNaN(parsedClientsUsed)) {
      setError('Limite clienti e clienti usati devono essere numeri. Il limite puo essere vuoto.');
      return;
    }
    const coach = createCoach({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      planCode,
      billingStatus,
      clientLimitOverride: parsedLimit,
      clientsUsed: parsedClientsUsed,
      periodStartsAt,
      periodEndsAt,
    });
    router.replace({ pathname: '/superadmin/coaches/[id]', params: { id: coach.id } });
  }

  return (
    <SuperadminShell title="Nuovo coach" description="Crea un coach e assegna piano, stato pagamento e periodo di validita'.">
      <AppCard style={styles.card}>
        <AppTextField label="Nome" value={name} onChangeText={setName} placeholder="Es. Laura Bassi" />
        <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="coach@email.it" autoCapitalize="none" keyboardType="email-address" />
        <AppTextField label="Telefono opzionale" value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
        <OptionGroup label="Piano" options={plans.map((plan) => ({ value: plan.code, label: plan.name }))} value={planCode} onChange={setPlanCode} />
        <OptionGroup
          label="Stato pagamento"
          options={STATUSES.map((status) => ({ value: status, label: getBillingStatusLabel(status) }))}
          value={billingStatus}
          onChange={setBillingStatus}
        />
        <AppTextField label="Limite clienti" value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = limite piano" keyboardType="number-pad" />
        <AppTextField label="Clienti usati" value={clientsUsed} onChangeText={setClientsUsed} placeholder="0" keyboardType="number-pad" />
        <View style={styles.row}>
          <View style={styles.half}>
            <AppTextField label="Inizio periodo" value={periodStartsAt} onChangeText={setPeriodStartsAt} placeholder="2026-07-08" />
          </View>
          <View style={styles.half}>
            <AppTextField label="Fine periodo" value={periodEndsAt} onChangeText={setPeriodEndsAt} placeholder="2026-08-08" />
          </View>
        </View>
        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton label="Salva coach" onPress={handleSave} fullWidth />
      </AppCard>
    </SuperadminShell>
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
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              hitSlop={4}
              style={[styles.option, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
              <Text style={[styles.optionLabel, { color: active ? colors.onMoss : colors.moss }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
