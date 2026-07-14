import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { listCoachClientsForCurrentUser } from '@/lib/coach-clients-service';
import { useClientStore } from '@/store/client-store';
import type { Client } from '@/types/client';

type UseCoachClientsResult = {
  clients: Client[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useCoachClients(): UseCoachClientsResult {
  const storeClients = useClientStore((s) => s.clients);
  const setClients = useClientStore((s) => s.setClients);
  const [clients, setLocalClients] = useState<Client[]>(storeClients);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listCoachClientsForCurrentUser();
    if (requestIdRef.current !== requestId) return;
    if (result.ok) {
      setLocalClients(result.data);
      setClients(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [setClients]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') load();
    });
    return () => subscription.remove();
  }, [load]);

  return { clients, loading, error, reload: load };
}
