import { Link, router, type Href, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { AppBillingStatus, DemoCoachAccount } from '@/types/superadmin';

type CoachFilterStatus = 'all' | AppBillingStatus;

const FILTERS: { value: CoachFilterStatus; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'active', label: 'Attivi' },
  { value: 'trial', label: 'In prova' },
  { value: 'past_due', label: 'Scaduti' },
  { value: 'blocked', label: 'Bloccati' },
  { value: 'canceled', label: 'Annullati' },
];

export default function SuperadminCoaches() {
  const params = useLocalSearchParams<{ status?: string | string[] }>();
  const coaches = useSuperadminStore((s) => s.coaches);
  const plans = useSuperadminStore((s) => s.plans);
  const selectedStatus = getSelectedFilter(params.status);
  const filteredCoaches = selectedStatus === 'all' ? coaches : coaches.filter((coach) => coach.billingStatus === selectedStatus);

  return (
    <SuperadminShell title="Coach" description="Gestione amministrativa di coach, stato pagamento e abbonamento app.">
      <View style={styles.filters}>
        {FILTERS.map((filter) => (
          <FilterChip key={filter.value} filter={filter} active={filter.value === selectedStatus} />
        ))}
      </View>

      <Link href="/superadmin/coaches/new" asChild>
        <Pressable hitSlop={6} style={styles.primaryButton}>
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            + Aggiungi coach
          </ThemedText>
        </Pressable>
      </Link>

      {filteredCoaches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ThemedText type="smallBold">Nessun coach trovato</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Cambia filtro per vedere altri coach.
          </ThemedText>
        </Card>
      ) : null}

      {filteredCoaches.map((coach) => {
        const plan = plans.find((item) => item.code === coach.planCode);
        const clientLimit = coach.clientLimitOverride ?? plan?.clientLimit ?? null;
        return (
          <Pressable
            key={coach.id}
            hitSlop={4}
            style={styles.coachLink}
            onPress={() => router.push({ pathname: '/superadmin/coaches/[id]', params: { id: coach.id } })}>
            <CoachCard coach={coach} planName={plan?.name ?? coach.planCode} clientLimit={clientLimit} />
          </Pressable>
        );
      })}
    </SuperadminShell>
  );
}

function FilterChip({ filter, active }: { filter: { value: CoachFilterStatus; label: string }; active: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(`/superadmin/coaches?status=${filter.value}` as Href)}
      hitSlop={4}
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? theme.softRed : theme.backgroundElement,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}>
      <ThemedText type="smallBold" numberOfLines={1} style={{ color: active ? theme.primary : theme.textSecondary }}>
        {filter.label}
      </ThemedText>
    </Pressable>
  );
}

function getSelectedFilter(statusParam: string | string[] | undefined): CoachFilterStatus {
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  return FILTERS.some((filter) => filter.value === status) ? (status as CoachFilterStatus) : 'all';
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
          <ThemedText type="small" themeColor="textSecondary">
            Codice {coach.coachCode}
          </ThemedText>
        </View>
        <StatusBadge status={coach.billingStatus} />
      </View>

      <View style={styles.dataGrid}>
        <Field label="Piano attivo" value={planName} />
        <Field label="Clienti usati" value={String(coach.clientsUsed)} />
        <Field label="Limite clienti" value={clientLimit === null ? 'Illimitato' : String(clientLimit)} />
        <Field label="Scadenza periodo" value={coach.periodEndsAt} />
        <Field label="Codice coach" value={coach.coachCodeActive ? 'Attivo' : 'Disattivato'} />
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
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    maxWidth: '100%',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  emptyCard: {
    gap: Spacing.one,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#C90018',
    borderRadius: Radius.md,
    minHeight: 48,
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
    minWidth: 0,
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
    alignSelf: 'flex-start',
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
