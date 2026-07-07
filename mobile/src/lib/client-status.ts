import { computeWorkoutPlanStatus, type WorkoutPlan, type WorkoutPlanStatus } from '@/types/training';

// Un cliente non ha un campo "stato" proprio: lo stato è quello della sua scheda
// più rilevante. Se un cliente avesse più schede, si considera quella con la
// scadenza più lontana nel futuro (la "corrente"). Nessuna scheda -> 'expired'
// (va trattato come un cliente da riattivare).
export function getClientActivePlan(plans: WorkoutPlan[], clientId: string): WorkoutPlan | null {
  const clientPlans = plans.filter((p) => p.clientId === clientId);
  if (clientPlans.length === 0) return null;
  return [...clientPlans].sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime())[0];
}

export function getClientStatus(plans: WorkoutPlan[], clientId: string): WorkoutPlanStatus {
  const plan = getClientActivePlan(plans, clientId);
  if (!plan) return 'expired';
  return computeWorkoutPlanStatus(plan.expiryDate);
}
