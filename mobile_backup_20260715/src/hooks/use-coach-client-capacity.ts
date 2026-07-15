import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getCurrentSession } from '@/lib/auth-service';
import { getCoachClientCapacity } from '@/lib/coach-client-capacity-service';
import { supabaseConfig } from '@/lib/supabase';
import type { CoachClientCapacity } from '@/types/subscription-packages';

type UseCoachClientCapacityResult = {
  capacity: CoachClientCapacity | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// Sorgente unica del contatore "Clienti utilizzati: X su Y / Posti
// disponibili: Z": usata SENZA argomento dalla schermata Clienti del coach
// (risolve la propria sessione), CON un coachId esplicito dal pannello
// superadmin (un coach qualsiasi). Stesso pattern di refresh delle altre
// schermate pacchetti/abbonamento: su focus (useFocusEffect, copre anche
// "nuovo abbonamento attivato"/"cliente registrato con il codice") e su
// ritorno in primo piano (AppState) — mai una sola volta al mount, cosi' il
// contatore non mostra mai un numero di cache locale obsoleto.
export function useCoachClientCapacity(coachId?: string): UseCoachClientCapacityResult {
  const [capacity, setCapacity] = useState<CoachClientCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      setError(null);
      setCapacity(null);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    let resolvedCoachId = coachId;
    if (!resolvedCoachId) {
      const sessionResult = await getCurrentSession();
      if (requestIdRef.current !== requestId) return;
      resolvedCoachId = sessionResult.ok ? sessionResult.data?.user.id : undefined;
    }
    if (!resolvedCoachId) {
      setCapacity(null);
      setLoading(false);
      return;
    }

    const result = await getCoachClientCapacity(resolvedCoachId);
    if (requestIdRef.current !== requestId) return;
    if (result.ok) {
      setCapacity(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [coachId]);

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

  return { capacity, loading, error, reload: load };
}
