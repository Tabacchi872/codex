import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WeeklyCheckin } from '@/types/checkin';

// PERSISTENZA LOCALE: i check-in inviati dal cliente restano su questo
// dispositivo/browser, nessun backend a cui il coach possa accedere ancora.
type CheckinState = {
  checkins: WeeklyCheckin[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addCheckin: (checkin: WeeklyCheckin) => void;
};

export const useCheckinStore = create<CheckinState>()(
  persist(
    (set) => ({
      checkins: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addCheckin: (checkin) => set((s) => ({ checkins: [...s.checkins, checkin] })),
    }),
    {
      name: 'fitcoach-checkin-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
