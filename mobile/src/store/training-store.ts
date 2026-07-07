import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_PROGRESS_HISTORY, SEED_WORKOUT_PLANS } from '@/data/seed-workout-plans';
import type { ExerciseProgressHistory, SoundSettings, WorkoutPlan } from '@/types/training';

// PERSISTENZA LOCALE PARZIALE: i dati vivono solo su questo dispositivo, dentro
// AsyncStorage (chiave "coachdesk-training-store"). Nessun backend, nessuna
// sincronizzazione tra dispositivi, nessun backup. Sopravvivono al refresh della
// preview web e alla chiusura dell'app, ma non sono "dati reali" in senso
// gestionale: sono lo stato di un solo dispositivo/browser.

type TrainingState = {
  workoutPlans: WorkoutPlan[];
  progressHistory: ExerciseProgressHistory[];
  soundSettings: SoundSettings;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addWorkoutPlan: (plan: WorkoutPlan) => void;
  updateWorkoutPlan: (plan: WorkoutPlan) => void;
  deleteWorkoutPlan: (id: string) => void;
  addProgressEntry: (entry: ExerciseProgressHistory) => void;
  updateSoundSettings: (patch: Partial<SoundSettings>) => void;
};

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  restSoundEnabled: true,
  restSoundVolume: 0.8,
  countdownSoundEnabled: true,
  finishSoundEnabled: true,
  vibrationEnabled: true,
  selectedSound: 'beep',
};

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set) => ({
      workoutPlans: SEED_WORKOUT_PLANS,
      progressHistory: SEED_PROGRESS_HISTORY,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      addWorkoutPlan: (plan) => set((s) => ({ workoutPlans: [...s.workoutPlans, plan] })),

      updateWorkoutPlan: (plan) =>
        set((s) => ({ workoutPlans: s.workoutPlans.map((p) => (p.id === plan.id ? plan : p)) })),

      deleteWorkoutPlan: (id) => set((s) => ({ workoutPlans: s.workoutPlans.filter((p) => p.id !== id) })),

      addProgressEntry: (entry) => set((s) => ({ progressHistory: [...s.progressHistory, entry] })),

      updateSoundSettings: (patch) => set((s) => ({ soundSettings: { ...s.soundSettings, ...patch } })),
    }),
    {
      name: 'coachdesk-training-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
