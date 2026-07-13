import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { findOverlappingAppointment, isValidTimeRange } from '@/lib/appointment-overlap';
import { clientFullName } from '@/lib/client-helpers';
import { formatDateForDisplay, parseDateFromDisplay } from '@/lib/format-date';
import { getClientPlans } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentType } from '@/types/appointment';

const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

export default function NuovoAppuntamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
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
  const [date, setDate] = useState(formatDateForDisplay(new Date().toISOString().slice(0, 10)));
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
    const isoDate = parseDateFromDisplay(date);
    if (!isoDate) {
      setError('Inserisci una data valida nel formato GG/MM/AAAA.');
      return;
    }
    if (!isValidTimeRange(startTime.trim(), endTime.trim())) {
      setError('Inserisci un orario di inizio e fine validi (formato HH:mm), con fine dopo inizio.');
      return;
    }

    const candidate = { coachId: DEFAULT_COACH_ID, date: isoDate, startTime: startTime.trim(), endTime: endTime.trim() };
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
      date: isoDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      status: 'scheduled',
      type,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    addAppointment(appointment);
    router.replace('/appuntamenti');
  }

  return (
    <AppScreen>
      <AppCard style={styles.card}>
        <Field label="Cliente">
          <View style={styles.chipsRow}>
            {clients.map((client) => (
              <Chip key={client.id} label={clientFullName(client)} active={client.id === clientId} onPress={() => setClientId(client.id)} />
            ))}
          </View>
        </Field>

        <AppTextField label="Titolo" value={title} onChangeText={setTitle} placeholder="Es. Sessione Pull+Gambe" />
        <AppTextField label="Data appuntamento" value={date} onChangeText={setDate} placeholder="gg/mm/aaaa" />
        <View style={styles.fieldsRow}>
          <View style={styles.fieldHalf}>
            <AppTextField label="Ora inizio (HH:mm)" value={startTime} onChangeText={setStartTime} placeholder="17:30" />
          </View>
          <View style={styles.fieldHalf}>
            <AppTextField label="Ora fine (HH:mm)" value={endTime} onChangeText={setEndTime} placeholder="18:30" />
          </View>
        </View>

        <Field label="Tipo appuntamento">
          <View style={styles.chipsRow}>
            {APPOINTMENT_TYPES.map((option) => (
              <Chip key={option} label={APPOINTMENT_TYPE_LABEL[option]} active={option === type} onPress={() => setType(option)} />
            ))}
          </View>
        </Field>

        <Field label="Scheda collegata (opzionale)">
          {clientSessions.length === 0 ? (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Questo cliente non ha ancora schede da collegare.</Text>
          ) : (
            <View style={styles.chipsRow}>
              {clientSessions.map((session) => (
                <Chip
                  key={session.id}
                  label={session.name}
                  active={session.id === workoutSessionId}
                  onPress={() => setWorkoutSessionId(session.id === workoutSessionId ? '' : session.id)}
                />
              ))}
            </View>
          )}
        </Field>

        <AppTextField label="Note (opzionale)" value={notes} onChangeText={setNotes} placeholder="Note interne" multiline />
      </AppCard>

      {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

      <AppButton label="Crea appuntamento" onPress={handleSave} fullWidth size="lg" />
    </AppScreen>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
      <Text style={[styles.chipLabel, { color: active ? colors.onMoss : colors.moss }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  fieldHalf: {
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
  },
  chipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
  },
});
