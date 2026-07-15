import type { BoardPost } from '@/types/board';

// Dati iniziali usati SOLO al primo avvio (stesso pattern di seed-workout-plans.ts
// e seed-clients.ts). Un solo annuncio globale reale per non lasciare la bacheca
// vuota al primo avvio; nessun annuncio personale (nessuna UI coach per crearli
// ancora, quindi lo stato vuoto in quella sezione è onesto, non un difetto).
export const SEED_BOARD_POSTS: BoardPost[] = [
  {
    id: 'board-1',
    scope: 'globale',
    title: 'Nuovi orari sala pesi da luglio',
    text: 'Da lunedì la sala pesi apre alle 7:00 invece che alle 8:00. Gli orari serali restano invariati fino alle 22:00.',
    date: '2026-07-01',
    priority: 'normale',
  },
];
