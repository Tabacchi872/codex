// Appuntamenti: dati statici di esempio, nessuna persistenza reale, nessuna
// connessione a backend. L'anagrafica cliente NON è più qui: è stata spostata
// nello store persistito (vedi mobile/src/store/client-store.ts e
// mobile/src/types/client.ts), perché "Aggiungi cliente" ora scrive dati reali
// che devono sopravvivere al refresh, cosa che un array statico non può fare.

export type PlaceholderAppointment = {
  id: string;
  clienteNome: string;
  data: string;
  ora: string;
  tipo: string;
};

export const PLACEHOLDER_APPOINTMENTS: PlaceholderAppointment[] = [
  { id: 'a1', clienteNome: 'Giulia Verdi', data: '2026-07-06', ora: '09:30', tipo: 'Sessione allenamento' },
  { id: 'a2', clienteNome: 'Marco Bianchi', data: '2026-07-08', ora: '18:00', tipo: 'Sessione allenamento' },
  { id: 'a3', clienteNome: 'Marco Bianchi', data: '2026-07-15', ora: '18:00', tipo: 'Check misurazioni' },
];
