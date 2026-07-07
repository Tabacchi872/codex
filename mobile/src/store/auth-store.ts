import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserRole } from '@/types/auth';

// AUTENTICAZIONE DEMO LOCALE — non è sicurezza reale. Nessuna verifica avviene
// su un server: chiunque acceda al codice/allo storage del dispositivo può
// vedere o alterare questo stato. Serve solo a dimostrare i flussi (login,
// ruoli, cambio password) in attesa di un backend/auth reale (Supabase Auth o
// equivalente) — vedi docs/DECISIONS.md.
type AuthState = {
  isAuthenticated: boolean;
  currentRole: UserRole | null;
  currentClientId: string | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  loginAsCoach: () => void;
  loginAsClient: (clientId: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentRole: null,
      currentClientId: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      loginAsCoach: () => set({ isAuthenticated: true, currentRole: 'coach', currentClientId: null }),
      loginAsClient: (clientId) => set({ isAuthenticated: true, currentRole: 'client', currentClientId: clientId }),
      logout: () => set({ isAuthenticated: false, currentRole: null, currentClientId: null }),
    }),
    {
      name: 'coachdesk-auth-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
