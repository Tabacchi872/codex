import type { Client, ClientAccount } from '@/types/client';

// Dati iniziali usati SOLO al primo avvio (prima che esista qualunque stato
// salvato in AsyncStorage) — stesso pattern di seed-workout-plans.ts. Gli id
// ('1', '2', '3') coincidono apposta con i clientId già usati in
// seed-workout-plans.ts e PLACEHOLDER_APPOINTMENTS: cambiarli romperebbe quei
// collegamenti.
export const SEED_CLIENTS: Client[] = [
  {
    id: '1',
    firstName: 'Marco',
    lastName: 'Bianchi',
    email: 'marco.bianchi@example.com',
    phone: '+39 333 1234567',
    goal: 'Aumentare forza su squat e panca piana',
    notes: 'Attenzione a spalla destra durante la panca.',
    status: 'attivo',
    createdAt: '2026-06-01T09:00:00.000Z',
    purchasedWorkoutsTotal: 12,
  },
  {
    id: '2',
    firstName: 'Giulia',
    lastName: 'Verdi',
    email: 'giulia.verdi@example.com',
    phone: '+39 333 7654321',
    goal: 'Tonificazione generale, 3 sedute a settimana',
    notes: 'Vuole passare a 3 sedute/settimana da agosto.',
    status: 'attivo',
    createdAt: '2026-06-01T09:00:00.000Z',
  },
  {
    id: '3',
    firstName: 'Luca',
    lastName: 'Ferrari',
    email: 'luca.ferrari@example.com',
    phone: '+39 333 9998888',
    goal: 'Ricomposizione corporea',
    notes: 'Da ricontattare per rinnovo scheda.',
    status: 'scaduto',
    createdAt: '2026-05-01T09:00:00.000Z',
  },
];

// Un solo account demo pre-generato (Marco), per poter testare subito il login
// cliente senza dover prima passare dal flusso "Aggiungi cliente". mustChangePassword
// true dimostra anche il flusso di cambio password obbligatorio al primo accesso.
export const SEED_CLIENT_ACCOUNTS: ClientAccount[] = [
  {
    id: 'acc-1',
    clientId: '1',
    username: 'marco.bianchi',
    email: 'marco.bianchi@example.com',
    temporaryPassword: 'Forza4821!',
    role: 'client',
    mustChangePassword: true,
    status: 'active',
    createdAt: '2026-06-01T09:05:00.000Z',
  },
];
