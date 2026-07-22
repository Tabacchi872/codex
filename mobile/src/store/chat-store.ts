import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_CHAT_MESSAGES } from '@/data/seed-chat';
import { DEMO_DATA_ENABLED } from '@/lib/demo-data';
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
  // Sostituisce l'intero elenco con quello remoto (fase 6, Supabase come
  // fonte principale): usata SOLO da use-messages-realtime.ts dopo una
  // lettura riuscita — anche l'eventuale messaggio ottimistico temporaneo
  // (id 'chat-*') viene rimpiazzato dalla riga reale, mai duplicato.
  setMessages: (messages: ChatMessage[]) => void;
  // Sostituisce il messaggio ottimistico con la riga reale restituita dal DB.
  replaceMessage: (tempId: string, message: ChatMessage) => void;
  removeMessage: (id: string) => void;
  // Azzera i messaggi dell'account precedente al logout. Vedi auth-store.ts.
  reset: () => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      // Seed demo SOLO con EXPO_PUBLIC_ENABLE_DEMO_DATA=true (lib/demo-data.ts).
      messages: DEMO_DATA_ENABLED ? SEED_CHAT_MESSAGES : [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      sendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
      setMessages: (messages) => set({ messages }),
      replaceMessage: (tempId, message) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === tempId ? message : m)) })),
      removeMessage: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
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

      reset: () => set({ messages: DEMO_DATA_ENABLED ? SEED_CHAT_MESSAGES : [] }),
    }),
    {
      name: 'fitcoach-chat-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // Purge dei seed gia' persistiti (vedi client-store.ts): rimuove SOLO
        // i messaggi con id seed noto, mai messaggi scritti dall'utente.
        if (!DEMO_DATA_ENABLED && state) {
          const seedMessageIds = new Set(SEED_CHAT_MESSAGES.map((message) => message.id));
          useChatStore.setState((s) => ({
            messages: s.messages.filter((message) => !seedMessageIds.has(message.id)),
          }));
        }
      },
    }
  )
);
