import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard, AppTextField } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { setAppointmentStatus } from '@/lib/appointment-service';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDateForDisplay, formatDayMonth, parseDateFromDisplay } from '@/lib/format-date';
import { notifyAppointmentPush } from '@/lib/push-notification-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAppointmentsRealtime } from '@/hooks/use-appointments-realtime';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_TYPE_LABEL,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
} from '@/types/appointment';

type ViewMode = 'upcoming' | 'past';
const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

function appointmentDateTimeMs(appointment: Appointment): number {
  return new Date(`${appointment.date}T${appointment.startTime}:00`).getTime();
}

// Agenda coach: da questa fase (5) la fonte principale e' Supabase
// (public.appointments) quando configurato — useAppointmentStore resta il
// mirror locale letto qui e dalla dashboard, aggiornato da
// use-appointments-realtime.ts (refresh su focus + eventi Realtime). Vista
// solo lista, cronologica: la vista calendario resta un passo successivo.
export default function AppuntamentiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const appointments = useAppointmentStore((s) => s.appointments);
  const updateAppointmentLocal = useAppointmentStore((s) => s.updateAppointment);
  const clients = useClientStore((s) => s.clients);
  const { loading, error, refresh } = useAppointmentsRealtime();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('upcoming');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'all'>('all');
  const [dateFilterDisplay, setDateFilterDisplay] = useState('');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const dateFilterIso = parseDateFromDisplay(dateFilterDisplay);
  const nowMs = Date.now();

  const filtered = useMemo(() => {
    const base = appointments.filter((a) => a.status !== 'cancelled');
    const byView = base.filter((a) =>
      viewMode === 'upcoming' ? appointmentDateTimeMs(a) >= nowMs : appointmentDateTimeMs(a) < nowMs,
    );
    const byClient = clientFilter === 'all' ? byView : byView.filter((a) => a.clientId === clientFilter);
    const byType = typeFilter === 'all' ? byClient : byClient.filter((a) => a.type === typeFilter);
    const byDate = dateFilterIso ? byType.filter((a) => a.date === dateFilterIso) : byType;
    return byDate.sort((a, b) =>
      viewMode === 'upcoming'
        ? `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)
        : `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`),
    );
  }, [appointments, viewMode, clientFilter, typeFilter, dateFilterIso, nowMs]);

  async function handleStatusChange(appointment: Appointment, status: AppointmentStatus) {
    setStatusError(null);
    if (supabaseConfig.isConfigured) {
      const result = await setAppointmentStatus(appointment.id, status);
      if (!result.ok) {
        setStatusError(result.message);
        return;
      }
      // Push al cliente per annullamento (best-effort, mai bloccante).
      if (status === 'cancelled') {
        notifyAppointmentPush('appointment_cancelled', appointment.clientId, appointment.title);
      }
      refresh();
    }
    updateAppointmentLocal({ ...appointment, status });
  }

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={[AppTextStyle.title, { color: colors.ink }]}>Agenda</Text>
              <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Prossimi appuntamenti con i tuoi clienti</Text>
            </View>
            <AppButton label="+ Nuovo appuntamento" onPress={() => router.push('/appuntamenti/new')} size="lg" />

            <View style={styles.filterRow}>
              <FilterChip label="Prossimi" active={viewMode === 'upcoming'} onPress={() => setViewMode('upcoming')} />
              <FilterChip label="Passati" active={viewMode === 'past'} onPress={() => setViewMode('past')} />
            </View>

            <View style={styles.filterRow}>
              <FilterChip label="Tutti i tipi" active={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
              {APPOINTMENT_TYPES.map((type) => (
                <FilterChip key={type} label={APPOINTMENT_TYPE_LABEL[type]} active={typeFilter === type} onPress={() => setTypeFilter(type)} />
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clientFilterRow}>
              <FilterChip label="Tutti i clienti" active={clientFilter === 'all'} onPress={() => setClientFilter('all')} />
              {clients.map((client) => (
                <FilterChip
                  key={client.id}
                  label={clientFullName(client)}
                  active={clientFilter === client.id}
                  onPress={() => setClientFilter(client.id)}
                />
              ))}
            </ScrollView>

            <View style={styles.dateFilterRow}>
              <View style={styles.dateFilterInput}>
                <AppTextField
                  placeholder="Filtra per data (GG/MM/AAAA)"
                  value={dateFilterDisplay}
                  onChangeText={setDateFilterDisplay}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
              {dateFilterDisplay ? (
                <Pressable onPress={() => setDateFilterDisplay('')} hitSlop={8}>
                  <Text style={[styles.dateFilterClear, { color: colors.moss }]}>Cancella</Text>
                </Pressable>
              ) : null}
            </View>

            {loading && filtered.length === 0 ? (
              <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento appuntamenti...</Text>
            ) : null}
            {error ? (
              <AppCard style={styles.errorCard}>
                <Text style={{ color: colors.rust, fontSize: AppFontSize.sm, fontWeight: '600' }}>{error}</Text>
                <AppButton label="Riprova" onPress={refresh} variant="outline" size="sm" />
              </AppCard>
            ) : null}
            {statusError ? (
              <Text style={{ color: colors.rust, fontSize: AppFontSize.sm, fontWeight: '600' }}>{statusError}</Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={
          loading || error ? null : (
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
              {viewMode === 'upcoming' ? 'Nessun appuntamento in programma.' : 'Nessun appuntamento passato trovato.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const client = getClientById(clients, item.clientId);
          return (
            <AppointmentRow
              appointment={item}
              clientName={client ? clientFullName(client) : 'Cliente'}
              onPress={() => router.push({ pathname: '/appuntamenti/[id]', params: { id: item.id } })}
              onComplete={() => handleStatusChange(item, 'completed')}
              onCancel={() => handleStatusChange(item, 'cancelled')}
            />
          );
        }}
      />
    </View>
  );
}

function AppointmentRow({
  appointment,
  clientName,
  onPress,
  onComplete,
  onCancel,
}: {
  appointment: Appointment;
  clientName: string;
  onPress: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const isCompleted = appointment.status === 'completed';
  return (
    <AppCard style={styles.row}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Apri appuntamento con ${clientName}`} hitSlop={4} style={styles.rowMain}>
        <Text style={[styles.name, { color: colors.ink }]}>{clientName}</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          {formatDayMonth(appointment.date)} · {appointment.startTime}–{appointment.endTime} — {APPOINTMENT_TYPE_LABEL[appointment.type]}
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{appointment.title}</Text>
      </Pressable>
      {isCompleted ? (
        <View style={styles.statusPillWrap}>
          <AppBadge label={APPOINTMENT_STATUS_LABEL[appointment.status]} tone="moss" />
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <RowAction label="Completa" color={colors.moss} onPress={onComplete} />
          <RowAction label="Annulla" color={colors.rust} onPress={onCancel} />
        </View>
      )}
    </AppCard>
  );
}

// Azione compatta dentro la card (non un AppButton pieno: la card e' gia'
// premibile per aprire il cliente, qui servono due azioni secondarie chiare).
function RowAction({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.rowAction, { borderColor: color }]}>
      <Text style={[styles.rowActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filtro ${label}`}
      style={[
        styles.filterChip,
        { backgroundColor: active ? colors.moss : colors.surface, borderColor: active ? colors.moss : colors.border },
      ]}>
      <Text style={[styles.filterChipLabel, { color: active ? colors.onMoss : colors.inkSoft }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  titleBlock: {
    gap: 4,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  clientFilterRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: AppSpacing[3],
  },
  filterChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  dateFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  dateFilterInput: {
    flex: 1,
  },
  dateFilterClear: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  errorCard: {
    gap: AppSpacing[2],
  },
  row: {
    gap: 2,
  },
  rowMain: {
    gap: 2,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  statusPillWrap: {
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
    marginTop: AppSpacing[2],
  },
  rowAction: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[3],
  },
  rowActionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
