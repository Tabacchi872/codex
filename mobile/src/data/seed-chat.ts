import type { ChatMessage } from '@/types/chat';

// Dati iniziali usati SOLO al primo avvio. Un messaggio di benvenuto dal coach
// per il cliente che ha già un account (id '1', vedi seed-clients.ts): senza
// questo, la chat di un cliente al primissimo accesso sarebbe vuota, il che è
// comunque uno stato legittimo — questo messaggio serve solo a rendere il thread
// realistico, non a nascondere che l'invio del cliente è locale.
export const SEED_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'chat-1',
    clientId: '1',
    sender: 'coach',
    text: 'Ciao Marco! Ho aggiornato la tua scheda. Fammi sapere se hai domande sugli esercizi o sui carichi.',
    createdAt: '2026-06-01T09:10:00.000Z',
  },
];
