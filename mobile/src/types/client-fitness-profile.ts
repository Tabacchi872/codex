export type FitnessLocation = 'gym' | 'home';
export type FitnessEquipmentLevel = 'bodyweight_only' | 'home_basic' | 'full_gym';
export type PreferredTrainingStyle = 'full_body' | 'upper_lower' | 'split' | 'hybrid' | 'no_preference';

// Bozza locale (persistita finche' il questionario non e' completato), stesso
// pattern di ClientOnboardingDraft (client-onboarding.ts).
export type ClientFitnessProfileDraft = {
  clientId: string;
  currentStep: number;
  age?: number;
  location?: FitnessLocation;
  equipmentLevel?: FitnessEquipmentLevel;
  sessionDurationMinutes?: number;
  preferredTrainingStyle?: PreferredTrainingStyle;
  excludedExerciseIds: string[];
  // Tri-stato intenzionale (undefined = non ancora risposto): sono domande
  // di sicurezza, non deve mai passare silenziosamente un default "No" mai
  // scelto dall'utente.
  hasPainOrLimitation?: boolean;
  painAreas: string[];
  painNotes?: string;
  requiresProfessionalSupervision?: boolean;
  updatedAt: string;
};

// Payload inviato a save_initial_fitness_profile: tutti i campi obbligatori
// del questionario iniziale (sezione 1 del task) tranne quelli che l'RPC
// legge gia' da client_onboarding (obiettivo, livello, giorni settimanali,
// aree di focus, gia' raccolti dal questionario onboarding self_guided
// esistente — non duplicati qui).
export type InitialFitnessQuestionnairePayload = {
  age: number;
  location: FitnessLocation;
  equipmentLevel: FitnessEquipmentLevel;
  sessionDurationMinutes: number;
  preferredTrainingStyle: PreferredTrainingStyle;
  excludedExerciseIds: string[];
  hasPainOrLimitation: boolean;
  painAreas: string[];
  painNotes?: string;
  // Risposta esplicita e diretta ("hai un infortunio/una condizione che
  // richiede il parere di un professionista?"): mai dedotta da painNotes.
  requiresProfessionalSupervision: boolean;
};

export type ProgramCycleStatus = 'draft' | 'active' | 'completed' | 'superseded' | 'suspended' | 'pending_review';

export type ActiveProgramCycle = {
  id: string;
  status: ProgramCycleStatus;
  cycleNumber: number;
  source: string;
  decisionReason: string | null;
  templateId: string | null;
  templateName: string | null;
  startedAt: string;
  reviewDueAt: string | null;
};
