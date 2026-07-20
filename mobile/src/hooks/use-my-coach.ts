import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getMyAssignedCoach, type AssignedCoachSummary } from '@/lib/client-coach-service';

type MyCoachState = {
  coach: AssignedCoachSummary | null;
  loading: boolean;
  error: string | null;
};

export function useMyCoach() {
  const [state, setState] = useState<MyCoachState>({ coach: null, loading: true, error: null });
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    const request = (async () => {
      const result = await getMyAssignedCoach();
      if (!result.ok) {
        setState({ coach: null, loading: false, error: result.message });
        return;
      }
      setState({ coach: result.data, loading: false, error: null });
    })();
    inFlightRef.current = request;
    try {
      await request;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
    return request;
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { ...state, reload: load };
}
