import { router, type Href, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminCoaches } from '@/hooks/use-superadmin-coaches';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AppBillingStatus, SuperadminCoach } from '@/types/superadmin';

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
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ status?: string | string[] }>();
  const { coaches, loading, error, reload } = useSuperadminCoaches();
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

      <View style={styles.topActions}>
        <AppButton label="+ Aggiungi coach" onPress={() => router.push('/superadmin/coaches/new')} fullWidth size="lg" />
        <AppButton label="Aggiorna" onPress={reload} variant="outline" fullWidth loading={loading} />
      </View>

      {error ? (
        <AppCard style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: colors.rust }]}>{error}</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" fullWidth />
        </AppCard>
      ) : null}

      {!error && filteredCoaches.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          {loading ? <EmptyText loading /> : <EmptyText noFilter={selectedStatus === 'all'} />}
        </AppCard>
      ) : null}

      {filteredCoaches.map((coach) => {
        const plan = plans.find((item) => item.code === coach.planCode);
        const clientLimit = coach.clientLimitOverride ?? plan?.clientLimit ?? null;
        return (
          <CoachCard
            key={coach.id}
            coach={coach}
            planName={plan?.name ?? coach.planCode}
            clientLimit={clientLimit}
            onPress={() => router.push({ pathname: '/superadmin/coaches/[id]', params: { id: coach.id } })}
          />
        );
      })}
    </SuperadminShell>
  );
}

function EmptyText({ loading = false, noFilter = false }: { loading?: boolean; noFilter?: boolean }) {
  const { colors } = useAppTheme();
  if (loading) {
    return <Text style={[styles.emptyTitle, { color: colors.ink }]}>Caricamento coach da Supabase...</Text>;
  }
  if (noFilter) {
    return <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nessun coach registrato</Text>;
  }
  return (
    <>
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nessun coach trovato</Text>
      <Text style={[styles.emptySubtitle, { color: colors.inkSoft }]}>Cambia filtro per vedere altri coach.</Text>
    </>
  );
}

function FilterChip({ filter, active }: { filter: { value: CoachFilterStatus; label: string }; active: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={() => router.push(`/superadmin/coaches?status=${filter.value}` as Href)}
      hitSlop={4}
      style={[styles.filterChip, { backgroundColor: active ? colors.coral : 'transparent', borderColor: colors.coral }]}>
      <Text style={[styles.filterChipLabel, { color: active ? colors.onCoral : colors.coral }]} numberOfLines={1}>
        {filter.label}
      </Text>
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
  onPress,
}: {
  coach: SuperadminCoach;
  planName: string;
  clientLimit: number | null;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.coachIdentity}>
          <Text style={[styles.coachName, { color: colors.ink }]}>{coach.name}</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>{coach.email}</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Codice {coach.coachCode || 'nessuno'}</Text>
        </View>
        <View style={styles.badgeStack}>
          <AppBadge label={getBillingStatusLabel(coach.billingStatus)} tone={statusTone(coach.billingStatus)} />
          {coach.source === 'local' ? <AppBadge label="Demo" tone="neutral" /> : null}
        </View>
      </View>

      <View style={styles.dataGrid}>
        <Field label="Piano app" value={planName} />
        <Field label="Codice coach" value={coach.coachCodeActive ? 'Attivo' : 'Disattivato'} />
      </View>

      <View style={[styles.dataGrid, styles.packageGrid, { borderColor: colors.border }]}>
        <Field label="Pacchetto acquistato" value={coach.activePackageName ?? 'Nessuno'} />
        <Field
          label="Clienti utilizzati"
          value={coach.hasActivePackageSubscription ? `${coach.clientsUsed} su ${coach.activePackageMaxClients ?? '∞'}` : '-'}
        />
        <Field
          label="Posti disponibili"
          value={coach.hasActivePackageSubscription ? String(coach.activePackageAvailableSlots ?? '∞') : '-'}
        />
        <Field label="Scadenza abbonamento" value={coach.activePackageExpiresAt ? formatDate(coach.activePackageExpiresAt) : '-'} />
      </View>

      <View style={[styles.footer, { borderColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.moss }]}>Apri dettaglio e modifica</Text>
        <ChevronRight size={16} color={colors.moss} />
      </View>
    </AppCard>
  );
}

function statusTone(status: AppBillingStatus): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'trial') return 'amber';
  if (status === 'canceled') return 'neutral';
  return 'rust';
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return value;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  topActions: {
    gap: AppSpacing[2],
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 32,
    maxWidth: '100%',
    paddingHorizontal: AppSpacing[2],
    paddingVertical: AppSpacing[1],
  },
  filterChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  emptyCard: {
    gap: AppSpacing[1],
  },
  emptyTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: AppFontSize.sm,
  },
  card: {
    gap: AppSpacing[2],
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  coachIdentity: {
    flex: 1,
    minWidth: 0,
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: AppSpacing[1],
  },
  coachName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  packageGrid: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: AppSpacing[2],
  },
  field: {
    flexBasis: 130,
    flexGrow: 1,
    gap: 2,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: AppSpacing[2],
  },
  footerText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
