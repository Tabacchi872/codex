import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_BOARD_POSTS } from '@/data/seed-board';
import type { BoardPost } from '@/types/board';

// PERSISTENZA LOCALE. Sola lettura lato cliente in questo intervento: nessuna
// UI coach per creare annunci personali ancora (fuori scope), quindi non esiste
// una `addPost` usata qui — se aggiunta in futuro andrà nel lato coach.
type BoardState = {
  posts: BoardPost[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
};

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      posts: SEED_BOARD_POSTS,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'fitcoach-board-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
