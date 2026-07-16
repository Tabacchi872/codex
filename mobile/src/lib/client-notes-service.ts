import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';

import type { ClientNote, ClientNoteCategory, ClientNoteInput, ClientNoteVisibility } from '@/types/client-note';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const NOTE_COLUMNS =
  'id,coach_id,client_id,category,content,visibility,plan_id,appointment_id,created_by,created_at,updated_by,updated_at,deleted_at';

export async function listClientNotes(clientId: string): Promise<ServiceResult<ClientNote[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase
    .from('client_notes')
    .select(NOTE_COLUMNS)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return dbError('notes_load_failed', 'Impossibile caricare le note cliente.', error);
  return { ok: true, data: ((data ?? []) as unknown as NoteRow[]).map(mapNoteRow) };
}

export async function createClientNote(clientId: string, input: ClientNoteInput): Promise<ServiceResult<ClientNote>> {
  const validation = validateNoteInput(input);
  if (!validation.ok) return validation;
  const auth = await getAuthorizedCoach(clientId);
  if (!auth.ok) return auth;
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      coach_id: auth.data.coachId,
      client_id: clientId,
      category: input.category,
      content: input.content.trim(),
      visibility: input.visibility,
      plan_id: input.planId || null,
      appointment_id: input.appointmentId || null,
      created_by: auth.data.userId,
      updated_by: auth.data.userId,
    })
    .select(NOTE_COLUMNS)
    .single();

  if (error || !data) return dbError('note_create_failed', 'Impossibile salvare la nota.', error);
  return { ok: true, data: mapNoteRow(data as unknown as NoteRow) };
}

export async function updateClientNote(noteId: string, clientId: string, input: ClientNoteInput): Promise<ServiceResult<ClientNote>> {
  const validation = validateNoteInput(input);
  if (!validation.ok) return validation;
  const auth = await getAuthorizedCoach(clientId);
  if (!auth.ok) return auth;
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from('client_notes')
    .update({
      category: input.category,
      content: input.content.trim(),
      visibility: input.visibility,
      plan_id: input.planId || null,
      appointment_id: input.appointmentId || null,
      updated_by: auth.data.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error) return dbError('note_update_failed', 'Impossibile aggiornare la nota.', error);
  if (!data) return { ok: false, code: 'note_not_found', message: 'La nota non e piu disponibile.' };
  return { ok: true, data: mapNoteRow(data as unknown as NoteRow) };
}

export async function deleteClientNote(noteId: string, clientId: string): Promise<ServiceResult<null>> {
  const auth = await getAuthorizedCoach(clientId);
  if (!auth.ok) return auth;
  if (!supabase) return notConfigured();

  const { data, error } = await supabase
    .from('client_notes')
    .update({ deleted_at: new Date().toISOString(), updated_by: auth.data.userId, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) return dbError('note_delete_failed', 'Impossibile eliminare la nota.', error);
  if (!data) return { ok: false, code: 'note_not_found', message: 'La nota non e piu disponibile.' };
  return { ok: true, data: null };
}

async function getAuthorizedCoach(clientId: string): Promise<ServiceResult<{ coachId: string; userId: string }>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const session = await getCurrentSession();
  if (!session.ok || !session.data) return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  const coachId = session.data.user.id;
  const { data, error } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) return dbError('client_link_check_failed', 'Impossibile verificare il collegamento cliente.', error);
  if (!data) return { ok: false, code: 'client_not_linked', message: 'Il cliente non risulta collegato al tuo account.' };
  return { ok: true, data: { coachId, userId: session.data.user.id } };
}

function validateNoteInput(input: ClientNoteInput): ServiceResult<null> {
  if (!input.content.trim()) return { ok: false, code: 'empty_note', message: 'Scrivi il testo della nota.' };
  return { ok: true, data: null };
}

type NoteRow = Record<string, unknown>;

function mapNoteRow(row: NoteRow): ClientNote {
  return {
    id: String(row.id),
    coachId: String(row.coach_id),
    clientId: String(row.client_id),
    category: normalizeCategory(row.category),
    content: String(row.content ?? ''),
    visibility: normalizeVisibility(row.visibility),
    planId: nullableString(row.plan_id),
    appointmentId: nullableString(row.appointment_id),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedBy: nullableString(row.updated_by),
    updatedAt: String(row.updated_at),
    deletedAt: nullableString(row.deleted_at),
  };
}

function normalizeCategory(value: unknown): ClientNoteCategory {
  const category = typeof value === 'string' ? value : '';
  if (
    category === 'generale' ||
    category === 'allenamento' ||
    category === 'nutrizione' ||
    category === 'obiettivo' ||
    category === 'limitazione' ||
    category === 'appuntamento' ||
    category === 'progressi' ||
    category === 'altro'
  ) {
    return category;
  }
  return 'generale';
}

function normalizeVisibility(value: unknown): ClientNoteVisibility {
  return value === 'shared' ? 'shared' : 'coach_only';
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function notConfigured(): ServiceResult<never> {
  return { ok: false, code: 'not_configured', message: 'Supabase non configurato in questo ambiente.' };
}

function dbError(code: string, message: string, error: unknown): ServiceResult<never> {
  logSupabaseError(`CLIENT_NOTES_${code.toUpperCase()}`, error);
  const info = readError(error);
  const lower = info.message.toLowerCase();
  if (lower.includes('row-level security') || info.code === '42501') {
    return { ok: false, code: 'rls_denied', message: 'Permessi insufficienti per questa operazione.' };
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return { ok: false, code: 'network_error', message: 'Errore di rete. Riprova tra poco.' };
  }
  if (lower.includes('violates foreign key')) {
    return { ok: false, code: 'invalid_link', message: 'Il collegamento selezionato non e valido per questo cliente.' };
  }
  return { ok: false, code, message };
}

function logSupabaseError(label: string, error: unknown) {
  if (!__DEV__) return;
  const info = readError(error);
  console.error(label, { code: info.code, message: info.message, details: info.details, hint: info.hint });
}

function readError(error: unknown) {
  const item = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof item.code === 'string' ? item.code : undefined,
    message: typeof item.message === 'string' ? item.message : '',
    details: typeof item.details === 'string' ? item.details : '',
    hint: typeof item.hint === 'string' ? item.hint : '',
  };
}
