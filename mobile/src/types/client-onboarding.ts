export type ClientOnboardingMode = 'coach_guided' | 'self_guided';
export type ClientOnboardingGender = 'male' | 'female' | 'unspecified';
export type ClientOnboardingExperience = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'competitive';
export type BmiCategory = 'Sottopeso' | 'Normopeso' | 'Sovrappeso' | 'Obesita';

export type ClientOnboardingDraft = {
  clientId: string;
  currentStep: number;
  mode?: ClientOnboardingMode;
  coachCode?: string;
  gender?: ClientOnboardingGender;
  goals: string[];
  focusAreas: string[];
  trainingReasons: string[];
  experienceLevel?: ClientOnboardingExperience;
  trainingDaysPerWeek?: number;
  weightKg?: number;
  heightCm?: number;
  updatedAt: string;
};

export type SelfGuidedOnboardingPayload = {
  gender: ClientOnboardingGender;
  goals: string[];
  focusAreas: string[];
  trainingReasons: string[];
  experienceLevel: ClientOnboardingExperience;
  trainingDaysPerWeek: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  bmiCategory: BmiCategory;
};

export type CompletedClientOnboardingProfile = {
  clientMode: ClientOnboardingMode;
  gender: ClientOnboardingGender | null;
  goals: string[];
  focusAreas: string[];
  trainingReasons: string[];
  experienceLevel: ClientOnboardingExperience | null;
  trainingDaysPerWeek: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  completedAt: string | null;
};
