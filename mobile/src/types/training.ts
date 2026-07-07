// Modello dati allenamento. Regola fondamentale: i parametri di allenamento
// (serie/ripetizioni/peso/recupero) NON vivono su Exercise, ma su WorkoutExercise,
// perché lo stesso esercizio è usato con parametri diversi da clienti/schede diverse.

export type MuscleGroup =
  | 'Petto'
  | 'Dorso'
  | 'Gambe'
  | 'Spalle'
  | 'Bicipiti'
  | 'Tricipiti'
  | 'Addominali/Core'
  | 'Cardio/Funzionale';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type VideoStatus = 'available' | 'missing';

// Esercizio base: descrive il movimento, non come va eseguito da un cliente specifico.
export type Exercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  description: string;
  technicalNotes: string;
  difficulty: Difficulty;
  equipment: string;
  videoFile: string;
  videoStatus: VideoStatus;
};

// Tecnica speciale di esecuzione. 'normal' (o campo assente) = esercizio singolo.
// 'superset' raggruppa più WorkoutExercise che condividono lo stesso supersetGroupId,
// da eseguire in sequenza senza recupero tra loro. 'stripping' e 'circuit' sono
// etichette informative (mostrate come badge), non cambiano la struttura dati.
export type TechniqueType = 'normal' | 'superset' | 'stripping' | 'circuit';

// Esercizio dentro una scheda: qui vivono i parametri di allenamento veri e propri.
export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  repsMin?: number;
  repsMax?: number;
  targetWeight: number | null;
  restSeconds: number;
  tempo?: string;
  notes: string;
  order: number;
  techniqueType?: TechniqueType;
  supersetGroupId?: string;
};

export type WorkoutPlanStatus = 'active' | 'expiring' | 'expired';

// Stato "sessione" del workout (l'ha eseguito o no), indipendente dallo stato di
// validità della scheda (WorkoutPlanStatus, basato sulla scadenza). Assente =
// 'todo': una scheda esistente prima di questo campo resta valida di default.
// 'todo' copre sia "assegnata e in attesa" sia "programmata con data/ora" (il
// planning esterno parla di uno stato "scheduled" separato, ma qui non serve:
// una sessione con scheduledDate/scheduledTime è comunque 'todo' finché non
// eseguita). 'cancelled' è stato aggiunto per le sessioni annullate dal coach:
// i filtri "Da fare"/"Passati" esistenti (status === 'todo' vs status !== 'todo')
// la trattano già correttamente come "passata" senza bisogno di altre modifiche.
export type WorkoutSessionStatus = 'todo' | 'completed' | 'skipped' | 'cancelled';

export type WorkoutPlan = {
  id: string;
  name: string;
  clientId: string;
  startDate: string;
  expiryDate: string;
  exercises: WorkoutExercise[];
  sessionStatus?: WorkoutSessionStatus;
  // Esecuzione live della sessione (lato cliente): `startedAt` è l'istante in cui
  // è stato premuto "Inizia allenamento" (null/assente = non in corso), persistito
  // così il timer sopravvive a un refresh. `completedExerciseIds` traccia quali
  // WorkoutExercise sono stati spuntati in QUESTA esecuzione (usato per il
  // contatore "0/7" e per il bottone Cardio). `durationSeconds` è scritto una sola
  // volta, a "Fine allenamento".
  startedAt?: string | null;
  completedExerciseIds?: string[];
  durationSeconds?: number;
  // Istante reale di completamento (diverso da `startDate`, che è la data
  // pianificata): scritto una sola volta insieme a durationSeconds, usato per
  // ordinare/mostrare lo storico e per l'agenda (Appointment collegato).
  completedAt?: string;
  // Coach proprietario della sessione (app a coach singolo oggi, vedi
  // constants/app-info.ts DEFAULT_COACH_ID) e abbonamento a cui questa sessione
  // "consuma" un allenamento se completata (types/subscription.ts). Entrambi
  // opzionali per non rompere le schede create prima di questo campo.
  coachId?: string;
  subscriptionId?: string;
  // Ora pianificata dell'allenamento (HH:mm), distinta da `startDate` che è solo
  // la data. Opzionale: una scheda senza orario esplicito resta valida (mostra
  // solo la data), non è un default finto.
  scheduledTime?: string;
  // Override espliciti di "Giorno N"/"Settimana N", impostabili dal coach in
  // creazione scheda. Se assenti, restano derivati automaticamente da
  // getSessionDayNumber/getSessionWeekNumber come già accadeva (vedi
  // lib/workout-progress.ts) — nessuna rottura per le schede esistenti.
  dayLabel?: string;
  weekLabel?: string;
};

// Storico: il valore reale per l'istruttore è vedere la progressione nel tempo,
// non solo cosa è "assegnato" (che è WorkoutExercise).
export type ExerciseProgressHistory = {
  id: string;
  clientId: string;
  exerciseId: string;
  workoutPlanId: string;
  date: string;
  setsCompleted: number;
  repsCompleted: number;
  weightUsed: number;
  restUsed: number;
  notes: string;
  perceivedEffort?: number;
  createdAt: string;
};

export type SelectedSound = 'beep' | 'double-beep' | 'chime' | 'sirena';

export type SoundSettings = {
  restSoundEnabled: boolean;
  restSoundVolume: number; // 0–1
  countdownSoundEnabled: boolean;
  finishSoundEnabled: boolean;
  vibrationEnabled: boolean;
  selectedSound: SelectedSound;
};

export const STATUS_LABEL: Record<WorkoutPlanStatus, string> = {
  active: 'Attivo',
  expiring: 'In scadenza',
  expired: 'Scaduto',
};

export const SESSION_STATUS_LABEL: Record<WorkoutSessionStatus, string> = {
  todo: 'Da fare',
  completed: 'Completato',
  skipped: 'Saltato',
  cancelled: 'Annullato',
};

export const TECHNIQUE_LABEL: Record<Exclude<TechniqueType, 'normal'>, string> = {
  superset: 'Superserie',
  stripping: 'Stripping',
  circuit: 'Circuito',
};

export const WORKOUT_PLAN_EXPIRING_WITHIN_DAYS = 7;

export function computeWorkoutPlanStatus(expiryDate: string, today = new Date()): WorkoutPlanStatus {
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'expired';
  if (diffDays <= WORKOUT_PLAN_EXPIRING_WITHIN_DAYS) return 'expiring';
  return 'active';
}
