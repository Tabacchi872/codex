import { router, useRouter, type Href } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard, AppErrorState, AppPressableCard, FitCoachLogo, UserAvatar } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { useCoachClientCapacity } from '@/hooks/use-coach-client-capacity';
import { clientFullName } from '@/lib/client-helpers';
import { logCoachNavPress } from '@/lib/coach-navigation';
import { isSeedClientId } from '@/lib/demo-data';
import { supabaseConfig } from '@/lib/supabase';
import { getClientPlans, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { COACH_CLIENT_CONNECTION_STATUS_LABEL, type CoachClientConnectionStatus } from '@/types/client';

type ClientStatusFilter = 'all' | 'active' | 'suspended' | 'removed';
const FILTERS: { value: ClientStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'active', label: 'Attivi' },
  { value: 'suspended', label: 'Sospesi' },
  { value: 'removed', label: 'Rimossi' },
];

export default function ClientiListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { clients, loading: clientsLoading, error: clientsError, reload: reloadClients } = useCoachClients();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('all');
  const [searchText, setSearchText] = useState('');

  const searchQuery = searchText.trim().toLowerCase();
  const visibleClients = clients.filter((client) => {
    const status = getConnectionStatus(client.connectionStatus);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (!searchQuery) return true;
    return clientFullName(client).toLowerCase().includes(searchQuery) || client.email.toLowerCase().includes(searchQuery);
  });

  useEffect(() => {
    if (!__DEV__) return;
    console.log('CLIENTI_LIST_FILTER', {
      tab: statusFilter,
      search: searchQuery.length > 0,
      totalClients: clients.length,
      activeCount: clients.filter((c) => getConnectionStatus(c.connectionStatus) === 'active').length,
      suspendedCount: clients.filter((c) => getConnectionStatus(c.connectionStatus) === 'suspended').length,
      removedCount: clients.filter((c) => getConnectionStatus(c.connectionStatus) === 'removed').length,
      visibleCount: visibleClients.length,
    });
  }, [statusFilter, searchQuery, clients, visibleClients]);

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  function navigate(source: string, target: string) {
    logCoachNavPress(source, target);
    router.push(target as Href);
  }

  if (clientsLoading && clients.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.inkSoft }}>Caricamento clienti...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={visibleClients}
        keyExtractor={(item) => item.id}
        refreshing={clientsLoading && clients.length > 0}
        onRefresh={reloadClients}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <FitCoachLogo size="sm" />
            </View>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: colors.moss }]}>AREA COACH</Text>
                <Text style={[styles.title, { color: colors.ink }]}>Clienti</Text>
                <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{clients.length} clienti in gestione</Text>
              </View>
              <AppButton label="Nuovo cliente" onPress={() => navigate('clienti-new', '/clienti/new')} size="lg" />
            </View>
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Search size={16} color={colors.inkFaint} />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Cerca per nome o email"
                placeholderTextColor={colors.inkFaint}
                style={[styles.searchInput, { color: colors.ink }]}
                accessibilityLabel="Cerca cliente per nome o email"
              />
            </View>
            <View style={styles.filterRow}>
              {FILTERS.map((filter) => {
                const active = statusFilter === filter.value;
                return (
                  <Pressable
                    key={filter.value}
                    onPress={() => setStatusFilter(filter.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Filtro ${filter.label}`}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.moss : colors.surface,
                        borderColor: active ? colors.moss : colors.border,
                      },
                    ]}>
                    <Text style={[styles.filterChipLabel, { color: active ? colors.onMoss : colors.inkSoft }]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {clientsError ? (
              <AppCard>
                <AppErrorState message={clientsError} onRetry={reloadClients} />
              </AppCard>
            ) : null}
            <AppButton label="Aggiorna clienti" onPress={reloadClients} variant="outline" loading={clientsLoading} />
            {supabaseConfig.isConfigured ? <ClientCapacityCard /> : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        renderItem={({ item }) => {
          const connectionStatus = getConnectionStatus(item.connectionStatus);
          const statusLabel = getConnectionStatusCardLabel(connectionStatus, item.suspensionReason);
          const sessions = getClientPlans(workoutPlans, item.id);
          const counter = getWorkoutCounter([], workoutPlans, item, item.id);
          const progress = counter.total > 0 ? Math.min(counter.completed / counter.total, 1) : 0;
          return (
            <AppPressableCard onPress={() => navigate('clienti-card', `/clienti/${item.id}`)} accessibilityLabel={`Apri cliente ${clientFullName(item)}`} style={styles.row}>
              <View style={styles.rowHeader}>
                <UserAvatar
                  firstName={item.firstName}
                  lastName={item.lastName}
                  imageUrl={item.avatarUrl}
                  preset={item.avatarPreset}
                  size={58}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                    {clientFullName(item)}
                  </Text>
                  <Text style={[styles.planText, { color: colors.inkSoft }]} numberOfLines={1}>
                    {sessions.length === 1 ? '1 scheda assegnata' : `${sessions.length} schede assegnate`}
                  </Text>
                  <View style={styles.progressLine}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
                      <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.inkSoft }]}>
                      {counter.completed}/{counter.total}
                    </Text>
                  </View>
                </View>
                <View style={styles.badgeStack}>
                  <AppBadge
                    label={statusLabel}
                    tone={connectionStatus === 'suspended' ? 'amber' : connectionStatus === 'removed' ? 'neutral' : 'moss'}
                  />
                  {isSeedClientId(item.id) ? <AppBadge label="Demo" tone="neutral" /> : null}
                </View>
              </View>
            </AppPressableCard>
          );
        }}
      />
    </View>
  );
}

function getConnectionStatus(status: CoachClientConnectionStatus | undefined): CoachClientConnectionStatus {
  return status === 'suspended' ? 'suspended' : status === 'removed' ? 'removed' : 'active';
}

function getConnectionStatusCardLabel(status: CoachClientConnectionStatus, reason?: string | null) {
  if (status === 'removed') return COACH_CLIENT_CONNECTION_STATUS_LABEL.removed;
  if (status === 'suspended') return 'Sospeso';
  return COACH_CLIENT_CONNECTION_STATUS_LABEL.active;
}

// Contatore "Clienti utilizzati: X su Y" / "Posti disponibili: Z", letto
// SEMPRE in tempo reale da Supabase (mai da useClientStore, che e' solo il
// mirror locale dei clienti creati manualmente dal coach — vedi commento in
// use-coach-client-capacity.ts). Si aggiorna da solo quando la schermata
// torna a fuoco o l'app torna in primo piano: non serve premere nulla dopo
// aver attivato un abbonamento o dopo che un cliente si e' registrato con il
// codice coach.
function ClientCapacityCard() {
  const { colors } = useAppTheme();
  const { capacity, loading, error, reload } = useCoachClientCapacity();

  if (loading && !capacity) {
    return (
      <AppCard style={styles.capacityCard}>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento capacita' clienti...</Text>
      </AppCard>
    );
  }

  if (error) {
    return (
      <AppCard style={styles.capacityCard}>
        <AppErrorState message={error} onRetry={reload} />
      </AppCard>
    );
  }

  if (!capacity || !capacity.hasActiveSubscription) {
    return (
      <AppCard style={[styles.capacityCard, { borderColor: colors.rust }]}>
        <Text style={[styles.capacityTitle, { color: colors.rust }]}>Abbonamento necessario</Text>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
          Nessun pacchetto coach attivo: le nuove registrazioni cliente con il tuo codice restano bloccate finche' non attivi un
          pacchetto.
        </Text>
        <AppButton
          label="Vai ad Abbonamento"
          onPress={() => {
            logCoachNavPress('clienti-vai-abbonamento', '/abbonamento-coach');
            router.push('/abbonamento-coach');
          }}
          variant="outline"
          size="sm"
        />
      </AppCard>
    );
  }

  const { usedClients, maxClients, availableSlots } = capacity;
  const limitReached = maxClients !== null && availableSlots !== null && availableSlots <= 0;

  return (
    <AppCard style={[styles.capacityCard, limitReached && { borderColor: colors.amber }]}>
      <Text style={[styles.capacityValue, { color: colors.ink }]}>
        Clienti utilizzati: {usedClients} su {maxClients === null ? 'illimitati' : maxClients}
      </Text>
      <Text style={{ color: limitReached ? colors.amber : colors.inkSoft, fontSize: AppFontSize.sm, fontWeight: limitReached ? '700' : '600' }}>
        Posti disponibili: {maxClients === null ? 'illimitati' : availableSlots}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[5],
  },
  header: {
    gap: AppSpacing[3],
    marginBottom: AppSpacing[2],
  },
  logoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    gap: AppSpacing[3],
    justifyContent: 'space-between',
    padding: AppSpacing[5],
  },
  titleBlock: {
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: AppFontSize.xs,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  capacityCard: {
    gap: AppSpacing[1],
  },
  searchRow: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 44,
    paddingHorizontal: AppSpacing[4],
  },
  searchInput: {
    flex: 1,
    fontSize: AppFontSize.base,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: AppSpacing[3],
  },
  filterChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  capacityTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  capacityValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  row: {
    gap: AppSpacing[3],
    paddingVertical: AppSpacing[4],
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppSpacing[3],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: AppSpacing[1],
  },
  name: {
    fontWeight: '700',
    fontSize: 17,
  },
  planText: {
    fontSize: AppFontSize.sm,
  },
  progressLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    marginTop: AppSpacing[2],
  },
  progressTrack: {
    borderRadius: AppRadius.pill,
    flex: 1,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: AppRadius.pill,
    height: '100%',
  },
  progressText: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
    minWidth: 44,
    textAlign: 'right',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
