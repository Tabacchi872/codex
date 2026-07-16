import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';

import type { Appointment, AppointmentStatus, AppointmentType } from '@/types/appointment';

// Servizio appuntamenti su Supabase (public.appointments, fase 5): quando
// Supabase e' configurato questa e' la fonte principale — useAppointmentStore
// resta solo il mirror/cache locale letto dalle schermate (aggiornato da
// use-appointments-realtime.ts). Stesso pattern {ok,data}|{ok:false,...} di
// workout-plan-service.ts: nessuna eccezione non gestita.
//
// Fusi orari: nel DB start_at/end_at sono timestamptz (UTC). Il modello TS
// Appointment usa date "AAAA-MM-GG" + orari "HH:mm" LOCALI (tutta la UI
// esistente ragiona cosi'): la conversione avviene SOLO qui — comporre un
// Date dal testo senza suffisso Z lo interpreta nel fuso locale del device,
// toISOString() lo salva in UTC; in lettura i getter locali di Date
// riportano l'orario del device.

export type AppointmentServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const NOT_CONFIGURED: AppointmentServiceResult<never> = {
  ok: false,
  code: 'not_configured',
  message: 'Supabase non e\' configurato su questo ambiente.',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

const VALID_STATUS: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled'];
const VALID_TYPES: AppointmentType[] = ['workout', 'extra_session', 'consultation', 'checkin'];

function toLocalDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function toUtcIso(date: string, time: string): string | null {
  // Interpretazione LOCALE esplicita (nessuna 'Z'): il coach inserisce
  // l'orario del proprio fuso, il DB riceve l'equivalente UTC.
  const composed = new Date(`${date}T${time}:00`);
  return Number.isNaN(composed.getTime()) ? null : composed.toISOString();
}

type AppointmentRow = {
  id: string;
  coach_id: string;
  client_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: string;
  type: string | null;
  workout_session_id: string | null;
  created_at: string;
};

function mapRowToAppointment(row: AppointmentRow): Appointment {
  const start = toLocalDate(row.start_at);
  const end = toLocalDate(row.end_at);
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    workoutSessionId: row.workout_session_id ?? undefined,
    title: row.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    status: (VALID_STATUS as string[]).includes(row.status) ? (row.status as AppointmentStatus) : 'scheduled',
    type: (VALID_TYPES as string[]).includes(row.type ?? '') ? (row.type as AppointmentType) : 'workout',
    notes: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

const ROW_COLUMNS = 'id,coach_id,client_id,title,description,start_at,end_at,status,type,workout_session_id,created_at';

// Lettura RLS-scoped: il coach vede solo i propri appuntamenti, il cliente
// solo quelli in cui e' client_id — nessun filtro applicativo necessario
// oltre alla sessione.
export async function listAppointmentsForCurrentUser(): Promise<AppointmentServiceResult<Appointment[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.from('appointments').select(ROW_COLUMNS).order('start_at', { ascending: true });
  if (error) {
    console.log('APPOINTMENTS_REMOTE_LOAD', { ok: false });
    return { ok: false, code: 'load_failed', message: 'Impossibile caricare gli appuntamenti. Riprova.' };
  }
  console.log('APPOINTMENTS_REMOTE_LOAD', { ok: true, count: data?.length ?? 0 });
  return { ok: true, data: (data as AppointmentRow[]).map(mapRowToAppointment) };
}

export async function createAppointment(
  appointment: Omit<Appointment, 'id' | 'coachId' | 'createdAt'>,
): Promise<AppointmentServiceResult<Appointment>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const session = await getCurrentSession();
  if (!session.ok || !session.data) {
    return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  }
  const startAt = toUtcIso(appointment.date, appointment.startTime);
  const endAt = toUtcIso(appointment.date, appointment.endTime);
  if (!startAt || !endAt || endAt <= startAt) {
    return { ok: false, code: 'invalid_datetime', message: 'Data o orario non validi.' };
  }

  const coachId = session.data.user.id;
  const scope = await validateAppointmentScope(coachId, appointment);
  if (!scope.ok) return scope.result;

  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        coach_id: coachId,
        client_id: appointment.clientId,
        title: appointment.title,
        description: appointment.notes ?? null,
        start_at: startAt,
        end_at: endAt,
        status: appointment.status,
        type: appointment.type,
        workout_session_id: appointment.workoutSessionId ?? null,
      })
      .select(ROW_COLUMNS)
      .single();

    if (error || !data) {
      return mapCreateAppointmentError(error, data ? 'no_error_but_no_data' : undefined);
    }
    return { ok: true, data: mapRowToAppointment(data as AppointmentRow) };
  } catch (error) {
    logSupabaseError('APPOINTMENT_CREATE_THROW', error);
    return mapThrownAppointmentError(error);
  }
}

async function validateAppointmentScope(
  coachId: string,
  appointment: Omit<Appointment, 'id' | 'coachId' | 'createdAt'>,
): Promise<{ ok: true } | { ok: false; result: AppointmentServiceResult<never> }> {
  if (!supabase) return { ok: false, result: NOT_CONFIGURED };
  if (!isValidUuid(appointment.clientId)) {
    return {
      ok: false,
      result: { ok: false, code: 'client_not_linked', message: 'Il cliente selezionato non risulta collegato al tuo account.' },
    };
  }

  const { data: link, error: linkError } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('client_id', appointment.clientId)
    .eq('status', 'active')
    .maybeSingle();

  if (linkError) {
    logSupabaseError('APPOINTMENT_CLIENT_LINK_CHECK_ERROR', linkError);
    return { ok: false, result: mapCreateAppointmentError(linkError) };
  }
  if (!link) {
    return {
      ok: false,
      result: { ok: false, code: 'client_not_linked', message: 'Il cliente selezionato non risulta collegato al tuo account.' },
    };
  }

  if (!appointment.workoutSessionId) return { ok: true };
  if (!isValidUuid(appointment.workoutSessionId)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'workout_plan_not_synced',
        message: 'La scheda selezionata non e ancora sincronizzata con Supabase.',
      },
    };
  }

  const { data: plan, error: planError } = await supabase
    .from('workout_plans')
    .select('id')
    .eq('id', appointment.workoutSessionId)
    .eq('coach_id', coachId)
    .eq('client_id', appointment.clientId)
    .maybeSingle();

  if (planError) {
    logSupabaseError('APPOINTMENT_PLAN_SCOPE_CHECK_ERROR', planError);
    return { ok: false, result: mapCreateAppointmentError(planError) };
  }
  if (!plan) {
    return {
      ok: false,
      result: { ok: false, code: 'workout_plan_client_mismatch', message: 'La scheda selezionata non appartiene al cliente scelto.' },
    };
  }

  return { ok: true };
}

function mapCreateAppointmentError(error: unknown, fallbackCode = 'create_failed'): AppointmentServiceResult<never> {
  logSupabaseError('APPOINTMENT_CREATE_ERROR', error);
  const info = readSupabaseErrorInfo(error);
  const code = info.code;
  const message = info.message.toLowerCase();
  const details = info.details.toLowerCase();

  if (code === '23514') {
    return { ok: false, code: 'invalid_datetime', message: 'Data o orario non validi.' };
  }
  if (code === '23503') {
    const isWorkoutPlan = message.includes('workout') || details.includes('workout');
    return isWorkoutPlan
      ? { ok: false, code: 'workout_plan_client_mismatch', message: 'La scheda selezionata non appartiene al cliente scelto.' }
      : { ok: false, code: 'client_not_linked', message: 'Il cliente selezionato non risulta collegato al tuo account.' };
  }
  if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return { ok: false, code: 'rls_denied', message: 'Permessi insufficienti per creare questo appuntamento.' };
  }
  if (code === '42703') {
    return { ok: false, code: 'schema_mismatch', message: 'Schema appuntamenti non aggiornato. Controlla la migration Supabase.' };
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return { ok: false, code: 'network_error', message: 'Errore di rete. Riprova tra poco.' };
  }

  return { ok: false, code: fallbackCode, message: 'Impossibile creare l\'appuntamento. Riprova.' };
}

function mapThrownAppointmentError(error: unknown): AppointmentServiceResult<never> {
  const info = readSupabaseErrorInfo(error);
  if (info.message.toLowerCase().includes('network') || info.message.toLowerCase().includes('failed to fetch')) {
    return { ok: false, code: 'network_error', message: 'Errore di rete. Riprova tra poco.' };
  }
  return { ok: false, code: 'unknown_error', message: 'Errore imprevisto durante la creazione dell\'appuntamento.' };
}

function logSupabaseError(label: string, error: unknown): void {
  if (!__DEV__) return;
  const info = readSupabaseErrorInfo(error);
  console.error(label, {
    code: info.code,
    message: info.message,
    details: info.details,
    hint: info.hint,
  });
}

function readSupabaseErrorInfo(error: unknown) {
  const item = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof item.code === 'string' ? item.code : undefined,
    message: typeof item.message === 'string' ? item.message : '',
    details: typeof item.details === 'string' ? item.details : '',
    hint: typeof item.hint === 'string' ? item.hint : '',
  };
}

export async function updateAppointment(appointment: Appointment): Promise<AppointmentServiceResult<Appointment>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  if (!isValidUuid(appointment.id)) {
    // Appuntamento solo locale (creato prima del collegamento Supabase):
    // nessuna riga remota da aggiornare, il chiamante aggiorna solo il mirror.
    return { ok: false, code: 'local_only', message: 'Appuntamento non ancora sincronizzato con Supabase.' };
  }
  const startAt = toUtcIso(appointment.date, appointment.startTime);
  const endAt = toUtcIso(appointment.date, appointment.endTime);
  if (!startAt || !endAt) {
    return { ok: false, code: 'invalid_datetime', message: 'Data o orario non validi.' };
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({
      title: appointment.title,
      description: appointment.notes ?? null,
      start_at: startAt,
      end_at: endAt,
      status: appointment.status,
      type: appointment.type,
      workout_session_id: appointment.workoutSessionId ?? null,
    })
    .eq('id', appointment.id)
    .select(ROW_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, code: 'update_failed', message: 'Impossibile aggiornare l\'appuntamento. Riprova.' };
  }
  return { ok: true, data: mapRowToAppointment(data as AppointmentRow) };
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
): Promise<AppointmentServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  if (!isValidUuid(id)) return { ok: true, data: null };
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) {
    return { ok: false, code: 'update_failed', message: 'Impossibile aggiornare lo stato. Riprova.' };
  }
  return { ok: true, data: null };
}

export async function deleteAppointment(id: string): Promise<AppointmentServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  if (!isValidUuid(id)) return { ok: true, data: null };
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) {
    return { ok: false, code: 'delete_failed', message: 'Impossibile eliminare l\'appuntamento. Riprova.' };
  }
  return { ok: true, data: null };
}
