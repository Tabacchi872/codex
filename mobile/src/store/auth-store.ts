import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserRole } from '@/types/auth';

export type DemoUser = {
  email: string;
  password: string;
  role: UserRole;
  clientId?: string;
  coachId?: string;
};

export const DEMO_USERS: DemoUser[] = [
  { email: 'coach@fitcoach.local', password: 'coach123', role: 'coach', coachId: 'coach_demo_1' },
  { email: 'cliente@fitcoach.local', password: 'cliente123', role: 'cliente', clientId: '1' },
  { email: 'admin@fitcoach.local', password: 'admin123', role: 'superadmin' },
];

export type CoachAuthAccount = {
  id: string;
  coachId: string;
  email: string;
  password: string;
  role: 'coach';
  createdAt: string;
};

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
  currentCoachId: string | null;
  coachAccounts: CoachAuthAccount[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addCoachAccount: (account: CoachAuthAccount) => void;
  loginAsCoach: (email?: string, coachId?: string) => void;
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
      currentCoachId: null,
      coachAccounts: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addCoachAccount: (account) => set((s) => ({ coachAccounts: [...s.coachAccounts, account] })),
      loginAsCoach: (email, coachId) =>
        set({ isAuthenticated: true, currentRole: 'coach', currentUserEmail: email ?? null, currentClientId: null, currentCoachId: coachId ?? null }),
      loginAsClient: (clientId, email) =>
        set({ isAuthenticated: true, currentRole: 'cliente', currentUserEmail: email ?? null, currentClientId: clientId, currentCoachId: null }),
      loginAsSuperadmin: (email) =>
        set({ isAuthenticated: true, currentRole: 'superadmin', currentUserEmail: email ?? null, currentClientId: null, currentCoachId: null }),
      logout: () => set({ isAuthenticated: false, currentRole: null, currentUserEmail: null, currentClientId: null, currentCoachId: null }),
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
