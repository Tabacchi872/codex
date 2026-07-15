// Allegato caricato dal cliente su un esercizio specifico di una scheda (foto di
// forma, screenshot, ecc.). Come le foto del check-in, su web l'URI è un `blob:`
// valido solo per la sessione del browser corrente (nessun upload reale ancora).

export type ExerciseAttachment = {
  id: string;
  clientId: string;
  workoutExerciseId: string;
  uri: string;
  createdAt: string;
};
