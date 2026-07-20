import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getMyAssignedCoach, type AssignedCoachSummary } from '@/lib/client-coach-service';
import { getClientOnboardingStatus } from '@/lib/client-onboarding-service';
import { getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import type { ClientOnboardingMode } from '@/types/client-onboarding';

type MyCoachState = {
  coach: AssignedCoachSummary | null;
  clientMode: ClientOnboardingMode | null;
  loading: boolean;
  error: string | null;
};

export function useMyCoach() {
  const [state, setState] = useState<MyCoachState>({ coach: null, clientMode: null, loading: true, error: null });
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    const request = (async () => {
      if (!supabaseConfig.isConfigured) {
        setState({ coach: null, clientMode: null, loading: false, error: null });
        return;
      }
      const sessionResult = await getCurrentSession();
      const clientId = sessionResult.ok ? sessionResult.data?.user.id : null;
      if (!clientId) {
        setState({ coach: null, clientMode: null, loading: false, error: 'Non e stato possibile verificare il profilo.' });
        return;
      }
      const onboardingResult = await getClientOnboardingStatus(clientId);
      if (!onboardingResult.ok) {
        setState({ coach: null, clientMode: null, loading: false, error: onboardingResult.message });
        return;
      }
      const clientMode = onboardingResult.data.mode;
      if (clientMode === 'self_guided') {
        setState({ coach: null, clientMode, loading: false, error: null });
        return;
      }
      const result = await getMyAssignedCoach();
      if (!result.ok) {
        setState({ coach: null, clientMode, loading: false, error: result.message });
        return;
      }
      setState({ coach: result.data, clientMode, loading: false, error: null });
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
