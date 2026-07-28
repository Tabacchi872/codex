import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MonthlyCheckinDraft } from '@/types/client-monthly-checkin';

// Stesso pattern di client-fitness-profile-store.ts: bozza locale per step
// incompleti, chiave per cycleId (mai per clientId: un check-in appartiene
// a un ciclo preciso).
type ClientMonthlyCheckinState = {
  drafts: Record<string, MonthlyCheckinDraft>;
  upsertDraft: (cycleId: string, patch: Partial<Omit<MonthlyCheckinDraft, 'cycleId' | 'updatedAt'>>) => void;
  clearDraft: (cycleId: string) => void;
};

const emptyDraft = (cycleId: string): MonthlyCheckinDraft => ({
  cycleId,
  currentStep: 0,
  painAreas: [],
  dislikedExerciseIds: [],
  updatedAt: new Date().toISOString(),
});

export const useClientMonthlyCheckinStore = create<ClientMonthlyCheckinState>()(
  persist(
    (set) => ({
      drafts: {},
      upsertDraft: (cycleId, patch) =>
        set((state) => {
          const current = state.drafts[cycleId] ?? emptyDraft(cycleId);
          return {
            drafts: {
              ...state.drafts,
              [cycleId]: {
                ...current,
                ...patch,
                cycleId,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      clearDraft: (cycleId) =>
        set((state) => {
          const next = { ...state.drafts };
          delete next[cycleId];
          return { drafts: next };
        }),
    }),
    {
      name: 'fitcoach-client-monthly-checkin-drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
