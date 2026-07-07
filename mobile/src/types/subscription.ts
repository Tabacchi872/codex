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
