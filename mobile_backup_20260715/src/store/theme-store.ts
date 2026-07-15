import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

// PERSISTENZA LOCALE DEMO: la preferenza tema è salvata solo su questo
// dispositivo/browser (AsyncStorage), come gli altri store dell'app. Nessun
// account/backend coinvolto: cambiare dispositivo o browser fa perdere la scelta.
type ThemeState = {
  mode: ThemeMode;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'coachdesk-theme-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
