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
  // Sostituisce l'INTERO array (2026-07-14, migrazione Supabase): usata dopo
  // una lettura remota riuscita (hooks/use-workout-plans-sync.ts) — Supabase
  // e' la fonte di verita' una volta configurato/autenticato, mai un merge
  // col dato locale precedente (evita duplicati tra schema locale e remoto,
  // richiesto esplicitamente). AsyncStorage resta comunque una cache offline
  // valida: se la lettura remota fallisce, l'ultimo valore noto qui resta
  // quello mostrato, invece di uno stato vuoto.
  setWorkoutPlans: (plans: WorkoutPlan[]) => void;
  // Sostituisce un piano con un ALTRO id (2026-07-14, bug reale corretto):
  // dopo il primo salvataggio remoto riuscito di un piano che aveva ancora
  // un id placeholder locale (es. "1"), Postgres restituisce un id UUID
  // nuovo — updateWorkoutPlan da solo non basta, perche' il suo `.map()`
  // cerca una riga con lo STESSO id e non la trova mai (l'id e' cambiato):
  // il piano locale vecchio restava nello store INVARIATO mentre la nuova
  // riga remota non veniva mai aggiunta, con il rischio di finire con sia
  // "1" sia il nuovo UUID visibili. Questa azione rimuove sempre la voce con
  // oldId (anche se coincide con newPlan.id, caso normale in cui l'id non e'
  // cambiato) e aggiunge newPlan, garantendo un solo piano per quella scheda.
  replaceWorkoutPlan: (oldId: string, newPlan: WorkoutPlan) => void;
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

      setWorkoutPlans: (plans) => set({ workoutPlans: plans }),

      replaceWorkoutPlan: (oldId, newPlan) =>
        set((s) => ({ workoutPlans: [...s.workoutPlans.filter((p) => p.id !== oldId), newPlan] })),

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
