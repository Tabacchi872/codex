// Notifica interna (tabella app_notifications, condivisa da cliente e
// Superadmin — RLS scopes ognuno alle proprie righe). `data` contiene solo
// id di navigazione (cycle_id/client_id/checkin_id/coach_id/review_id): mai
// una fonte di autorizzazione, solo un suggerimento — la schermata di
// destinazione rivalida sempre da sola i permessi.
export type AppNotificationRecipientRole = 'cliente' | 'coach' | 'superadmin';

export type AppNotificationType =
  | 'auto_program_assigned'
  | 'auto_program_requires_supervision'
  | 'auto_program_override_applied'
  | 'auto_program_coach_assigned'
  | 'review_progress_applied'
  | 'review_simplified'
  | 'review_exercises_replaced'
  | 'review_maintained'
  | 'review_insufficient_data'
  | 'review_blocked_subscription'
  | 'review_blocked_safety'
  | 'review_blocked_safety_client'
  | 'review_blocked_no_template'
  | 'review_manual_required'
  | (string & {});

export type AppNotification = {
  id: string;
  recipientId: string;
  recipientRole: AppNotificationRecipientRole;
  type: AppNotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  dedupKey: string | null;
};
