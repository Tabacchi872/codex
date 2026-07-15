import { create } from 'zustand';

import type { AutoLinkSummary } from '@/lib/ymove-auto-link-service';

// Stato UI transiente (2026-07-13, NON persistito: non ha senso sopravvivere
// a un riavvio, e' solo il progresso della scansione automatica in corso in
// questa sessione) per mostrare un piccolo banner non bloccante nella
// dashboard coach (mobile/src/app/index.tsx) mentre
// ymove-auto-link-service.ts collega automaticamente i video YMove. Store
// separato dal servizio stesso: il servizio non deve sapere nulla di UI/
// React, aggiorna solo questo store tramite le azioni esposte qui.
export type YmoveAutoLinkUiState =
  | { status: 'idle' }
  | { status: 'running'; processed: number; total: number }
  | { status: 'done'; summary: AutoLinkSummary };

type YmoveAutoLinkStore = {
  state: YmoveAutoLinkUiState;
  setRunning: (processed: number, total: number) => void;
  setDone: (summary: AutoLinkSummary) => void;
  dismiss: () => void;
};

export const useYmoveAutoLinkStore = create<YmoveAutoLinkStore>((set) => ({
  state: { status: 'idle' },
  setRunning: (processed, total) => set({ state: { status: 'running', processed, total } }),
  setDone: (summary) => set({ state: { status: 'done', summary } }),
  dismiss: () => set({ state: { status: 'idle' } }),
}));
