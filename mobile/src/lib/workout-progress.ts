import { getExerciseById } from '@/data/exercise-library';
import type { Client } from '@/types/client';
import type { SubscriptionPackage } from '@/types/subscription';
import type { WorkoutPlan } from '@/types/training';

// Totale allenamenti del pacchetto quando il cliente non ha ancora un valore
// esplicito (clienti creati prima dell'introduzione del campo, vedi types/client.ts).
// Non è "il numero vero" per quel cliente: è un default dichiarato, sostituito
// non appena il coach imposta un valore reale.
export const DEFAULT_PURCHASED_WORKOUTS = 12;

export function getPurchasedWorkoutsTotal(client: Client | null | undefined): number {
  return client?.purchasedWorkoutsTotal ?? DEFAULT_PURCHASED_WORKOUTS;
}

// Abbonamento "corrente" del cliente: quello attivo più recente (per startDate).
// Se non c'è nessun abbonamento attivo, null — il chiamante ricade sul vecchio
// meccanismo (Client.purchasedWorkoutsTotal + conteggio sessioni completate),
// così i clienti creati prima di questo sistema restano validi senza migrazione.
export function getActiveSubscription(
  subscriptions: SubscriptionPackage[],
  clientId: string | null | undefined
): SubscriptionPackage | null {
  if (!clientId) return null;
  const active = subscriptions
    .filter((s) => s.clientId === clientId && s.status === 'active')
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return active[0] ?? null;
}

// Contatore "completati/acquistati" mostrato al cliente (mai "rimanenti").
// Preferisce l'abbonamento reale se esiste; altrimenti usa il vecchio calcolo
// derivato dalle sessioni completate, per non rompere i clienti senza
// abbonamento esplicito.
export function getWorkoutCounter(
  subscriptions: SubscriptionPackage[],
  plans: WorkoutPlan[],
  client: Client | null | undefined,
  clientId: string | null | undefined
): { completed: number; total: number } {
  const subscription = getActiveSubscription(subscriptions, clientId);
  if (subscription) {
    return { completed: subscription.completedWorkouts, total: subscription.totalWorkoutsPurchased };
  }
  return {
    completed: getCompletedWorkoutsCount(plans, clientId ?? null),
    total: getPurchasedWorkoutsTotal(client),
  };
}

export function getClientPlans(plans: WorkoutPlan[], clientId: string | null): WorkoutPlan[] {
  if (!clientId) return [];
  return plans
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Solo completati/totale acquistati, mai "rimanenti" (regola esplicita del prodotto).
export function getCompletedWorkoutsCount(plans: WorkoutPlan[], clientId: string | null): number {
  return getClientPlans(plans, clientId).filter((p) => p.sessionStatus === 'completed').length;
}

// Il prossimo allenamento da fare: il più vicino nel tempo tra quelli non ancora
// completati/saltati, non semplicemente il primo della lista.
export function getNextWorkoutPlan(plans: WorkoutPlan[], clientId: string | null): WorkoutPlan | null {
  const todo = getClientPlans(plans, clientId).filter((p) => (p.sessionStatus ?? 'todo') === 'todo');
  return todo[0] ?? null;
}

// "Settimana" della sessione: posizione (1-based) della scheda tra tutte quelle
// del cliente ordinate per data, non un campo salvato a parte — evita di
// duplicare un'informazione già derivabile da startDate.
export function getSessionWeekNumber(plans: WorkoutPlan[], plan: WorkoutPlan): number {
  const ordered = getClientPlans(plans, plan.clientId);
  const index = ordered.findIndex((p) => p.id === plan.id);
  return index === -1 ? 1 : index + 1;
}

// "Giorno N" mostrato come badge: il numero del giorno della settimana di
// startDate (Lunedì = 1 ... Domenica = 7), non un contatore salvato a parte.
export function getSessionDayNumber(plan: WorkoutPlan): number {
  const jsDay = new Date(plan.startDate).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// Etichetta mostrata per "giorno"/"settimana": usa l'override esplicito del
// coach (plan.dayLabel/weekLabel, impostabile in creazione scheda) se presente,
// altrimenti ricade sul valore derivato automaticamente come già accadeva.
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
// non è vuoto (nessun bottone finto quando la scheda non ha cardio).
export function getCardioExerciseIds(plan: WorkoutPlan): string[] {
  return plan.exercises
    .filter((we) => getExerciseById(we.exerciseId)?.muscleGroup === 'Cardio/Funzionale')
    .map((we) => we.id);
}
