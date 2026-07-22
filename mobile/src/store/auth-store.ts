import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useAppointmentStore } from './appointment-store';
import { useAttachmentStore } from './attachment-store';
import { useBoardStore } from './board-store';
import { useBookingStore } from './booking-store';
import { useChatStore } from './chat-store';
import { useCheckinStore } from './checkin-store';
import { useClientStore } from './client-store';
import { useSuperadminStore } from './superadmin-store';
import { useTrainingStore } from './training-store';
import { useYmoveAutoLinkStore } from './ymove-autolink-store';

import type { UserRole } from '@/types/auth';

// Store con dati account-specifici da azzerare ad ogni logout (vedi logout()
// sotto). Import diretto (non un hook React: siamo dentro un'azione Zustand,
// fuori dal render) — nessun rischio di dipendenza circolare, verificato:
// nessuno di questi store importa auth-store.ts. theme-store.ts e
// training-store.soundSettings restano fuori di proposito: sono preferenze
// del dispositivo, non dati dell'account (vedi commenti nei rispettivi file).
function resetUserScopedStores() {
  useClientStore.getState().reset();
  useTrainingStore.getState().reset();
  useSuperadminStore.getState().reset();
  useChatStore.getState().reset();
  useAppointmentStore.getState().reset();
  useBoardStore.getState().reset();
  useBookingStore.getState().reset();
  useCheckinStore.getState().reset();
  useAttachmentStore.getState().reset();
  useYmoveAutoLinkStore.getState().reset();
}

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
  // Flag letto da public.profiles.must_change_password (Supabase reale) dopo
  // signInWithEmail, distinto da ClientAccount.mustChangePassword (demo
  // locale in client-store.ts): quest'ultimo riguarda solo l'account cliente
  // locale generato dal coach, questo riguarda un utente Supabase autenticato
  // reale (coach o cliente) a cui e' stata inviata una password provvisoria
  // via Edge Function send-temporary-credentials. Vedi auth-gate.tsx.
  mustChangePasswordSupabase: boolean;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addCoachAccount: (account: CoachAuthAccount) => void;
  loginAsCoach: (email?: string, coachId?: string, mustChangePassword?: boolean) => void;
  loginAsClient: (clientId: string, email?: string, mustChangePassword?: boolean) => void;
  loginAsSuperadmin: (email?: string) => void;
  setMustChangePasswordSupabase: (value: boolean) => void;
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
      mustChangePasswordSupabase: false,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addCoachAccount: (account) => set((s) => ({ coachAccounts: [...s.coachAccounts, account] })),
      loginAsCoach: (email, coachId, mustChangePassword) =>
        set({
          isAuthenticated: true,
          currentRole: 'coach',
          currentUserEmail: email ?? null,
          currentClientId: null,
          currentCoachId: coachId ?? null,
          mustChangePasswordSupabase: mustChangePassword ?? false,
        }),
      loginAsClient: (clientId, email, mustChangePassword) =>
        set({
          isAuthenticated: true,
          currentRole: 'cliente',
          currentUserEmail: email ?? null,
          currentClientId: clientId,
          currentCoachId: null,
          mustChangePasswordSupabase: mustChangePassword ?? false,
        }),
      loginAsSuperadmin: (email) =>
        set({
          isAuthenticated: true,
          currentRole: 'superadmin',
          currentUserEmail: email ?? null,
          currentClientId: null,
          currentCoachId: null,
          mustChangePasswordSupabase: false,
        }),
      setMustChangePasswordSupabase: (value) => set({ mustChangePasswordSupabase: value }),
      // Ordine: gli store account-specifici vengono azzerati PRIMA di
      // spegnere isAuthenticated/currentRole, ma nella stessa chiamata
      // sincrona — React 19 batcha tutti i set() consecutivi in un solo
      // re-render, quindi non esiste un frame intermedio in cui AuthGate
      // renderizza ancora la UI del ruolo precedente con gli store gia'
      // vuoti (o viceversa). Le sottoscrizioni Realtime (use-appointments-
      // realtime.ts, use-messages-realtime.ts, use-workout-plans-sync.ts)
      // NON vanno disiscritte esplicitamente qui: i loro useEffect dipendono
      // gia' da currentRole (auth-gate.tsx le monta senza condizioni, ma il
      // loro effect interno e' no-op/si disiscrive quando currentRole non e'
      // piu' 'coach'/'cliente') — impostare currentRole:null qui sotto e'
      // cio' che le disiscrive, reattivamente, subito dopo questo set(). Non
      // serve un passo manuale separato "prima" di questo, ed e' l'ordine
      // piu' sicuro per questa architettura (nessuna disiscrizione manuale
      // duplicata che potrebbe disallinearsi dagli hook).
      logout: () => {
        resetUserScopedStores();
        set({
          isAuthenticated: false,
          currentRole: null,
          currentUserEmail: null,
          currentClientId: null,
          currentCoachId: null,
          mustChangePasswordSupabase: false,
        });
      },
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
