import { SEED_CLIENTS, SEED_CLIENT_ACCOUNTS } from '@/data/seed-clients';

// Unico interruttore per i dati dimostrativi locali (clienti Marco Bianchi/
// Giulia Verdi/Luca Ferrari, schede seed, chat/bacheca seed, coach demo del
// pannello superadmin): nell'APK/app normale i seed NON devono mai apparire —
// compaiono solo impostando esplicitamente EXPO_PUBLIC_ENABLE_DEMO_DATA=true
// in mobile/.env (mai in produzione), con badge "Demo" dove mostrati.
// Stesso pattern EXPO_PUBLIC_* di lib/supabase.ts. NON tocca mai dati
// Supabase reali: governa solo i seed locali Zustand/AsyncStorage.
export const DEMO_DATA_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEMO_DATA === 'true';

// Id dei seed, usati sia per il purge dallo storage persistito (store che
// avevano gia' salvato i seed prima di questo gate) sia per il badge "Demo".
export const SEED_CLIENT_IDS = new Set(SEED_CLIENTS.map((client) => client.id));
export const SEED_CLIENT_ACCOUNT_IDS = new Set(SEED_CLIENT_ACCOUNTS.map((account) => account.id));

export function isSeedClientId(id: string): boolean {
  return SEED_CLIENT_IDS.has(id);
}
