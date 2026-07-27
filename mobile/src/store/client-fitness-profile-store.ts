import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClientFitnessProfileDraft } from '@/types/client-fitness-profile';

// Stesso pattern di client-onboarding-store.ts: bozza locale per step
// incompleti, invalidata/segnata completata dopo il salvataggio reale su
// Supabase (client-fitness-profile-service.ts).
type ClientFitnessProfileState = {
  drafts: Record<string, ClientFitnessProfileDraft>;
  statusRevision: number;
  completedClients: Record<string, number>;
  upsertDraft: (clientId: string, patch: Partial<Omit<ClientFitnessProfileDraft, 'clientId' | 'updatedAt'>>) => void;
  clearDraft: (clientId: string) => void;
  invalidateStatus: () => void;
  markCompleted: (clientId: string) => void;
};

const emptyDraft = (clientId: string): ClientFitnessProfileDraft => ({
  clientId,
  currentStep: 0,
  excludedExerciseIds: [],
  painAreas: [],
  updatedAt: new Date().toISOString(),
});

export const useClientFitnessProfileStore = create<ClientFitnessProfileState>()(
  persist(
    (set) => ({
      drafts: {},
      statusRevision: 0,
      completedClients: {},
      upsertDraft: (clientId, patch) =>
        set((state) => {
          const current = state.drafts[clientId] ?? emptyDraft(clientId);
          return {
            drafts: {
              ...state.drafts,
              [clientId]: {
                ...current,
                ...patch,
                clientId,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      clearDraft: (clientId) =>
        set((state) => {
          const next = { ...state.drafts };
          delete next[clientId];
          return { drafts: next };
        }),
      invalidateStatus: () => set((state) => ({ statusRevision: state.statusRevision + 1 })),
      markCompleted: (clientId) =>
        set((state) => ({
          completedClients: {
            ...state.completedClients,
            [clientId]: Date.now(),
          },
          statusRevision: state.statusRevision + 1,
        })),
    }),
    {
      name: 'fitcoach-client-fitness-profile-drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
