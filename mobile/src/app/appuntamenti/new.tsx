import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { findOverlappingAppointment, isValidTimeRange } from '@/lib/appointment-overlap';
import { clientFullName } from '@/lib/client-helpers';
import { getClientPlans } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentType } from '@/types/appointment';

const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

export default function NuovoAppuntamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { clientId: initialClientId, workoutSessionId: initialSessionId } = useLocalSearchParams<{
    clientId?: string;
    workoutSessionId?: string;
  }>();

  const clients = useClientStore((s) => s.clients);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const appointments = useAppointmentStore((s) => s.appointments);
  const addAppointment = useAppointmentStore((s) => s.addAppointment);

  const [clientId, setClientId] = useState(initialClientId ?? clients[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<AppointmentType>('workout');
  const [workoutSessionId, setWorkoutSessionId] = useState(initialSessionId ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clientSessions = getClientPlans(workoutPlans, clientId);

  function handleSave() {
    if (!clientId) {
      setError('Seleziona un cliente.');
      return;
    }
    if (!title.trim()) {
      setError('Inserisci un titolo per l’appuntamento.');
      return;
    }
    if (!date.trim()) {
      setError('Inserisci una data (formato AAAA-MM-GG).');
      return;
    }
    if (!isValidTimeRange(startTime.trim(), endTime.trim())) {
      setError('Inserisci un orario di inizio e fine validi (formato HH:mm), con fine dopo inizio.');
      return;
    }

    const candidate = { coachId: DEFAULT_COACH_ID, date: date.trim(), startTime: startTime.trim(), endTime: endTime.trim() };
    const conflict = findOverlappingAppointment(appointments, candidate);
    if (conflict) {
      setError('Orario non disponibile. Scegli un altro orario.');
      return;
    }

    setError(null);
    const appointment: Appointment = {
      id: `appt-${Date.now()}`,
      clientId,
      coachId: DEFAULT_COACH_ID,
      workoutSessionId: workoutSessionId || undefined,
      title: title.trim(),
      date: date.trim(),
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      status: 'scheduled',
      type,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    addAppointment(appointment);
    router.replace('/appuntamenti/index');
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <Card style={styles.card}>
          <Field label="Cliente">
            <View style={styles.chipsRow}>
              {clients.map((client) => {
                const active = client.id === clientId;
                return (
                  <Pressable key={client.id} onPress={() => setClientId(client.id)}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {clientFullName(client)}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Titolo">
            <ThemedTextInput value={title} onChangeText={setTitle} placeholder="Es. Sessione Pull+Gambe" />
          </Field>

          <Field label="Data appuntamento (AAAA-MM-GG)">
            <ThemedTextInput value={date} onChangeText={setDate} placeholder="2026-07-05" />
          </Field>
          <View style={styles.fieldsRow}>
            <Field label="Ora inizio (HH:mm)">
              <ThemedTextInput value={startTime} onChangeText={setStartTime} placeholder="17:30" />
            </Field>
            <Field label="Ora fine (HH:mm)">
              <ThemedTextInput value={endTime} onChangeText={setEndTime} placeholder="18:30" />
            </Field>
          </View>

          <Field label="Tipo appuntamento">
            <View style={styles.chipsRow}>
              {APPOINTMENT_TYPES.map((option) => {
                const active = option === type;
                return (
                  <Pressable key={option} onPress={() => setType(option)}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {APPOINTMENT_TYPE_LABEL[option]}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Scheda collegata (opzionale)">
            {clientSessions.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Questo cliente non ha ancora schede da collegare.
              </ThemedText>
            ) : (
              <View style={styles.chipsRow}>
                {clientSessions.map((session) => {
                  const active = session.id === workoutSessionId;
                  return (
                    <Pressable key={session.id} onPress={() => setWorkoutSessionId(active ? '' : session.id)}>
                      <View
                        style={[
                          styles.chip,
                          { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                        ]}>
                        <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                          {session.name}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Field>

          <Field label="Note (opzionale)">
            <ThemedTextInput value={notes} onChangeText={setNotes} placeholder="Note interne" multiline />
          </Field>
        </Card>

        {error && (
          <ThemedText type="small" themeColor="statusExpired" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable onPress={handleSave}>
          <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              Crea appuntamento
            </ThemedText>
          </View>
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.three,
  },
  field: {
    gap: 4,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  error: {
    marginTop: -Spacing.two,
  },
  saveButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
