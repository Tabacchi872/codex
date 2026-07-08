// Pacchetto di allenamenti acquistato da un cliente. Prima di questo tipo
// esisteva solo `Client.purchasedWorkoutsTotal` (un numero isolato, senza stato
// né storico): questo modello lo sostituisce come fonte di verità per i
// clienti che ne hanno uno, mantenendo però `purchasedWorkoutsTotal` come
// fallback per i clienti creati prima (vedi lib/workout-progress.ts).
//
// `completedWorkouts` è un campo persistito (non derivato) perché il coach
// deve poterlo correggere manualmente (es. rinnovo, errore, sessioni svolte
// prima di questo sistema) — vedi docs/DECISIONS.md. Viene incrementato in
// automatico di 1 quando una sessione collegata (WorkoutPlan.subscriptionId)
// passa a "completed" (vedi app/schede/[id].tsx, handleFinishSession).
export type SubscriptionStatus = 'active' | 'completed' | 'expired' | 'paused' | 'cancelled';
export type ComputedSubscriptionStatus = 'active' | 'expiring' | 'expired';

export type SubscriptionPackage = {
  id: string;
  clientId: string;
  coachId: string;
  packageName: string;
  totalWorkoutsPurchased: number;
  completedWorkouts: number;
  startDate: string;
  endDate?: string;
  status: SubscriptionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Attivo',
  completed: 'Completato',
  expired: 'Scaduto',
  paused: 'In pausa',
  cancelled: 'Annullato',
};

export const COMPUTED_SUBSCRIPTION_STATUS_LABEL: Record<ComputedSubscriptionStatus, string> = {
  active: 'Attivo',
  expiring: 'In scadenza',
  expired: 'Scaduto',
};

export const SUBSCRIPTION_EXPIRING_WITHIN_DAYS = 7;
export const SUBSCRIPTION_EXPIRING_WITH_REMAINING_WORKOUTS = 2;

export function getSubscriptionRemainingWorkouts(subscription: SubscriptionPackage): number {
  return Math.max(subscription.totalWorkoutsPurchased - subscription.completedWorkouts, 0);
}

export function computeSubscriptionStatus(
  subscription: SubscriptionPackage | null | undefined,
  today = new Date()
): ComputedSubscriptionStatus {
  if (!subscription) return 'expired';
  if (subscription.status !== 'active') return 'expired';
  if (subscription.totalWorkoutsPurchased <= 0) return 'expired';

  const remainingWorkouts = subscription.totalWorkoutsPurchased - subscription.completedWorkouts;
  if (remainingWorkouts <= 0) return 'expired';

  const todayDate = startOfLocalDay(today);
  const startDate = parseLocalDate(subscription.startDate);
  if (!startDate || startDate.getTime() > todayDate.getTime()) return 'expired';

  if (subscription.endDate) {
    const endDate = parseLocalDate(subscription.endDate);
    if (!endDate) return 'expired';
    const daysUntilEnd = (endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilEnd < 0) return 'expired';
    if (daysUntilEnd <= SUBSCRIPTION_EXPIRING_WITHIN_DAYS) return 'expiring';
  }

  if (remainingWorkouts <= SUBSCRIPTION_EXPIRING_WITH_REMAINING_WORKOUTS) return 'expiring';
  return 'active';
}

export function getCurrentSubscription(
  subscriptions: SubscriptionPackage[],
  clientId: string | null | undefined,
  today = new Date()
): SubscriptionPackage | null {
  if (!clientId) return null;
  const clientSubscriptions = subscriptions
    .filter((subscription) => subscription.clientId === clientId)
    .sort(compareSubscriptionsByRecency);

  const current = clientSubscriptions.find((subscription) => computeSubscriptionStatus(subscription, today) !== 'expired');
  return current ?? clientSubscriptions[0] ?? null;
}

export function normalizeSubscriptionStoredStatus(
  subscription: SubscriptionPackage,
  today = new Date()
): SubscriptionPackage {
  if (subscription.status !== 'active') return subscription;
  if (subscription.totalWorkoutsPurchased <= 0) return { ...subscription, status: 'expired' };
  if (subscription.completedWorkouts >= subscription.totalWorkoutsPurchased) return { ...subscription, status: 'completed' };

  const todayDate = startOfLocalDay(today);
  const endDate = subscription.endDate ? parseLocalDate(subscription.endDate) : null;
  if (endDate && endDate.getTime() < todayDate.getTime()) return { ...subscription, status: 'expired' };

  return subscription;
}

function compareSubscriptionsByRecency(a: SubscriptionPackage, b: SubscriptionPackage): number {
  const startDiff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  if (startDiff !== 0) return startDiff;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return startOfLocalDay(date);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
