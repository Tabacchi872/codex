import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBadge, AppButton, AppCard } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { BottomTabInset } from '@/constants/theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPE_LABEL, type Appointment } from '@/types/appointment';

// Agenda coach: prima mostrava solo dati statici di esempio (PLACEHOLDER_APPOINTMENTS)
// con il bottone "+ Nuovo appuntamento" disabilitato. Ora legge da
// useAppointmentStore (persistito) e il bottone porta alla creazione reale
// (vedi appuntamenti/new.tsx). Vista solo lista, cronologica: la vista
// calendario mensile/settimanale resta un passo successivo (docs/TODO_NEXT.md).
export default function AppuntamentiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const appointments = useAppointmentStore((s) => s.appointments);
  const clients = useClientStore((s) => s.clients);

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== 'cancelled')
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [appointments]
  );

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
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={<Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun appuntamento in programma.</Text>}
        renderItem={({ item }) => {
          const client = getClientById(clients, item.clientId);
          return (
            <AppointmentRow
              appointment={item}
              clientName={client ? clientFullName(client) : 'Cliente non trovato'}
              onPress={() => (client ? router.push(`/clienti/${client.id}`) : undefined)}
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
}: {
  appointment: Appointment;
  clientName: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const isCompleted = appointment.status === 'completed';
  return (
    <AppCard onPress={onPress} style={styles.row}>
      <Text style={[styles.name, { color: colors.ink }]}>{clientName}</Text>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>
        {formatDayMonth(appointment.date)} · {appointment.startTime}–{appointment.endTime} — {APPOINTMENT_TYPE_LABEL[appointment.type]}
      </Text>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{appointment.title}</Text>
      {isCompleted ? (
        <View style={styles.statusPillWrap}>
          <AppBadge label={APPOINTMENT_STATUS_LABEL[appointment.status]} tone="moss" />
        </View>
      ) : null}
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
  titleBlock: {
    gap: 4,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  row: {
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
});
