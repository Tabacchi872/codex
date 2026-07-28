import type { FitnessEquipmentLevel, FitnessLocation } from './client-fitness-profile';

export type PerceivedDifficulty = 'too_easy' | 'right' | 'too_hard';

// Bozza locale (stesso pattern di ClientFitnessProfileDraft), scoped al
// singolo ciclo: un check-in riguarda sempre un cycleId preciso, mai un
// concetto "globale" per il cliente.
export type MonthlyCheckinDraft = {
  cycleId: string;
  currentStep: number;
  perceivedDifficulty?: PerceivedDifficulty;
  sessionsCompletedEstimate?: number;
  // Tri-stato intenzionale (undefined = non ancora risposto): sono le due
  // domande di sicurezza, stesso principio di ClientFitnessProfileDraft —
  // mai un default silenzioso.
  hasPainOrLimitation?: boolean;
  painAreas: string[];
  painNotes?: string;
  requiresProfessionalSupervision?: boolean;
  wantsToContinue?: boolean;
  availableMinutes?: number;
  availableDaysPerWeek?: number;
  location?: FitnessLocation;
  equipmentLevel?: FitnessEquipmentLevel;
  goalChangedTo?: string;
  dislikedExerciseIds: string[];
  notes?: string;
  updatedAt: string;
};

export type MonthlyCheckinPayload = {
  cycleId: string;
  perceivedDifficulty: PerceivedDifficulty;
  sessionsCompletedEstimate?: number;
  hasPainOrLimitation: boolean;
  painAreas: string[];
  painNotes?: string;
  requiresProfessionalSupervision: boolean;
  wantsToContinue: boolean;
  availableMinutes?: number;
  availableDaysPerWeek?: number;
  location?: FitnessLocation;
  equipmentLevel?: FitnessEquipmentLevel;
  goalChangedTo?: string;
  dislikedExerciseIds: string[];
  notes?: string;
};

export type CurrentCycleExercise = {
  exerciseId: string;
  name: string;
};
