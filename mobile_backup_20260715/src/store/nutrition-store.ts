import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { NutritionPlan } from '@/types/nutrition';

// PERSISTENZA LOCALE (stesso limite degli altri store: solo questo dispositivo,
// nessun backend). Parte vuoto di proposito: non esiste ancora una schermata
// coach per assegnare piani nutrizionali, quindi qualunque dato precompilato
// qui sarebbe finto. Lo stato vuoto in UI è quindi corretto, non provvisorio.
type NutritionState = {
  plans: NutritionPlan[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
};

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set) => ({
      plans: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'fitcoach-nutrition-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
