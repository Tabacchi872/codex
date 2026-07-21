import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField, BackHeader } from '@/components/ui';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { createAppointment } from '@/lib/appointment-service';
import { findAppointmentAlreadyLinkedToWorkout, findOverlappingAppointment, isValidTimeRange } from '@/lib/appointment-overlap';
import { clientFullName } from '@/lib/client-helpers';
import { formatDateForDisplay, formatDayMonth, parseDateFromDisplay } from '@/lib/format-date';
import { notifyAppointmentPush } from '@/lib/push-notification-service';
import { supabaseConfig } from '@/lib/supabase';
import { getClientProgramsWithPendingWorkout, nextPendingPlanInGroup, planWorkoutLabel, type WorkoutProgramGroup } from '@/lib/workout-sequence';
import { useAppointmentStore } from '@/store/appointment-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentType } from '@/types/appointment';
import type { WorkoutPlan } from '@/types/training';

const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];
// Sentinella locale (mai salvata): nessuna scheda selezionata nel picker
// "Cambia workout" — distinta da '' che invece significa "nessun workout
// collegato all'appuntamento".
const NO_WORKOUT_VALUE = '';

export default function NuovoAppuntamentoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { clientId: initialClientId, workoutSessionId: initialSessionId } = useLocalSearchParams<{
    clientId?: string;
    workoutSessionId?: string;
  }>();

  const { clients: allClients, coachId, loading: clientsLoading, error: clientsError } = useCoachClients();
  // Solo clienti active possono ricevere nuovi appuntamenti workout — mai
  // suspended/removed (removed non compare nemmeno in allClients, gia'
  // escluso da listCoachClientsForCurrentUser via RLS).
  const clients = useMemo(() => allClients.filter((c) => c.connectionStatus === 'active'), [allClients]);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const appointments = useAppointmentStore((s) => s.appointments);
  const addAppointment = useAppointmentStore((s) => s.addAppointment);

  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [date, setDate] = useState(formatDateForDisplay(new Date().toISOString().slice(0, 10)));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<AppointmentType>('workout');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Passo 1: le schede assegnate e non concluse del cliente, raggruppate per
  // programma (Workout A/B/C di uno stesso modello) — mai i modelli della
  // libreria, solo workout_plans reali gia' assegnati.
  const programs = useMemo(() => getClientProgramsWithPendingWorkout(workoutPlans, clientId), [workoutPlans, clientId]);
  const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
  // '' = nessun workout collegato, altrimenti l'id della scheda reale scelta
  // manualmente da "Cambia workout" (altrimenti si usa la proposta
  // automatica del programma selezionato).
  const [manualPlanId, setManualPlanId] = useState<string | null>(null);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const initialSessionAppliedRef = useRef(!initialSessionId);

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

  // Passo 3: proposta automatica del primo programma con un workout pending
  // — mai un programma "fantasma" rimasto da un cliente precedente.
  useEffect(() => {
    if (programs.length === 0) {
      if (selectedProgramKey !== null) setSelectedProgramKey(null);
      return;
    }
    if (selectedProgramKey && programs.some((g) => g.key === selectedProgramKey)) return;
    setSelectedProgramKey(programs[0].key);
  }, [programs, selectedProgramKey]);

  // Cambiare programma azzera sempre la scelta manuale: si riparte dalla
  // proposta automatica del NUOVO programma selezionato.
  useEffect(() => {
    setManualPlanId(null);
    setShowWorkoutPicker(false);
  }, [selectedProgramKey]);

  // Supporto (best-effort, nessun chiamante attuale lo usa) per un
  // workoutSessionId passato via URL: applicato una sola volta, appena il
  // piano diventa disponibile tra i programmi caricati.
  useEffect(() => {
    if (initialSessionAppliedRef.current || !initialSessionId) return;
    const group = programs.find((g) => g.plans.some((p) => p.id === initialSessionId));
    if (!group) return;
    setSelectedProgramKey(group.key);
    setManualPlanId(initialSessionId);
    initialSessionAppliedRef.current = true;
  }, [programs, initialSessionId]);

  const selectedProgram: WorkoutProgramGroup | null = programs.find((g) => g.key === selectedProgramKey) ?? null;
  const proposedPlan: WorkoutPlan | null = selectedProgram ? nextPendingPlanInGroup(selectedProgram) : null;
  const effectivePlan: WorkoutPlan | null =
    manualPlanId !== null ? (selectedProgram?.plans.find((p) => p.id === manualPlanId) ?? null) : proposedPlan;

  // Titolo pre-compilato dal workout scelto, MAI sovrascritto dopo che il
  // coach lo ha modificato a mano (titleTouched), coerente col placeholder
  // libero gia' esistente prima di questo intervento.
  useEffect(() => {
    if (titleTouched || !effectivePlan) return;
    setTitle(planWorkoutLabel(effectivePlan));
  }, [effectivePlan, titleTouched]);

  const doubleBookingWarning = useMemo(() => {
    if (!effectivePlan) return null;
    const conflict = findAppointmentAlreadyLinkedToWorkout(appointments, effectivePlan.id);
    if (!conflict) return null;
    return `Questo workout è già collegato a un altro appuntamento (${formatDayMonth(conflict.date)} ${conflict.startTime}). Puoi salvare comunque.`;
  }, [appointments, effectivePlan]);

  function handleClientSelect(nextClientId: string) {
    if (nextClientId === clientId) return;
    setClientId(nextClientId);
    setSelectedProgramKey(null);
    setManualPlanId(null);
  }

  function handlePickWorkout(planId: string) {
    setManualPlanId(planId === effectivePlan?.id ? NO_WORKOUT_VALUE : planId);
    setShowWorkoutPicker(false);
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
      setError('Il cliente selezionato non risulta collegato al tuo account o non è più active.');
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
    if (effectivePlan && effectivePlan.clientId !== clientId) {
      setError('Il workout selezionato non appartiene al cliente scelto.');
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
      workoutSessionId: effectivePlan?.id,
      workoutDayId: effectivePlan?.workoutDayId,
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
    // visibile e NESSUNA scrittura locale (mai un successo simulato). Nessun
    // avvio o completamento automatico del workout collegato: la RPC di
    // completamento resta esclusivamente quella del sistema workout.
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
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun cliente active collegato al tuo account.</Text>
          ) : null}
          <View style={styles.chipsRow}>
            {clients.map((client) => (
              <Chip key={client.id} label={clientFullName(client)} active={client.id === clientId} onPress={() => handleClientSelect(client.id)} />
            ))}
          </View>
        </Field>

        <AppTextField
          label="Titolo"
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setTitleTouched(true);
          }}
          placeholder="Es. Sessione Pull+Gambe"
        />
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

        <Field label="Scheda e workout (opzionale)">
          {!clientId ? (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Seleziona prima un cliente.</Text>
          ) : programs.length === 0 ? (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>
              Questo cliente non ha schede assegnate con un workout ancora da fare.
            </Text>
          ) : (
            <View style={{ gap: AppSpacing[2] }}>
              {programs.length > 1 ? (
                <View>
                  <Text style={[styles.subLabel, { color: colors.inkSoft }]}>Scheda assegnata</Text>
                  <View style={styles.chipsRow}>
                    {programs.map((group) => (
                      <Chip
                        key={group.key}
                        label={group.scheduleName}
                        active={group.key === selectedProgramKey}
                        onPress={() => setSelectedProgramKey(group.key)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View>
                <Text style={[styles.subLabel, { color: colors.inkSoft }]}>Workout proposto</Text>
                {effectivePlan ? (
                  <View style={[styles.workoutProposal, { borderColor: colors.moss, backgroundColor: colors.mossSoft }]}>
                    <Text style={[styles.workoutProposalLabel, { color: colors.moss }]}>{planWorkoutLabel(effectivePlan)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun workout collegato.</Text>
                )}
                {selectedProgram && selectedProgram.plans.filter((p) => (p.sessionStatus ?? 'todo') === 'todo').length > 0 ? (
                  <Pressable onPress={() => setShowWorkoutPicker((v) => !v)} hitSlop={6} style={styles.changeWorkoutButton}>
                    <Text style={[styles.changeWorkoutLabel, { color: colors.coral }]}>
                      {showWorkoutPicker ? 'Chiudi' : 'Cambia workout'}
                    </Text>
                  </Pressable>
                ) : null}
                {showWorkoutPicker && selectedProgram ? (
                  <View style={styles.chipsRow}>
                    <Chip label="Nessun workout" active={effectivePlan === null} onPress={() => handlePickWorkout(NO_WORKOUT_VALUE)} />
                    {selectedProgram.plans
                      .filter((p) => (p.sessionStatus ?? 'todo') === 'todo')
                      .map((plan) => (
                        <Chip
                          key={plan.id}
                          label={planWorkoutLabel(plan)}
                          active={plan.id === effectivePlan?.id}
                          onPress={() => handlePickWorkout(plan.id)}
                        />
                      ))}
                  </View>
                ) : null}
                {doubleBookingWarning ? (
                  <Text style={[styles.smallText, styles.warningText, { color: colors.amber }]}>{doubleBookingWarning}</Text>
                ) : null}
              </View>
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
  subLabel: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
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
  warningText: {
    fontWeight: '600',
    marginTop: 4,
  },
  workoutProposal: {
    borderWidth: 1.5,
    borderRadius: AppRadius.md,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
    alignSelf: 'flex-start',
  },
  workoutProposalLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  changeWorkoutButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  changeWorkoutLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
  },
});
