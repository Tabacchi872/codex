import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadSupabaseCoaches } from '@/lib/superadmin-coach-service';
import { supabaseConfig } from '@/lib/supabase';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { SuperadminCoach } from '@/types/superadmin';

// Fonte unica di "quali coach mostra il pannello superadmin": va usata al
// posto di useSuperadminStore(s => s.coaches) diretto in dashboard/lista/
// dettaglio coach. Se Supabase e' configurato, unisce i coach reali
// (lib/superadmin-coach-service.ts) con quelli creati SOLO localmente dal
// pulsante "+ Aggiungi coach" (mai esistiti su Supabase), deduplicando per
// email — vince sempre la versione Supabase, piu' aggiornata. Se Supabase
// non e' configurato, ricade sui soli dati locali (fallback esplicito).
//
// Ricarica su focus (useFocusEffect) e ritorno in primo piano (AppState),
// oltre a un `reload()` esplicito da chiamare dopo una scrittura riuscita nel
// dettaglio coach (2026-07-12, funzione "Modifica coach" reale) — mai una
// sola volta al mount, stesso pattern delle altre hook pacchetti/abbonamento.
export function useSuperadminCoaches(): { coaches: SuperadminCoach[]; loading: boolean; reload: () => void } {
  const localCoaches = useSuperadminStore((s) => s.coaches);
  const isConfigured = supabaseConfig.isConfigured;
  const [supabaseCoaches, setSupabaseCoaches] = useState<SuperadminCoach[] | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const coaches = await loadSupabaseCoaches();
    if (requestIdRef.current !== requestId) return;
    setSupabaseCoaches(coaches);
  }, [isConfigured]);

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

  const loading = isConfigured && supabaseCoaches === null;

  const coaches = useMemo<SuperadminCoach[]>(() => {
    if (!isConfigured) {
      return localCoaches.map((coach) => ({ ...coach, source: 'local' as const }));
    }
    const remote = supabaseCoaches ?? [];
    const remoteEmails = new Set(remote.map((coach) => coach.email.toLowerCase()));
    const localOnly = localCoaches
      .filter((coach) => !remoteEmails.has(coach.email.toLowerCase()))
      .map((coach) => ({ ...coach, source: 'local' as const }));
    return [...remote, ...localOnly];
  }, [isConfigured, supabaseCoaches, localCoaches]);

  useEffect(() => {
    if (loading || !__DEV__) return;
    console.log('SUPERADMIN_COACHES_LOOKUP', { source: isConfigured ? 'supabase' : 'local', count: coaches.length });
  }, [loading, isConfigured, coaches.length]);

  return { coaches, loading, reload: load };
}
