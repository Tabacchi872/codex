import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBillingStatusLabel, isAppBillingStatus } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { AppBillingStatus, AppPlanCode, DemoCoachClient } from '@/types/superadmin';

const STATUSES: AppBillingStatus[] = ['trial', 'active', 'past_due', 'canceled', 'blocked'];

export default function SuperadminCoachDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const coachIdParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const theme = useTheme();
  const coaches = useSuperadminStore((s) => s.coaches);
  const plans = useSuperadminStore((s) => s.plans);
  const clients = useSuperadminStore((s) => s.coachClients);
  const updateCoach = useSuperadminStore((s) => s.updateCoach);
  const coach = coaches.find((item) => item.id === coachIdParam);
  const plan = plans.find((item) => item.code === coach?.planCode);
  const coachClients = clients.filter((client) => client.coachId === coachIdParam);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [planCode, setPlanCode] = useState<AppPlanCode>('free');
  const [billingStatus, setBillingStatus] = useState<AppBillingStatus>('trial');
  const [clientLimit, setClientLimit] = useState('');
  const [clientsUsed, setClientsUsed] = useState('');
  const [periodStartsAt, setPeriodStartsAt] = useState('');
  const [periodEndsAt, setPeriodEndsAt] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!coach) return;
    setName(coach.name);
    setEmail(coach.email);
    setPlanCode(coach.planCode);
    setBillingStatus(coach.billingStatus);
    setClientLimit(coach.clientLimitOverride === undefined || coach.clientLimitOverride === null ? '' : String(coach.clientLimitOverride));
    setClientsUsed(String(coach.clientsUsed));
    setPeriodStartsAt(coach.periodStartsAt);
    setPeriodEndsAt(coach.periodEndsAt);
  }, [coach]);

  if (!coach) {
    return (
      <SuperadminShell title="Coach non trovato">
        <Card style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Il coach richiesto non e' disponibile.
          </ThemedText>
          <Pressable onPress={() => router.replace('/superadmin/coaches' as Href)} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              Torna alla lista coach
            </ThemedText>
          </Pressable>
        </Card>
      </SuperadminShell>
    );
  }

  const coachId = coach.id;
  const effectiveClientLimit = clientLimit.trim() === '' ? plan?.clientLimit ?? null : Number(clientLimit);

  function handleSave() {
    if (!name.trim() || !email.trim()) {
      setError('Nome ed email sono obbligatori.');
      return;
    }
    const parsedLimit = clientLimit.trim() === '' ? undefined : Number(clientLimit);
    const parsedClientsUsed = clientsUsed.trim() === '' ? 0 : Number(clientsUsed);
    if ((parsedLimit !== undefined && Number.isNaN(parsedLimit)) || Number.isNaN(parsedClientsUsed)) {
      setError('Limite clienti e clienti usati devono essere numeri. Il limite puo essere vuoto.');
      return;
    }
    updateCoach(coachId, {
      name: name.trim(),
      email: email.trim(),
      planCode,
      billingStatus,
      clientLimitOverride: parsedLimit,
      clientsUsed: parsedClientsUsed,
      periodStartsAt,
      periodEndsAt,
    });
    setError('');
  }

  function toggleBlocked() {
    const nextStatus: AppBillingStatus = billingStatus === 'blocked' ? 'active' : 'blocked';
    setBillingStatus(nextStatus);
    updateCoach(coachId, { billingStatus: nextStatus });
  }

  return (
    <SuperadminShell title={coach.name} description="Dettaglio coach con modifica manuale e clienti associati.">
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.grow}>
            <ThemedText type="smallBold">Stato attuale</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {coach.blocked ? 'Accesso bloccato manualmente' : 'Accesso non bloccato'}
            </ThemedText>
          </View>
          <StatusBadge status={coach.billingStatus} />
        </View>
        <View style={styles.dataGrid}>
          <Info label="Piano attivo" value={plan?.name ?? coach.planCode} />
          <Info label="Status pagamento" value={getBillingStatusLabel(coach.billingStatus)} />
          <Info label="Clienti usati" value={String(coach.clientsUsed)} />
          <Info label="Limite clienti piano" value={effectiveClientLimit === null ? 'Illimitato' : String(effectiveClientLimit)} />
          <Info label="Scadenza app" value={coach.periodEndsAt} />
        </View>
      </Card>

      <Card style={styles.card}>
        <ThemedText type="subtitle">Modifica coach</ThemedText>
        <Field label="Nome">
          <ThemedTextInput value={name} onChangeText={setName} placeholder="Nome coach" />
        </Field>
        <Field label="Email">
          <ThemedTextInput value={email} onChangeText={setEmail} placeholder="coach@email.it" autoCapitalize="none" keyboardType="email-address" />
        </Field>
        <OptionGroup label="Piano" options={plans.map((item) => ({ value: item.code, label: item.name }))} value={planCode} onChange={setPlanCode} />
        <OptionGroup
          label="Status pagamento"
          options={STATUSES.map((status) => ({ value: status, label: getBillingStatusLabel(status) }))}
          value={billingStatus}
          onChange={setBillingStatus}
        />
        <Field label="Limite clienti">
          <ThemedTextInput value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = limite piano" keyboardType="number-pad" />
        </Field>
        <Field label="Clienti usati">
          <ThemedTextInput value={clientsUsed} onChangeText={setClientsUsed} placeholder="0" keyboardType="number-pad" />
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
        <View style={styles.actions}>
          <Pressable onPress={toggleBlocked} style={[styles.outlineButton, { borderColor: billingStatus === 'blocked' ? theme.statusActive : theme.statusExpired }]}>
            <ThemedText type="smallBold" style={{ color: billingStatus === 'blocked' ? theme.statusActive : theme.statusExpired }}>
              {billingStatus === 'blocked' ? 'Sblocca coach' : 'Blocca coach'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={handleSave} style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              Salva modifiche
            </ThemedText>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.card}>
        <ThemedText type="subtitle">Clienti attivi</ThemedText>
        {coachClients.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nessun cliente attivo associato a questo coach.
          </ThemedText>
        ) : (
          coachClients.map((client) => <ClientRow key={client.id} client={client} />)
        )}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function ClientRow({ client }: { client: DemoCoachClient }) {
  const theme = useTheme();
  return (
    <View style={[styles.clientRow, { borderColor: theme.border }]}>
      <View style={styles.grow}>
        <ThemedText type="smallBold">{client.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {client.contact ?? 'Contatto non disponibile'}
        </ThemedText>
      </View>
      <View style={styles.clientMeta}>
        <ThemedText type="smallBold">{client.status && isAppBillingStatus(client.status) ? getBillingStatusLabel(client.status) : client.status ?? '-'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {client.createdAt ?? '-'}
        </ThemedText>
      </View>
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
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  grow: {
    flex: 1,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  info: {
    flexBasis: 130,
    flexGrow: 1,
    gap: Spacing.half,
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
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
  },
  outlineButton: {
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
  clientRow: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  clientMeta: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
});
