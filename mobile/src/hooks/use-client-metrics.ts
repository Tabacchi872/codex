import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { listClientBiaReports, listClientMeasurements } from '@/lib/client-metrics-service';
import type { BiaReport, ClientMeasurement } from '@/types/client-metrics';

type UseClientMetricsResult = {
  measurements: ClientMeasurement[];
  reports: BiaReport[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useClientMetrics(clientId: string | null | undefined, includeReports = true): UseClientMetricsResult {
  const [measurements, setMeasurements] = useState<ClientMeasurement[]>([]);
  const [reports, setReports] = useState<BiaReport[]>([]);
  const [loading, setLoading] = useState(Boolean(clientId));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!clientId) {
      setMeasurements([]);
      setReports([]);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const [measurementsResult, reportsResult] = await Promise.all([
      listClientMeasurements(clientId),
      includeReports ? listClientBiaReports(clientId) : Promise.resolve({ ok: true as const, data: [] }),
    ]);
    if (requestIdRef.current !== requestId) return;
    if (!measurementsResult.ok) {
      setError(measurementsResult.message);
    } else {
      setMeasurements(measurementsResult.data);
    }
    if (reportsResult.ok) {
      setReports(reportsResult.data);
    }
    setLoading(false);
  }, [clientId, includeReports]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  return { measurements, reports, loading, error, reload };
}
