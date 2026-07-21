import { useLocalSearchParams, type Href } from 'expo-router';

import { ClientLoadHistory } from '@/components/client-load-history';
import { AppScreen, BackHeader } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Route condivisa coach+cliente (non piu' client-only, vedi auth-gate.tsx):
// - dal menu "Altro" del cliente, nessun parametro: storico completo,
//   personale, invariato rispetto a prima.
// - dalla card "Storico carichi" della schermata esercizio (coach o
//   cliente): clientId+exerciseId+exerciseName, storico filtrato su quel
//   solo esercizio.
// Il cliente non puo' MAI cambiare clientId tramite parametro URL: si usa
// sempre currentClientId dalla sessione autenticata, il parametro (se
// presente) viene ignorato. Il coach puo' consultare un cliente specifico
// solo se realmente suo — verificato contro useClientStore (gia' scoped
// dalla RLS coach), difesa in profondita' oltre alla RLS della query stessa.
export default function StoricoCarichiScreen() {
  const { clientId: clientIdParam, exerciseId: exerciseIdParam, exerciseName: exerciseNameParam } = useLocalSearchParams<{
    clientId?: string;
    exerciseId?: string;
    exerciseName?: string;
  }>();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);

  const exerciseId = getParamValue(exerciseIdParam);
  const exerciseName = getParamValue(exerciseNameParam);

  const requestedClientId = getParamValue(clientIdParam);
  const coachClientAuthorized = Boolean(requestedClientId) && clients.some((c) => c.id === requestedClientId);
  const resolvedClientId =
    currentRole === 'cliente' ? currentClientId : currentRole === 'coach' && coachClientAuthorized ? requestedClientId! : null;

  const title = exerciseName ? `Storico: ${exerciseName}` : 'Storico carichi';
  const fallbackHref = (currentRole === 'coach' ? '/clienti' : '/altro') as Href;
  const emptyMessage = exerciseName ? `Nessun carico registrato per ${exerciseName}.` : undefined;

  return (
    <AppScreen>
      <BackHeader title={title} fallbackHref={fallbackHref} />
      <ClientLoadHistory clientId={resolvedClientId} exerciseId={exerciseId} readOnly emptyMessage={emptyMessage} />
    </AppScreen>
  );
}
