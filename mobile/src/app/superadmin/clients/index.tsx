import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, AppTextField, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { listSuperadminClients, type SuperadminClientRow } from '@/lib/superadmin-platform-service';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type ClientFilter = 'all' | 'with_coach' | 'without_coach' | 'client_pro_active' | 'expired' | 'review';

const FILTERS: { value: ClientFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'with_coach', label: 'Con coach' },
  { value: 'without_coach', label: 'Senza coach' },
  { value: 'client_pro_active', label: 'Client Pro attivo' },
  { value: 'expired', label: 'Scaduti' },
  { value: 'review', label: 'Da revisionare' },
];

export default function SuperadminClients() {
  const { colors } = useAppTheme();
  const [clients, setClients] = useState<SuperadminClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await listSuperadminClients();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setClients(result.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (filter === 'with_coach' && client.mode !== 'with_coach') return false;
      if (filter === 'without_coach' && client.mode !== 'auto_program') return false;
      if (filter === 'client_pro_active' && client.clientProStatus !== 'active' && client.clientProStatus !== 'canceled_valid') return false;
      if (filter === 'expired' && client.clientProStatus !== 'expired' && client.clientProStatus !== 'canceled' && client.clientProStatus !== 'refunded' && client.clientProStatus !== 'revoked') return false;
      if (filter === 'review' && !client.needsReview) return false;
      if (!needle) return true;
      return `${client.name} ${client.email}`.toLowerCase().includes(needle);
    });
  }, [clients, filter, query]);

  return (
    <SuperadminShell title="Clienti" description="Clienti registrati, con coach e self-guided, letti da RPC Superadmin.">
      <View style={styles.searchBox}>
        <Search size={18} color={colors.inkFaint} />
        <View style={styles.searchInput}>
          <AppTextField label="Cerca" value={query} onChangeText={setQuery} placeholder="Nome o email" autoCapitalize="none" />
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((item) => (
          <FilterChip key={item.value} label={item.label} active={filter === item.value} onPress={() => setFilter(item.value)} />
        ))}
      </View>

      <AppButton label="Aggiorna" onPress={load} variant="outline" fullWidth loading={loading} />

      {error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={load} />
        </AppCard>
      ) : loading ? (
        <AppCard>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento clienti...</Text>
        </AppCard>
      ) : filtered.length === 0 ? (
        <AppCard>
          <AppEmptyState title="Nessun cliente" subtitle="Nessun cliente corrisponde ai filtri selezionati." />
        </AppCard>
      ) : (
        filtered.map((client) => <ClientCard key={client.id} client={client} />)
      )}
    </SuperadminShell>
  );
}

function ClientCard({ client }: { client: SuperadminClientRow }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/superadmin/clients/[id]', params: { id: client.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Apri cliente ${client.name || client.email}`}>
      <AppCard style={styles.card}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>{client.name || 'Cliente senza nome'}</Text>
            <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={1}>{client.email}</Text>
          </View>
          <View style={styles.badges}>
            <AppBadge label={client.mode === 'with_coach' ? 'Con coach' : 'Senza coach'} tone={client.mode === 'with_coach' ? 'moss' : 'amber'} />
            <AppBadge label={clientProLabel(client.clientProStatus)} tone={clientProTone(client.clientProStatus)} />
          </View>
        </View>

        <View style={styles.grid}>
          <Field label="Registrazione" value={formatDate(client.createdAt)} />
          <Field label="Coach" value={client.coachName ?? 'Nessun coach'} />
          <Field label="Scadenza Client Pro" value={client.clientProExpiresAt ? formatDate(client.clientProExpiresAt) : '-'} />
          <Field label="Questionario" value={questionnaireLabel(client.questionnaireStatus)} />
          <Field label="Programma" value={programLabel(client.programStatus)} />
          <Field label="Allenamenti completati" value={String(client.completedWorkouts)} />
          <Field label="Ultima attivita" value={client.lastActivityAt ? formatDate(client.lastActivityAt) : 'Non disponibile'} />
        </View>
      </AppCard>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.filterChip, { backgroundColor: active ? colors.coral : 'transparent', borderColor: colors.coral }]}>
      <Text style={[styles.filterChipLabel, { color: active ? colors.onCoral : colors.coral }]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function clientProLabel(status: string) {
  const labels: Record<string, string> = {
    none: 'Senza Client Pro',
    active: 'Client Pro attivo',
    canceled_valid: 'Cancellato valido',
    pending: 'In attesa',
    expired: 'Scaduto',
    canceled: 'Cancellato',
    refunded: 'Rimborsato',
    revoked: 'Revocato',
  };
  return labels[status] ?? status;
}

function clientProTone(status: string): AppBadgeTone {
  if (status === 'active' || status === 'canceled_valid') return 'moss';
  if (status === 'pending') return 'amber';
  if (status === 'none') return 'neutral';
  return 'rust';
}

function questionnaireLabel(status: string) {
  if (status === 'completed') return 'Completato';
  if (status === 'incomplete') return 'Non completato';
  return 'Mancante';
}

function programLabel(status: string) {
  const labels: Record<string, string> = {
    questionnaire_required: 'Questionario richiesto',
    no_program: 'Nessun programma',
    active: 'Attivo',
    pending_safety_review: 'Revisione sicurezza',
    pending_template: 'Pending template',
    pending_subscription: 'Abbonamento richiesto',
  };
  return labels[status] ?? status;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const styles = StyleSheet.create({
  searchBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  searchInput: {
    flex: 1,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    minHeight: 32,
    paddingHorizontal: AppSpacing[2],
    justifyContent: 'center',
  },
  filterChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
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
  grow: {
    flex: 1,
    minWidth: 0,
  },
  badges: {
    alignItems: 'flex-end',
    gap: AppSpacing[1],
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  field: {
    flexBasis: 132,
    flexGrow: 1,
    gap: 2,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
