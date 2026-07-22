import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { listClientMeasurements } from '@/lib/client-metrics-service';
import type { ClientMeasurement } from '@/types/client-metrics';

type UseClientMetricsResult = {
  measurements: ClientMeasurement[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

// Le misurazioni si caricano sempre quando c'e' un clientId, indipendentemente
// da readOnly/allowClientActions del pannello che le mostra (invariato dal
// comportamento gia' esistente prima della rimozione del flusso BIA: solo il
// caricamento dei PDF BIA era condizionato da un secondo parametro, ora
// scomparso insieme al flusso).
export function useClientMetrics(clientId: string | null | undefined): UseClientMetricsResult {
  const [measurements, setMeasurements] = useState<ClientMeasurement[]>([]);
  const [loading, setLoading] = useState(Boolean(clientId));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!clientId) {
      setMeasurements([]);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listClientMeasurements(clientId);
    if (requestIdRef.current !== requestId) return;
    if (!result.ok) {
      setError(result.message);
    } else {
      setMeasurements(result.data);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  return { measurements, loading, error, reload };
}
