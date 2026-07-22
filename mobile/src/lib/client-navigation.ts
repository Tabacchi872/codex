import type { ClientOnboardingMode } from '@/types/client-onboarding';

export function logClientNavPress(source: string, target: string) {
  if (__DEV__) {
    console.log('CLIENT_NAV_PRESS', { source, target });
  }
}

// Regola di visibilita' delle tab condivisa tra client-tabs.tsx (native) e
// client-tabs.web.tsx (web: Metro sceglie il file .web.tsx solo sul bundle
// web, ma la regola di visibilita' non deve mai divergere tra le due
// varianti — unico punto di verita', importato da entrambe). mode===null
// (account cliente legacy pre-onboarding, o dato non ancora risolto quando
// questo componente viene montato) NON nasconde nulla: AuthGate stesso
// (getClientRedirectTarget, auth-gate.tsx) tratta "mode !== 'self_guided'"
// come ramo coach_guided-compatibile — la tab bar resta coerente con la
// stessa identica condizione che decide se una route e' davvero
// raggiungibile, mai piu' restrittiva ne' piu' permissiva.
export function visibleClientTabs<T extends { hiddenForSelfGuided?: boolean }>(
  tabs: T[],
  mode: ClientOnboardingMode | null,
): T[] {
  if (mode !== 'self_guided') return tabs;
  return tabs.filter((tab) => !tab.hiddenForSelfGuided);
}
