import type { TechniqueType } from './training';

// Modello di allenamento predefinito ("Piani di allenamento" / "Modelli allenamento").
// Un modello NON è mai assegnato direttamente a un cliente: il coach lo usa
// come punto di partenza per generare copie reali (WorkoutPlan) via "Usa per
// cliente" (vedi app/schede/modelli/[id].tsx). Modificare una copia non tocca
// mai il modello originale — vedi docs/DECISIONS.md.
//
// `targetWeight` non esiste qui di proposito: il peso è sempre specifico del
// cliente/della copia, non del modello generico (coerente con la regola
// esistente "i parametri di allenamento vivono su WorkoutExercise", vedi
// types/training.ts) — il coach lo imposta dopo aver generato la copia.
export type WorkoutTemplateExercise = {
  exerciseId: string;
  sets: number;
  reps: number;
  repsMin?: number;
  repsMax?: number;
  restSeconds: number;
  notes?: string;
  techniqueType?: TechniqueType;
  supersetGroupId?: string;
};

export type WorkoutTemplateSession = {
  id: string;
  title: string;
  exercises: WorkoutTemplateExercise[];
};

export type WorkoutPlanTemplate = {
  id: string;
  title: string;
  goal: string;
  level: string;
  daysPerWeek: number;
  durationWeeks: number;
  description: string;
  sessions: WorkoutTemplateSession[];
  coachNotes?: string;
};
