import type { WorkoutPlan } from '@/types/training';

// Determina "il prossimo workout" di un cliente per l'agenda
// (appuntamenti/new.tsx, appuntamenti/[id].tsx) usando solo dati reali e
// persistiti — MAI giorno della settimana, data corrente, nome
// dell'esercizio o indice locale non persistente.
//
// Una "scheda" (WorkoutProgramGroup) e' l'insieme delle schede reali
// (workout_plans) che condividono lo stesso templateId non nullo: sono i
// giorni (Workout A/B/C) creati insieme da assign_workout_template_to_client
// per una singola assegnazione. Una scheda senza templateId (creata
// dall'editor manuale, mai da un modello) forma un gruppo a se' stante di un
// solo elemento. Limite noto e accettato: riassegnare lo STESSO modello allo
// stesso cliente una seconda volta produce due batch di schede con lo stesso
// templateId, visti qui come un unico gruppo — nessun id di batch esiste
// oggi per distinguerli (fuori scope di questo intervento).
export type WorkoutProgramGroup = {
  key: string;
  templateId: string | null;
  scheduleName: string;
  plans: WorkoutPlan[];
};

function compareBySequence(a: WorkoutPlan, b: WorkoutPlan): number {
  const orderA = a.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  // Tiebreak stabile e persistente (mai un indice locale non persistente):
  // confronto lessicografico dell'id reale, usato solo quando sequenceOrder
  // manca o coincide per entrambi (schede senza templateId, o dati storici).
  return a.id.localeCompare(b.id);
}

// "Upper/Lower Ipertrofia — Upper A" -> "Upper/Lower Ipertrofia" (nome del
// programma, senza il giorno). Il separatore " — " e' quello usato SEMPRE e
// SOLO da assign_workout_template_to_client per comporre plan.name; una
// scheda senza quel separatore (editor manuale) usa il proprio nome intero.
// Esportata a se' (oltre che usata da deriveScheduleName sotto) perche' il
// dettaglio appuntamento deve poter mostrare il nome del programma anche per
// un workout collegato che non e' piu' "pending" (es. gia' completato) — un
// caso che getClientProgramsWithPendingWorkout esclude di proposito dai
// gruppi selezionabili.
export function deriveProgramScheduleName(plan: WorkoutPlan): string {
  const separatorIndex = plan.name.indexOf(' — ');
  return separatorIndex === -1 ? plan.name : plan.name.slice(0, separatorIndex);
}

function deriveScheduleName(plans: WorkoutPlan[]): string {
  return deriveProgramScheduleName(plans[0]);
}

export function groupClientPlansIntoPrograms(plans: WorkoutPlan[], clientId: string): WorkoutProgramGroup[] {
  const clientPlans = plans.filter((p) => p.clientId === clientId);
  const byKey = new Map<string, WorkoutPlan[]>();
  for (const plan of clientPlans) {
    const key = plan.templateId ? `template:${plan.templateId}` : `plan:${plan.id}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(plan);
    else byKey.set(key, [plan]);
  }
  return [...byKey.entries()].map(([key, groupPlans]) => {
    const sorted = [...groupPlans].sort(compareBySequence);
    return {
      key,
      templateId: sorted[0].templateId ?? null,
      scheduleName: deriveScheduleName(sorted),
      plans: sorted,
    };
  });
}

// Il primo workout non completato/saltato/annullato nell'ordine stabile del
// programma. sessionStatus assente equivale a 'todo' (stesso default usato
// in tutto il resto dell'app, vedi lib/workout-progress.ts).
export function nextPendingPlanInGroup(group: WorkoutProgramGroup): WorkoutPlan | null {
  return group.plans.find((p) => (p.sessionStatus ?? 'todo') === 'todo') ?? null;
}

// Solo i programmi che hanno ancora un workout da proporre: un programma
// interamente completato non compare nella scelta "Scheda assegnata"
// dell'appuntamento.
export function getClientProgramsWithPendingWorkout(plans: WorkoutPlan[], clientId: string): WorkoutProgramGroup[] {
  return groupClientPlansIntoPrograms(plans, clientId).filter((group) => nextPendingPlanInGroup(group) !== null);
}

// Etichetta "Workout A"/"Upper A" mostrata nella UI: l'override esplicito
// del coach (day_label, impostato da assign_workout_template_to_client dal
// nome del giorno del modello) se presente, altrimenti il nome intero della
// scheda (schede create dall'editor manuale, senza giorni multipli).
export function planWorkoutLabel(plan: WorkoutPlan): string {
  return plan.dayLabel ?? plan.name;
}
