import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserRole } from '@/types/auth';

export type DemoUser = {
  email: string;
  password: string;
  role: UserRole;
  clientId?: string;
};

export const DEMO_USERS: DemoUser[] = [
  { email: 'coach@fitcoach.local', password: 'coach123', role: 'coach' },
  { email: 'cliente@fitcoach.local', password: 'cliente123', role: 'cliente', clientId: '1' },
  { email: 'admin@fitcoach.local', password: 'admin123', role: 'superadmin' },
];

// AUTENTICAZIONE DEMO LOCALE — non è sicurezza reale. Nessuna verifica avviene
// su un server: chiunque acceda al codice/allo storage del dispositivo può
// vedere o alterare questo stato. Serve solo a dimostrare i flussi (login,
// ruoli, cambio password) in attesa di un backend/auth reale (Supabase Auth o
// equivalente) — vedi docs/DECISIONS.md.
type AuthState = {
  isAuthenticated: boolean;
  currentRole: UserRole | null;
  currentUserEmail: string | null;
  currentClientId: string | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  loginAsCoach: (email?: string) => void;
  loginAsClient: (clientId: string, email?: string) => void;
  loginAsSuperadmin: (email?: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentRole: null,
      currentUserEmail: null,
      currentClientId: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      loginAsCoach: (email) =>
        set({ isAuthenticated: true, currentRole: 'coach', currentUserEmail: email ?? null, currentClientId: null }),
      loginAsClient: (clientId, email) =>
        set({ isAuthenticated: true, currentRole: 'cliente', currentUserEmail: email ?? null, currentClientId: clientId }),
      loginAsSuperadmin: (email) =>
        set({ isAuthenticated: true, currentRole: 'superadmin', currentUserEmail: email ?? null, currentClientId: null }),
      logout: () => set({ isAuthenticated: false, currentRole: null, currentUserEmail: null, currentClientId: null }),
    }),
    {
      name: 'coachdesk-auth-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.currentRole === ('client' as UserRole)) {
          state.currentRole = 'cliente';
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
