import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppScreen, AppTextField, BackHeader } from '@/components/ui';
import { useAppointmentsRealtime } from '@/hooks/use-appointments-realtime';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { deleteAppointment, setAppointmentStatus, updateAppointment } from '@/lib/appointment-service';
import { findAppointmentAlreadyLinkedToWorkout, findOverlappingAppointment, isValidTimeRange } from '@/lib/appointment-overlap';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDateForDisplay, formatDayMonth, parseDateFromDisplay } from '@/lib/format-date';
import { notifyAppointmentPush } from '@/lib/push-notification-service';
import { supabaseConfig } from '@/lib/supabase';
import { deriveProgramScheduleName, getClientProgramsWithPendingWorkout, planWorkoutLabel } from '@/lib/workout-sequence';
import { useAppointmentStore } from '@/store/appointment-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPE_LABEL, type Appointment, type AppointmentType } from '@/types/appointment';
import { SESSION_STATUS_LABEL } from '@/types/training';

const APPOINTMENT_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

async function confirmDestructive(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return globalThis.confirm(`${title}\n\n${message}`);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// Dettaglio/modifica di UN appuntamento reale (mai un modello di libreria).
// "Avvia workout" apre sempre /schede/[id] con l'UUID reale del workout_plan
// collegato — quella schermata (logger carichi, non toccata da questo
// intervento) risolve il cliente dal piano stesso, mai da un parametro
// passato qui: non puo' mai aprire il cliente sbagliato. Spostare data/ora
// (modalita' modifica) mantiene di default lo stesso workout collegato: il
// link cambia SOLO se il coach preme esplicitamente "Cambia workout".
export default function AppuntamentoDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();

  const appointments = useAppointmentStore((s) => s.appointments);
  const updateAppointmentLocal = useAppointmentStore((s) => s.updateAppointment);
  const { refresh } = useAppointmentsRealtime();
  const { clients } = useCoachClients();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<AppointmentType>('workout');
  const [editWorkoutPlanId, setEditWorkoutPlanId] = useState<string | null>(null);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const foundAppointment = appointments.find((a) => a.id === id) ?? null;

  if (!foundAppointment) {
    return (
      <AppScreen>
        <BackHeader title="Appuntamento" fallbackHref="/appuntamenti" />
        <AppCard>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Appuntamento non trovato.</Text>
          <Text style={{ color: colors.inkSoft, marginTop: 4 }}>Potrebbe essere stato eliminato.</Text>
        </AppCard>
      </AppScreen>
    );
  }
  // Binding con tipo dichiarato esplicitamente non-null: una closure
  // definita sotto (le funzioni handle*) non erediterebbe altrimenti il
  // narrowing di `foundAppointment` fatto dal guard sopra (limite noto di
  // TypeScript sulle closure), obbligando un cast/controllo ripetuto in ogni
  // funzione — qui basta una volta.
  const appt: Appointment = foundAppointment;

  const client = getClientById(clients, appt.clientId);
  const linkedPlan = appt.workoutSessionId ? (workoutPlans.find((p) => p.id === appt.workoutSessionId) ?? null) : null;
  const linkedPlanStatus = linkedPlan?.sessionStatus ?? (linkedPlan ? 'todo' : null);
  const canStartWorkout = !!linkedPlan && linkedPlanStatus === 'todo' && appt.status !== 'cancelled';

  function enterEdit() {
    setTitle(appt.title);
    setDate(formatDateForDisplay(appt.date));
    setStartTime(appt.startTime);
    setEndTime(appt.endTime);
    setNotes(appt.notes ?? '');
    setType(appt.type);
    setEditWorkoutPlanId(appt.workoutSessionId ?? null);
    setShowWorkoutPicker(false);
    setError(null);
    setMode('edit');
  }

  const editPrograms = getClientProgramsWithPendingWorkout(workoutPlans, appt.clientId);
  const pendingChoices = editPrograms.flatMap((group) =>
    group.plans
      .filter((p) => (p.sessionStatus ?? 'todo') === 'todo')
      .map((plan) => ({
        plan,
        label: editPrograms.length > 1 ? `${group.scheduleName} — ${planWorkoutLabel(plan)}` : planWorkoutLabel(plan),
      })),
  );
  const editSelectedPlan = editWorkoutPlanId ? (workoutPlans.find((p) => p.id === editWorkoutPlanId) ?? null) : null;
  const editDoubleBookingWarning = editSelectedPlan
    ? (() => {
        const conflict = findAppointmentAlreadyLinkedToWorkout(appointments, editSelectedPlan.id, appt.id);
        return conflict ? `Questo workout è già collegato a un altro appuntamento (${formatDayMonth(conflict.date)} ${conflict.startTime}).` : null;
      })()
    : null;

  async function handleSaveEdit() {
    if (saving) return;
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
    const conflict = findOverlappingAppointment(appointments, {
      id: appt.id,
      coachId: appt.coachId,
      date: isoDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
    });
    if (conflict) {
      setError('Orario non disponibile. Scegli un altro orario.');
      return;
    }

    setError(null);
    const updated: Appointment = {
      ...appt,
      title: title.trim(),
      date: isoDate,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      type,
      notes: notes.trim() || undefined,
      workoutSessionId: editSelectedPlan?.id,
      workoutDayId: editSelectedPlan?.workoutDayId,
    };

    if (supabaseConfig.isConfigured) {
      setSaving(true);
      const result = await updateAppointment(updated);
      setSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      updateAppointmentLocal(result.data);
      setMode('view');
      return;
    }
    updateAppointmentLocal(updated);
    setMode('view');
  }

  // Annullare NON avanza la sequenza dei workout (nessuna scrittura su
  // workout_plans qui, mai): solo lo stato dell'appuntamento cambia.
  async function handleStatusChange(status: Appointment['status']) {
    setStatusError(null);
    if (supabaseConfig.isConfigured) {
      const result = await setAppointmentStatus(appt.id, status);
      if (!result.ok) {
        setStatusError(result.message);
        return;
      }
      if (status === 'cancelled') {
        notifyAppointmentPush('appointment_cancelled', appt.clientId, appt.title);
      }
      refresh();
    }
    updateAppointmentLocal({ ...appt, status });
  }

  // Eliminare l'appuntamento non tocca mai scheda/sessione/storico: solo la
  // riga appointments (FK workout_session_id/workout_day_id "on delete set
  // null" e' nell'altra direzione, non qui).
  async function handleDelete() {
    const confirmed = await confirmDestructive('Elimina appuntamento', `Eliminare "${appt.title}"? La scheda e lo storico del cliente non vengono toccati.`, 'Elimina');
    if (!confirmed) return;
    setDeleting(true);
    setStatusError(null);
    if (supabaseConfig.isConfigured) {
      const result = await deleteAppointment(appt.id);
      setDeleting(false);
      if (!result.ok) {
        setStatusError(result.message);
        return;
      }
      refresh();
    } else {
      setDeleting(false);
    }
    router.replace('/appuntamenti');
  }

  function handleStartWorkout() {
    if (!linkedPlan) return;
    router.push({ pathname: '/schede/[id]', params: { id: linkedPlan.id } });
  }

  if (mode === 'edit') {
    return (
      <AppScreen>
        <BackHeader title="Modifica appuntamento" onBack={() => setMode('view')} fallbackHref="/appuntamenti" />
        <AppCard style={styles.card}>
          <Field label="Cliente">
            <Text style={[styles.value, { color: colors.ink }]}>{client ? clientFullName(client) : 'Cliente'}</Text>
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

          <Field label="Workout collegato">
            <Text style={[styles.value, { color: colors.ink }]}>
              {editSelectedPlan ? planWorkoutLabel(editSelectedPlan) : 'Nessun workout collegato'}
            </Text>
            {pendingChoices.length > 0 ? (
              <Pressable onPress={() => setShowWorkoutPicker((v) => !v)} hitSlop={6} style={styles.changeWorkoutButton}>
                <Text style={[styles.changeWorkoutLabel, { color: colors.coral }]}>{showWorkoutPicker ? 'Chiudi' : 'Cambia workout'}</Text>
              </Pressable>
            ) : null}
            {showWorkoutPicker ? (
              <View style={styles.chipsRow}>
                <Chip label="Nessun workout" active={editWorkoutPlanId === null} onPress={() => setEditWorkoutPlanId(null)} />
                {pendingChoices.map(({ plan, label }) => (
                  <Chip key={plan.id} label={label} active={plan.id === editWorkoutPlanId} onPress={() => setEditWorkoutPlanId(plan.id)} />
                ))}
              </View>
            ) : null}
            {editDoubleBookingWarning ? (
              <Text style={[styles.smallText, styles.warningText, { color: colors.amber }]}>{editDoubleBookingWarning}</Text>
            ) : null}
          </Field>

          <AppTextField label="Note (opzionale)" value={notes} onChangeText={setNotes} placeholder="Note interne" multiline />
        </AppCard>

        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrap}>
            <AppButton label="Annulla modifica" onPress={() => setMode('view')} variant="outline" fullWidth />
          </View>
          <View style={styles.actionButtonWrap}>
            <AppButton label={saving ? 'Salvataggio...' : 'Salva modifiche'} onPress={handleSaveEdit} loading={saving} disabled={saving} fullWidth />
          </View>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <BackHeader title="Appuntamento" fallbackHref="/appuntamenti" />
      <AppCard style={styles.card}>
        <Field label="Cliente">
          <Text style={[styles.value, { color: colors.ink }]}>{client ? clientFullName(client) : 'Cliente'}</Text>
        </Field>
        <Field label="Data e ora">
          <Text style={[styles.value, { color: colors.ink }]}>
            {formatDayMonth(appt.date)} · {appt.startTime}–{appt.endTime}
          </Text>
        </Field>
        <Field label="Titolo">
          <Text style={[styles.value, { color: colors.ink }]}>{appt.title}</Text>
        </Field>
        <Field label="Tipo">
          <AppBadge label={APPOINTMENT_TYPE_LABEL[appt.type]} />
        </Field>
        <Field label="Stato appuntamento">
          <AppBadge label={APPOINTMENT_STATUS_LABEL[appt.status]} tone={appt.status === 'cancelled' ? 'rust' : appt.status === 'completed' ? 'moss' : 'neutral'} />
        </Field>

        <Field label="Scheda">
          {linkedPlan ? (
            <Text style={[styles.value, { color: colors.ink }]}>{deriveProgramScheduleName(linkedPlan)}</Text>
          ) : (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessuna scheda collegata a questo appuntamento.</Text>
          )}
        </Field>
        {linkedPlan ? (
          <Field label="Workout">
            <Text style={[styles.value, { color: colors.ink }]}>{planWorkoutLabel(linkedPlan)}</Text>
            <View style={{ marginTop: 4 }}>
              <AppBadge
                label={SESSION_STATUS_LABEL[linkedPlanStatus ?? 'todo']}
                tone={linkedPlanStatus === 'completed' ? 'moss' : linkedPlanStatus === 'skipped' || linkedPlanStatus === 'cancelled' ? 'rust' : 'amber'}
              />
            </View>
          </Field>
        ) : null}

        {appt.notes ? (
          <Field label="Note">
            <Text style={[styles.value, { color: colors.ink }]}>{appt.notes}</Text>
          </Field>
        ) : null}
      </AppCard>

      {statusError ? <Text style={[styles.errorText, { color: colors.rust }]}>{statusError}</Text> : null}

      {canStartWorkout ? (
        <AppButton label="Avvia workout" onPress={handleStartWorkout} fullWidth size="lg" />
      ) : linkedPlan ? (
        <Text style={[styles.smallText, { color: colors.inkSoft, textAlign: 'center' }]}>
          {appt.status === 'cancelled' ? 'Appuntamento annullato: workout non avviabile da qui.' : 'Questo workout risulta già concluso.'}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <View style={styles.actionButtonWrap}>
          <AppButton label="Modifica" onPress={enterEdit} variant="outline" fullWidth disabled={appt.status === 'cancelled'} />
        </View>
        {appt.status === 'scheduled' ? (
          <>
            <View style={styles.actionButtonWrap}>
              <AppButton label="Completa" onPress={() => handleStatusChange('completed')} variant="secondary" fullWidth />
            </View>
            <View style={styles.actionButtonWrap}>
              <AppButton label="Annulla" onPress={() => handleStatusChange('cancelled')} variant="outline" fullWidth />
            </View>
          </>
        ) : null}
      </View>
      <AppButton label={deleting ? 'Eliminazione...' : 'Elimina appuntamento'} onPress={handleDelete} variant="ghost" loading={deleting} disabled={deleting} fullWidth />
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
      <Text style={[styles.chipLabel, { color: active ? colors.onMoss : colors.moss }]} numberOfLines={1}>
        {label}
      </Text>
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
  value: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: AppSpacing[3],
    width: '100%',
    minWidth: 0,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    marginTop: 6,
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
    maxWidth: '100%',
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
    marginTop: 6,
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
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  actionButtonWrap: {
    flexBasis: 140,
    flexGrow: 1,
    minWidth: 0,
  },
});
