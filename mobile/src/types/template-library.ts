import type { TechniqueType } from './training';

// Libreria globale del coach: cartelle/sottocartelle -> schede modello ->
// esercizi. Sistema DISTINTO da:
// - WorkoutPlanTemplate (types/workout-template.ts): i 7 modelli statici
//   predefiniti, non collegati a Supabase, non organizzabili in cartelle;
// - WorkoutPlan (types/training.ts): una scheda REALMENTE assegnata a un
//   cliente (sessione reale, con clientId/stato/storico carichi).
// Assegnare una scheda modello a un cliente crea una COPIA indipendente come
// WorkoutPlan: modificare il modello dopo l'assegnazione non tocca mai le
// copie gia' create, e viceversa (vedi assignWorkoutTemplateToClient in
// lib/workout-plan-service.ts).

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
  techniqueType?: TechniqueType;
  supersetGroupId?: string;
};

// folderId null = cartella virtuale "Senza categoria" (mai una riga reale in
// template_folders per questo caso).
export type WorkoutTemplate = {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  goal: string;
  level: string;
  sortOrder: number;
  exercises: TemplateExercise[];
};

// Usato nelle liste (senza esercizi, per non scaricare tutto ad ogni riga).
export type WorkoutTemplateSummary = {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  goal: string;
  level: string;
  sortOrder: number;
  exerciseCount: number;
};

export type TemplateFolderDeleteMode = 'move_to_root' | 'delete_all';
