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

const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Default a 'light': prima installazione e nessuna preferenza salvata
      // devono aprire l'app in tema chiaro, mai in dark o nel tema di sistema.
      mode: 'light',
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'coachdesk-theme-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Sanifica in un solo passaggio (nessun doppio render) preferenze
      // vecchie/corrotte/non valide: fallback a 'light' invece di propagare
      // un valore imprevisto a useEffectiveColorScheme.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ThemeState> | undefined;
        const mode =
          persisted?.mode && VALID_MODES.includes(persisted.mode) ? persisted.mode : 'light';
        return { ...currentState, ...persisted, mode };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
