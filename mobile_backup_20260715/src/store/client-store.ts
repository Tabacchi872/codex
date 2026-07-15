import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SEED_CLIENTS, SEED_CLIENT_ACCOUNTS } from '@/data/seed-clients';
import { DEMO_DATA_ENABLED, SEED_CLIENT_ACCOUNT_IDS, SEED_CLIENT_IDS } from '@/lib/demo-data';
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
  setClients: (clients: Client[]) => void;
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  addAccount: (account: ClientAccount) => void;
  updateAccount: (account: ClientAccount) => void;
};

export const useClientStore = create<ClientState>()(
  persist(
    (set) => ({
      // Seed demo SOLO con EXPO_PUBLIC_ENABLE_DEMO_DATA=true (lib/demo-data.ts):
      // nell'app normale la lista clienti parte vuota e si popola solo con
      // clienti reali (creati dal coach o registrati via Supabase).
      clients: DEMO_DATA_ENABLED ? SEED_CLIENTS : [],
      accounts: DEMO_DATA_ENABLED ? SEED_CLIENT_ACCOUNTS : [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setClients: (clients) => set({ clients }),

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
        // Purge dei seed gia' persistiti da versioni precedenti dell'app (lo
        // stato salvato in AsyncStorage vince sull'initial state, quindi il
        // solo gate sopra non basta per un'installazione esistente). Rimuove
        // SOLO i seed locali per id noto — mai clienti reali (id Supabase o
        // creati dal coach, mai coincidenti con gli id seed '1'/'2'/'3').
        if (!DEMO_DATA_ENABLED && state) {
          useClientStore.setState((s) => ({
            clients: s.clients.filter((client) => !SEED_CLIENT_IDS.has(client.id)),
            accounts: s.accounts.filter((account) => !SEED_CLIENT_ACCOUNT_IDS.has(account.id)),
          }));
        }
      },
    }
  )
);
