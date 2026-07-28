import { supabase, supabaseConfig } from './supabase';

import type { AppNotification } from '@/types/app-notification';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_ERROR = 'Non è stato possibile completare l\'operazione. Riprova.';

function describeError(message: string): string {
  if (message.includes('NOT_AUTHENTICATED')) return 'Sessione scaduta: effettua di nuovo il login.';
  if (message.includes('FORBIDDEN_OR_NOT_FOUND')) return 'Notifica non trovata.';
  return GENERIC_ERROR;
}

type NotificationRow = {
  id: string;
  recipient_id: string;
  recipient_role: 'cliente' | 'coach' | 'superadmin';
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  dedup_key: string | null;
};

function mapRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    recipientRole: row.recipient_role,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
    dedupKey: row.dedup_key,
  };
}

// Nessun parametro obbligatorio: la RPC risolve sempre da sola il chiamante
// (auth.uid()), mai un id passato dal client — stesso identico pattern gia'
// usato da ogni altra RPC "self" del progetto (submit_monthly_checkin,
// run_cycle_review, ecc.).
export async function listMyNotifications(beforeIso?: string): Promise<ServiceResult<AppNotification[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: [] };

  const { data, error } = await supabase.rpc('list_my_notifications', {
    p_limit: 50,
    p_before: beforeIso ?? null,
  });

  if (error) {
    if (__DEV__) console.warn('APP_NOTIFICATIONS_LIST_ERROR', error.message);
    return { ok: false, message: describeError(error.message) };
  }

  return { ok: true, data: ((data as NotificationRow[]) ?? []).map(mapRow) };
}

export async function countMyUnreadNotifications(): Promise<ServiceResult<number>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: 0 };

  const { data, error } = await supabase.rpc('count_my_unread_notifications');
  if (error) {
    if (__DEV__) console.warn('APP_NOTIFICATIONS_COUNT_ERROR', error.message);
    return { ok: false, message: describeError(error.message) };
  }

  return { ok: true, data: (data as number) ?? 0 };
}

export async function markNotificationRead(notificationId: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId });
  if (error) {
    if (__DEV__) console.warn('APP_NOTIFICATIONS_MARK_READ_ERROR', error.message);
    return { ok: false, message: describeError(error.message) };
  }

  return { ok: true, data: null };
}

export async function markAllNotificationsRead(): Promise<ServiceResult<number>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: 0 };

  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) {
    if (__DEV__) console.warn('APP_NOTIFICATIONS_MARK_ALL_READ_ERROR', error.message);
    return { ok: false, message: describeError(error.message) };
  }

  return { ok: true, data: (data as number) ?? 0 };
}
