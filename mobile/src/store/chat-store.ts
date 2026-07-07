import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_CHAT_MESSAGES } from '@/data/seed-chat';
import type { ChatMessage } from '@/types/chat';

// PERSISTENZA LOCALE: i messaggi inviati dal cliente restano su questo
// dispositivo/browser. Nessun invio reale al coach (nessun backend/realtime).
type ChatState = {
  messages: ChatMessage[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  sendMessage: (message: ChatMessage) => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: SEED_CHAT_MESSAGES,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      sendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
    }),
    {
      name: 'fitcoach-chat-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
