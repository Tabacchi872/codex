import { getExerciseById } from '@/data/exercise-library';
import type { Client } from '@/types/client';
import type { WorkoutPlan } from '@/types/training';

// Contatore schede: misura esclusivamente le schede reali assegnate al cliente.
// Il parametro subscriptions resta per compatibilita' con chiamanti legacy, ma
// non e' piu' fonte di verita' per il progresso cliente.
export function getWorkoutCounter(
  _subscriptions: unknown[],
  plans: WorkoutPlan[],
  client: Client | null | undefined,
  clientId: string | null | undefined
): { completed: number; total: number } {
  const clientPlans = getClientPlans(plans, clientId ?? null);
  return {
    completed: countUniqueCompletedPlans(clientPlans),
    total: client ? clientPlans.length : 0,
  };
}

export function getClientPlans(plans: WorkoutPlan[], clientId: string | null): WorkoutPlan[] {
  if (!clientId) return [];
  return plans
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Solo schede completate tra quelle assegnate al cliente.
export function getCompletedWorkoutsCount(plans: WorkoutPlan[], clientId: string | null): number {
  return countUniqueCompletedPlans(getClientPlans(plans, clientId));
}

// Il prossimo allenamento da fare: il piu' vicino nel tempo tra quelli non ancora
// completati/saltati, non semplicemente il primo della lista.
export function getNextWorkoutPlan(plans: WorkoutPlan[], clientId: string | null): WorkoutPlan | null {
  const todo = getClientPlans(plans, clientId).filter((p) => (p.sessionStatus ?? 'todo') === 'todo');
  return todo[0] ?? null;
}

// "Settimana" della sessione: posizione (1-based) della scheda tra tutte quelle
// del cliente ordinate per data, non un campo salvato a parte.
export function getSessionWeekNumber(plans: WorkoutPlan[], plan: WorkoutPlan): number {
  const ordered = getClientPlans(plans, plan.clientId);
  const index = ordered.findIndex((p) => p.id === plan.id);
  return index === -1 ? 1 : index + 1;
}

// "Giorno N" mostrato come badge: il numero del giorno della settimana di
// startDate (Lunedi' = 1 ... Domenica = 7), non un contatore salvato a parte.
export function getSessionDayNumber(plan: WorkoutPlan): number {
  const jsDay = new Date(plan.startDate).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// Etichetta mostrata per "giorno"/"settimana": usa l'override esplicito del
// coach (plan.dayLabel/weekLabel, impostabile in creazione scheda) se presente,
// altrimenti ricade sul valore derivato automaticamente come gia' accadeva.
export function getSessionDayLabel(plan: WorkoutPlan): string {
  return plan.dayLabel ?? String(getSessionDayNumber(plan));
}

export function getSessionWeekLabel(plans: WorkoutPlan[], plan: WorkoutPlan): string {
  return plan.weekLabel ?? String(getSessionWeekNumber(plans, plan));
}

export function getExerciseCompletionProgress(plan: WorkoutPlan): { completed: number; total: number } {
  const completedIds = plan.completedExerciseIds ?? [];
  return {
    completed: plan.exercises.filter((we) => completedIds.includes(we.id)).length,
    total: plan.exercises.length,
  };
}

// Gli esercizi cardio non sono un campo a parte sulla scheda: sono WorkoutExercise
// il cui Exercise di libreria ha muscleGroup 'Cardio/Funzionale'. Il bottone
// "Cardio da fare" mostrato nel dettaglio scheda esiste solo se questo elenco
// non e' vuoto.
export function getCardioExerciseIds(plan: WorkoutPlan): string[] {
  return plan.exercises
    .filter((we) => getExerciseById(we.exerciseId)?.muscleGroup === 'Cardio/Funzionale')
    .map((we) => we.id);
}

function countUniqueCompletedPlans(plans: WorkoutPlan[]): number {
  const completedIds = new Set<string>();
  for (const plan of plans) {
    if (plan.sessionStatus !== 'completed') continue;
    completedIds.add(plan.id);
  }
  return completedIds.size;
}
