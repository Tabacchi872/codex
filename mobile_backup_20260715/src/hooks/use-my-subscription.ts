import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import { listUserSubscriptions, pickCurrentSubscription } from '@/lib/user-subscriptions-service';
import type { UserSubscription } from '@/types/subscription-packages';

type UseMySubscriptionResult = {
  current: UserSubscription | null;
  history: UserSubscription[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// Abbonamento corrente + storico dell'utente Supabase reale attualmente
// loggato (coach o cliente, stesso hook per entrambi) — usata da
// abbonamento-coach.tsx e pacchetti-cliente.tsx. Se non c'e' una sessione
// Supabase reale (demo locale/Supabase non configurato), ritorna liste vuote
// senza errore: nessun abbonamento reale puo' esistere per un account solo
// locale.
//
// Stesso pattern di ricarica di use-subscription-packages.ts: su focus della
// schermata (useFocusEffect) e su ritorno in primo piano dell'app (AppState),
// mai una singola volta al mount — coerente col resto del flusso pacchetti.
export function useMySubscription(): UseMySubscriptionResult {
  const [history, setHistory] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      setError(null);
      setHistory([]);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const sessionResult = await getCurrentSession();
    if (requestIdRef.current !== requestId) return;
    const userId = sessionResult.ok ? sessionResult.data?.user.id : undefined;
    if (!userId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    const result = await listUserSubscriptions(userId);
    if (requestIdRef.current !== requestId) return;
    if (result.ok) {
      setHistory(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

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

  return { current: pickCurrentSubscription(history), history, loading, error, reload: load };
}
