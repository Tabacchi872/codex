import type { Client } from '@/types/client';

// Helper puri sul cliente: prendono l'array clienti come parametro invece di
// leggerlo da uno store globale, così restano testabili e riusabili sia lato
// coach (tutti i clienti) sia lato cliente (dove in teoria se ne vede solo uno).
export function getClientById(clients: Client[], id: string | undefined | null): Client | undefined {
  if (!id) return undefined;
  return clients.find((c) => c.id === id);
}

export function clientFullName(client: Client): string {
  return `${client.firstName} ${client.lastName}`;
}
