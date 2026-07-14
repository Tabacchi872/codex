import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_BOARD_POSTS } from '@/data/seed-board';
import { DEMO_DATA_ENABLED } from '@/lib/demo-data';
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
      // Seed demo SOLO con EXPO_PUBLIC_ENABLE_DEMO_DATA=true (lib/demo-data.ts).
      posts: DEMO_DATA_ENABLED ? SEED_BOARD_POSTS : [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'fitcoach-board-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // Purge dei seed gia' persistiti (vedi client-store.ts).
        if (!DEMO_DATA_ENABLED && state) {
          const seedPostIds = new Set(SEED_BOARD_POSTS.map((post) => post.id));
          useBoardStore.setState((s) => ({
            posts: s.posts.filter((post) => !seedPostIds.has(post.id)),
          }));
        }
      },
    }
  )
);
