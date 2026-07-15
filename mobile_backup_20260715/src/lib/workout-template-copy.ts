import type { WorkoutExercise } from '@/types/training';
import type { WorkoutTemplateSession } from '@/types/workout-template';

// Converte gli esercizi di una sessione del MODELLO in WorkoutExercise reali
// (id nuovi, targetWeight sempre null: il peso è specifico del cliente e va
// impostato dal coach dopo la copia). Non muta mai l'oggetto del modello.
export function instantiateSessionExercises(session: WorkoutTemplateSession): WorkoutExercise[] {
  return session.exercises.map((templateExercise, index) => ({
    id: `we-${Date.now()}-${session.id}-${index}`,
    exerciseId: templateExercise.exerciseId,
    sets: templateExercise.sets,
    reps: templateExercise.reps,
    repsMin: templateExercise.repsMin,
    repsMax: templateExercise.repsMax,
    targetWeight: null,
    restSeconds: templateExercise.restSeconds,
    notes: templateExercise.notes ?? '',
    order: index,
    techniqueType: templateExercise.techniqueType,
    supersetGroupId: templateExercise.supersetGroupId,
  }));
}
