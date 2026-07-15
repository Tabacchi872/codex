import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { setAppointmentStatus } from '@/lib/appointment-service';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { notifyAppointmentPush } from '@/lib/push-notification-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAppointmentsRealtime } from '@/hooks/use-appointments-realtime';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentStatus } from '@/types/appointment';

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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== 'cancelled')
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [appointments]
  );

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
        data={upcoming}
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
            {loading && upcoming.length === 0 ? (
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
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun appuntamento in programma.</Text>
          )
        }
        renderItem={({ item }) => {
          const client = getClientById(clients, item.clientId);
          return (
            <AppointmentRow
              appointment={item}
              clientName={client ? clientFullName(client) : 'Cliente'}
              onPress={() => (client ? router.push(`/clienti/${client.id}`) : undefined)}
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
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Apri cliente ${clientName}`} hitSlop={4} style={styles.rowMain}>
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
