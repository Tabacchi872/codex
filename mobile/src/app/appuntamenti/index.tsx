import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPE_LABEL, type Appointment } from '@/types/appointment';

// Agenda coach: prima mostrava solo dati statici di esempio (PLACEHOLDER_APPOINTMENTS)
// con il bottone "+ Nuovo appuntamento" disabilitato. Ora legge da
// useAppointmentStore (persistito) e il bottone porta alla creazione reale
// (vedi appuntamenti/new.tsx). Vista solo lista, cronologica: la vista
// calendario mensile/settimanale resta un passo successivo (docs/TODO_NEXT.md).
export default function AppuntamentiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'client');
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
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedText type="title" style={styles.title}>
                Agenda
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Prossimi appuntamenti con i tuoi clienti
              </ThemedText>
            </View>
            <Pressable onPress={() => router.push('/appuntamenti/new')}>
              <View style={[styles.newButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  + Nuovo appuntamento
                </ThemedText>
              </View>
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary">
            Nessun appuntamento in programma.
          </ThemedText>
        }
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
    </ScreenBackground>
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
  const theme = useTheme();
  const isCompleted = appointment.status === 'completed';
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        <ThemedText type="default" style={styles.name}>
          {clientName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDayMonth(appointment.date)} · {appointment.startTime}–{appointment.endTime} —{' '}
          {APPOINTMENT_TYPE_LABEL[appointment.type]}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {appointment.title}
        </ThemedText>
        {isCompleted && (
          <View style={[styles.statusPill, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="statusActive">
              {APPOINTMENT_STATUS_LABEL[appointment.status]}
            </ThemedText>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  newButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  row: {
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 2,
  },
  separator: {
    height: Spacing.two,
  },
});
