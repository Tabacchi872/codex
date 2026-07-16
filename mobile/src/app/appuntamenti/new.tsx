import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField, BackHeader } from '@/components/ui';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { createAppointment } from '@/lib/appointment-service';
import { findOverlappingAppointment, isValidTimeRange } from '@/lib/appointment-overlap';
import { clientFullName } from '@/lib/client-helpers';
import { formatDateForDisplay, parseDateFromDisplay } from '@/lib/format-date';
import { notifyAppointmentPush } from '@/lib/push-notification-service';
import { supabaseConfig } from '@/lib/supabase';
import { getClientPlans } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentType } from '@/types/appointment';

const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

export default function NuovoAppuntamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { clientId: initialClientId, workoutSessionId: initialSessionId } = useLocalSearchParams<{
    clientId?: string;
    workoutSessionId?: string;
  }>();

  const { clients, coachId, loading: clientsLoading, error: clientsError } = useCoachClients();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const appointments = useAppointmentStore((s) => s.appointments);
  const addAppointment = useAppointmentStore((s) => s.addAppointment);

  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(formatDateForDisplay(new Date().toISOString().slice(0, 10)));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<AppointmentType>('workout');
  const [workoutSessionId, setWorkoutSessionId] = useState(initialSessionId ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clientSessions = useMemo(() => getClientPlans(workoutPlans, clientId), [workoutPlans, clientId]);
  const stackFieldPairs = width < 390;

  useEffect(() => {
    if (clients.length === 0) {
      if (clientId) setClientId('');
      return;
    }
    if (clientId && clients.some((client) => client.id === clientId)) return;
    const initialClient = initialClientId ? clients.find((client) => client.id === initialClientId) : null;
    setClientId(initialClient?.id ?? clients[0].id);
  }, [clientId, clients, initialClientId]);

  useEffect(() => {
    if (!workoutSessionId) return;
    if (!clientSessions.some((session) => session.id === workoutSessionId)) {
      setWorkoutSessionId('');
    }
  }, [clientSessions, workoutSessionId]);

  function handleClientSelect(nextClientId: string) {
    if (nextClientId === clientId) return;
    setClientId(nextClientId);
    setWorkoutSessionId('');
  }

  async function handleSave() {
    if (saving) return;
    if (supabaseConfig.isConfigured && clientsLoading) {
      setError('Caricamento clienti in corso. Attendi un momento.');
      return;
    }
    if (!clientId) {
      setError('Seleziona un cliente.');
      return;
    }
    if (!clients.some((client) => client.id === clientId)) {
      setError('Il cliente selezionato non risulta collegato al tuo account.');
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
    if (workoutSessionId && !clientSessions.some((session) => session.id === workoutSessionId)) {
      setWorkoutSessionId('');
      setError('La scheda selezionata non appartiene al cliente scelto.');
      return;
    }

    let effectiveCoachId: string;
    if (supabaseConfig.isConfigured) {
      if (coachId == null) {
        setError('Sessione coach non disponibile. Esci e accedi nuovamente.');
        return;
      }
      effectiveCoachId = coachId;
    } else {
      effectiveCoachId = DEFAULT_COACH_ID;
    }
    const candidate = { coachId: effectiveCoachId, date: isoDate, startTime: startTime.trim(), endTime: endTime.trim() };
    const conflict = findOverlappingAppointment(appointments, candidate);
    if (conflict) {
      setError('Orario non disponibile. Scegli un altro orario.');
      return;
    }

    setError(null);
    const draft = {
      clientId,
      workoutSessionId: workoutSessionId || undefined,
      title: title.trim(),
      date: isoDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      status: 'scheduled' as const,
      type,
      notes: notes.trim() || undefined,
    };

    // Fase 5: quando Supabase e' configurato l'appuntamento viene creato PRIMA
    // sulla fonte reale (public.appointments, coach_id dalla sessione reale,
    // mai DEFAULT_COACH_ID) e solo in caso di successo mirrorato nello store
    // locale con l'id/coachId reali restituiti dal DB. Se fallisce, errore
    // visibile e NESSUNA scrittura locale (mai un successo simulato).
    if (supabaseConfig.isConfigured) {
      setSaving(true);
      const result = await createAppointment(draft);
      setSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      addAppointment(result.data);
      // Push al cliente per il nuovo appuntamento (best-effort, mai bloccante).
      notifyAppointmentPush('appointment_created', result.data.clientId, result.data.title);
      router.replace('/appuntamenti');
      return;
    }

    const appointment: Appointment = {
      id: `appt-${Date.now()}`,
      coachId: DEFAULT_COACH_ID,
      createdAt: new Date().toISOString(),
      ...draft,
    };
    addAppointment(appointment);
    router.replace('/appuntamenti');
  }

  return (
    <AppScreen>
      <BackHeader title="Nuovo appuntamento" fallbackHref={initialClientId ? `/clienti/${initialClientId}` : '/appuntamenti'} />
      <AppCard style={styles.card}>
        <Field label="Cliente">
          {clientsLoading ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento clienti...</Text> : null}
          {clientsError ? <Text style={[styles.smallText, { color: colors.rust }]}>{clientsError}</Text> : null}
          {!clientsLoading && clients.length === 0 ? (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun cliente collegato al tuo account.</Text>
          ) : null}
          <View style={styles.chipsRow}>
            {clients.map((client) => (
              <Chip key={client.id} label={clientFullName(client)} active={client.id === clientId} onPress={() => handleClientSelect(client.id)} />
            ))}
          </View>
        </Field>

        <AppTextField label="Titolo" value={title} onChangeText={setTitle} placeholder="Es. Sessione Pull+Gambe" />
        <AppTextField label="Data appuntamento" value={date} onChangeText={setDate} placeholder="gg/mm/aaaa" />
        <View style={[styles.fieldsRow, stackFieldPairs && styles.fieldsColumn]}>
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

      <AppButton
        label={saving ? 'Creazione...' : 'Crea appuntamento'}
        onPress={handleSave}
        loading={saving}
        disabled={saving || clientsLoading || clients.length === 0}
        fullWidth
        size="lg"
      />
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
    width: '100%',
    minWidth: 0,
  },
  fieldsColumn: {
    flexDirection: 'column',
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
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
