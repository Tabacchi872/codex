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

// Allineato al CHECK reale di client_program_cycles.status (11 stati,
// sotto-blocco 2.1/2.3): il valore precedente ('draft'/'active'/'completed'/
// 'superseded'/'suspended'/'pending_review') non corrisponde piu' da quando
// quella migration e' stata applicata (2026-07-27) — bug trovato durante il
// sotto-blocco 2.6: getMyActiveProgramCycle() interrogava ancora
// `status in ('active','pending_review')`, un valore che il database non
// produce piu' da allora, lasciando la card "Il tuo programma automatico"
// vuota per qualunque cliente il cui ciclo non fosse rimasto 'active'.
export type ProgramCycleStatus =
  | 'draft'
  | 'active'
  | 'checkin_due'
  | 'review_pending'
  | 'pending_subscription'
  | 'paused_subscription'
  | 'pending_safety_review'
  | 'pending_template'
  | 'completed'
  | 'replaced'
  | 'cancelled';

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

// Occorrenza pianificata del ciclo (client_program_cycle_sessions): per un
// ciclo a N giorni/settimana su 4 settimane sono N*4 righe, ciascuna che
// referenzia una delle N schede A/B/C.../D/E (mai duplicate) con il proprio
// stato indipendente — completare l'occorrenza 1 (settimana 1, scheda A) non
// blocca l'occorrenza 4 (settimana 2, stessa scheda A).
export type ProgramCycleSessionStatus = 'todo' | 'completed' | 'skipped' | 'cancelled';

export type ProgramCycleSession = {
  id: string;
  cycleId: string;
  workoutPlanId: string;
  occurrenceNumber: number;
  weekNumber: number;
  dayLabel: string;
  scheduledDate: string | null;
  status: ProgramCycleSessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
};
