import type { TechniqueType } from './training';

// Libreria globale del coach: cartelle/sottocartelle -> schede modello ->
// giorni (Workout A/B/C, mai giorni della settimana) -> esercizi. Sistema
// DISTINTO da:
// - WorkoutPlanTemplate (types/workout-template.ts): i 7 modelli statici
//   predefiniti, non collegati a Supabase, non organizzabili in cartelle;
// - WorkoutPlan (types/training.ts): una scheda REALMENTE assegnata a un
//   cliente (sessione reale, con clientId/stato/storico carichi).
// Assegnare una scheda modello a un cliente crea, per OGNI giorno del
// modello, una COPIA indipendente come WorkoutPlan: modificare il modello
// dopo l'assegnazione non tocca mai le copie gia' create, e viceversa (vedi
// assignWorkoutTemplateToClient in lib/workout-plan-service.ts).

export type TemplateFolder = {
  id: string;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
};

export type TemplateExercise = {
  id: string;
  exerciseId: string;
  order: number;
  sets: number;
  reps: number;
  repsMin?: number;
  repsMax?: number;
  targetWeight: number | null;
  restSeconds: number;
  notes: string;
  rpeRir?: string;
  techniqueType?: TechniqueType;
  supersetGroupId?: string;
};

// Un giorno/workout del modello (es. "Workout A", "Spinta"). Mai un giorno
// della settimana: nessun campo weekday qui di proposito, l'agenda/
// disponibilita' e' un task separato.
export type TemplateDay = {
  id: string;
  name: string;
  focus?: string;
  sortOrder: number;
  estimatedDurationMinutes?: number;
  exercises: TemplateExercise[];
};

// folderId null = cartella virtuale "Senza categoria" (mai una riga reale in
// template_folders per questo caso; sempre null per i modelli di sistema,
// che non vivono in nessuna cartella di alcun coach).
export type WorkoutTemplate = {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  goal: string;
  level: string;
  sortOrder: number;
  durationWeeks?: number;
  sessionsPerWeek?: number;
  estimatedSessionMinutes?: number;
  equipment: string;
  location: string;
  trainingStyle: string;
  muscleFocus: string;
  intensity: string;
  progressionNotes: string;
  deloadWeek: boolean;
  isSystem: boolean;
  // Sottoinsieme dei modelli di sistema (isSystem sempre true quando questo
  // e' true): popolato solo dalla libreria "Allenamenti YMove", esercizi
  // presi dal catalogo YMove gia' importato — vedi
  // components/professional-library-screen.tsx (variant='ymove').
  isYmove: boolean;
  sourceTemplateId?: string | null;
  days: TemplateDay[];
};

// Usato nelle liste (senza esercizi/giorni, per non scaricare tutto ad ogni
// riga) — porta comunque tutti i metadati usati per card/filtri.
export type WorkoutTemplateSummary = {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  goal: string;
  level: string;
  sortOrder: number;
  durationWeeks?: number;
  sessionsPerWeek?: number;
  estimatedSessionMinutes?: number;
  equipment: string;
  location: string;
  trainingStyle: string;
  muscleFocus: string;
  intensity: string;
  isSystem: boolean;
  isYmove: boolean;
  dayCount: number;
  exerciseCount: number;
  // Id degli esercizi contenuti nel modello (tutti i giorni, senza duplicati
  // rimossi): serve solo alla ricerca lato client per nome esercizio
  // (mobile/src/data/exercise-library.ts) — mai mostrato direttamente in UI.
  exerciseIds: string[];
};

export type TemplateFolderDeleteMode = 'move_to_root' | 'delete_all';
