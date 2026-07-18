import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClientOnboardingDraft } from '@/types/client-onboarding';

type ClientOnboardingState = {
  drafts: Record<string, ClientOnboardingDraft>;
  statusRevision: number;
  completedClients: Record<string, number>;
  upsertDraft: (clientId: string, patch: Partial<Omit<ClientOnboardingDraft, 'clientId' | 'updatedAt'>>) => void;
  clearDraft: (clientId: string) => void;
  invalidateStatus: () => void;
  markCompleted: (clientId: string) => void;
};

const emptyDraft = (clientId: string): ClientOnboardingDraft => ({
  clientId,
  currentStep: 0,
  goals: [],
  focusAreas: [],
  trainingReasons: [],
  updatedAt: new Date().toISOString(),
});

export const useClientOnboardingStore = create<ClientOnboardingState>()(
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
      name: 'fitcoach-client-onboarding-drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
