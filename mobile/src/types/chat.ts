// Conversazione cliente-coach. `clientId` è la chiave del thread: un thread per
// cliente, mai un'unica lista globale mischiata. Invio locale (nessun backend/
// realtime ancora): il messaggio persiste su questo dispositivo, il coach non
// lo riceve altrove finché non esiste una sincronizzazione reale.

export type ChatMessage = {
  id: string;
  clientId: string;
  sender: 'client' | 'coach';
  text: string;
  createdAt: string;
};
