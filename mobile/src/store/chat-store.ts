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
  markClientThreadReadByCoach: (clientId: string) => void;
  markClientThreadReadByClient: (clientId: string) => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: SEED_CHAT_MESSAGES,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      sendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
      markClientThreadReadByCoach: (clientId) =>
        set((s) => {
          const now = new Date().toISOString();
          let changed = false;
          const messages = s.messages.map((message) => {
            if (message.clientId === clientId && message.sender === 'client' && !message.readByCoachAt) {
              changed = true;
              return { ...message, readByCoachAt: now };
            }
            return message;
          });

          if (!changed) return s;
          return {
            messages,
          };
        }),
      markClientThreadReadByClient: (clientId) =>
        set((s) => {
          const now = new Date().toISOString();
          let changed = false;
          const messages = s.messages.map((message) => {
            if (message.clientId === clientId && message.sender === 'coach' && !message.readByClientAt) {
              changed = true;
              return { ...message, readByClientAt: now };
            }
            return message;
          });

          if (!changed) return s;
          return {
            messages,
          };
        }),
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
