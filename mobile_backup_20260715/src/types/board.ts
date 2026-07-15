// Annunci del coach. 'globale' è visibile a tutti i clienti, 'personale' solo
// al clientId indicato: due concetti diversi, mai fusi in un solo campo, così
// filtrare "i miei annunci" resta un filtro esplicito e verificabile.

export type BoardPriority = 'normale' | 'alta';

export type BoardPost = {
  id: string;
  scope: 'globale' | 'personale';
  clientId?: string;
  title: string;
  text: string;
  date: string;
  priority: BoardPriority;
};
