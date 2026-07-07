import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_CLIENTS, SEED_CLIENT_ACCOUNTS } from '@/data/seed-clients';
import type { Client, ClientAccount } from '@/types/client';

// PERSISTENZA LOCALE PARZIALE (stesso limite di training-store.ts): clienti e
// account vivono solo su questo dispositivo/browser, AsyncStorage, nessun backend.
// `temporaryPassword` è salvata in chiaro: accettabile solo perché dichiarato
// come demo locale ovunque in UI/documentazione — vedi types/client.ts.
type ClientState = {
  clients: Client[];
  accounts: ClientAccount[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  addAccount: (account: ClientAccount) => void;
  updateAccount: (account: ClientAccount) => void;
};

export const useClientStore = create<ClientState>()(
  persist(
    (set) => ({
      clients: SEED_CLIENTS,
      accounts: SEED_CLIENT_ACCOUNTS,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      addClient: (client) => set((s) => ({ clients: [...s.clients, client] })),

      updateClient: (client) =>
        set((s) => ({ clients: s.clients.map((c) => (c.id === client.id ? client : c)) })),

      addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),

      updateAccount: (account) =>
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === account.id ? account : a)) })),
    }),
    {
      name: 'coachdesk-client-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
