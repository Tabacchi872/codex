// Anagrafica cliente e account di accesso. Due tipi separati di proposito:
// Client è il cliente come persona seguita dal coach (dati anagrafici/di
// allenamento); ClientAccount è la sua identità di accesso all'app (username/
// password), che potrebbe non esistere ancora (un cliente può essere in
// gestione senza avere un account app). Confondere i due renderebbe impossibile
// gestire un cliente "offline" (senza app) o rigenerare le credenziali senza
// toccare l'anagrafica.

export type ClientStatus = 'attivo' | 'in_pausa' | 'scaduto';

export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  goal: string;
  notes: string;
  status: ClientStatus;
  createdAt: string;
  // Totale allenamenti del pacchetto acquistato dal cliente (es. 12). Assente per
  // i clienti creati prima di questo campo: in quel caso si usa un default (vedi
  // lib/workout-progress.ts), non un valore finto scritto qui.
  purchasedWorkoutsTotal?: number;
};

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  attivo: 'Attivo',
  in_pausa: 'In pausa',
  scaduto: 'Scaduto',
};

// ATTENZIONE — demo locale: `temporaryPassword` è salvata in chiaro nello store
// persistito (AsyncStorage) solo perché non esiste ancora un backend/auth reale.
// Non è una pratica accettabile in produzione: vedi docs/DECISIONS.md per il
// percorso previsto verso un'autenticazione reale (Supabase Auth o equivalente),
// dove le password non transiterebbero né sarebbero lette dal client in questo modo.
export type ClientAccount = {
  id: string;
  clientId: string;
  username: string;
  email: string;
  temporaryPassword: string;
  role: 'client';
  mustChangePassword: boolean;
  status: 'active';
  createdAt: string;
};
