import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { listActivePackages } from '@/lib/subscription-packages-service';
import { supabaseConfig } from '@/lib/supabase';
import type { SubscriptionPackage, SubscriptionPackageTargetRole } from '@/types/subscription-packages';

type UseSubscriptionPackagesResult = {
  packages: SubscriptionPackage[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// Pacchetti attivi (letti sempre da Supabase, mai da cache locale) per il
// ruolo indicato, usata sia da abbonamento-coach.tsx (targetRole 'coach') sia
// da pacchetti-cliente.tsx (targetRole 'client'). Il coach/cliente non ha
// alcun modo di creare/modificare pacchetti: questo hook e' SOLO lettura
// (subscription_packages_coach_read_active/_client_read_active, RLS —
// docs/SUPABASE_SCHEMA.sql), la scrittura resta esclusiva del superadmin
// (subscription-packages-service.ts, usato solo da superadmin/pacchetti/*).
//
// Ricarica sempre (mai una singola volta al mount): quando la schermata torna
// a fuoco (useFocusEffect, expo-router — copre sia la prima apertura sia il
// ritorno da un'altra tab/schermata) e quando l'app torna in primo piano da
// background (AppState) — cosi' un pacchetto creato/modificato/disattivato
// dal superadmin compare/scompare senza bisogno di un refresh manuale.
export function useSubscriptionPackages(targetRole: SubscriptionPackageTargetRole): UseSubscriptionPackagesResult {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      setError(null);
      setPackages([]);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listActivePackages(targetRole);
    if (requestIdRef.current !== requestId) return; // risposta di una richiesta superata, scartata
    if (result.ok) {
      setPackages(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [targetRole]);

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

  return { packages, loading, error, reload: load };
}
