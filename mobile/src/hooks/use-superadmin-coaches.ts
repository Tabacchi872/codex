import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadSupabaseCoaches } from '@/lib/superadmin-coach-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { SuperadminCoach } from '@/types/superadmin';

// I coach "Solo locale" (mai esistiti su Supabase, creati dal pulsante
// "+ Aggiungi coach" del pannello) sono dati dimostrativi: non devono
// comparire di default nel pannello superadmin reale, per non confondere
// account demo con account reali. Compaiono solo con questa variabile
// esplicita (mobile/.env, mai true in produzione) — stesso pattern
// EXPO_PUBLIC_* di lib/supabase.ts.
const DEMO_DATA_ENABLED = process.env.EXPO_PUBLIC_ENABLE_DEMO_DATA === 'true';

// Fonte unica di "quali coach mostra il pannello superadmin": va usata al
// posto di useSuperadminStore(s => s.coaches) diretto in dashboard/lista/
// dettaglio coach. Se Supabase e' configurato, unisce i coach reali
// (lib/superadmin-coach-service.ts) con quelli creati SOLO localmente dal
// pulsante "+ Aggiungi coach" (mai esistiti su Supabase, mostrati solo se
// DEMO_DATA_ENABLED), deduplicando per email — vince sempre la versione
// Supabase, piu' aggiornata. Se Supabase non e' configurato, ricade sui soli
// dati locali (fallback esplicito).
//
// Ricarica su focus (useFocusEffect) e ritorno in primo piano (AppState),
// oltre a un `reload()` esplicito da chiamare dopo una scrittura riuscita nel
// dettaglio coach (2026-07-12, funzione "Modifica coach" reale) — mai una
// sola volta al mount, stesso pattern delle altre hook pacchetti/abbonamento.
export function useSuperadminCoaches(): {
  coaches: SuperadminCoach[];
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const localCoaches = useSuperadminStore((s) => s.coaches);
  const isConfigured = supabaseConfig.isConfigured;
  // Il caricamento globale di public.profiles va tentato solo per una
  // sessione superadmin reale: per qualunque altro ruolo la query tornerebbe
  // comunque vuota per via delle RLS, ma evitiamo di eseguirla del tutto.
  const currentRole = useAuthStore((s) => s.currentRole);
  const isSuperadminSession = currentRole === 'superadmin';
  const [supabaseCoaches, setSupabaseCoaches] = useState<SuperadminCoach[] | null>(null);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!isConfigured || !isSuperadminSession) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const result = await loadSupabaseCoaches();
    if (requestIdRef.current !== requestId) return;
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError('');
    setSupabaseCoaches(result.data);
  }, [isConfigured, isSuperadminSession]);

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

  const loading = isConfigured && isSuperadminSession && supabaseCoaches === null && !error;

  const coaches = useMemo<SuperadminCoach[]>(() => {
    const demoCoaches = DEMO_DATA_ENABLED ? localCoaches.map((coach) => ({ ...coach, source: 'local' as const })) : [];
    if (!isConfigured) {
      return demoCoaches;
    }
    const remote = supabaseCoaches ?? [];
    const remoteEmails = new Set(remote.map((coach) => coach.email.toLowerCase()));
    const demoOnly = demoCoaches.filter((coach) => !remoteEmails.has(coach.email.toLowerCase()));
    return [...remote, ...demoOnly];
  }, [isConfigured, supabaseCoaches, localCoaches]);

  useEffect(() => {
    if (loading) return;
    const realCoachCount = (supabaseCoaches ?? []).length;
    const demoCoachCount = coaches.length - realCoachCount;
    const source = realCoachCount > 0 && demoCoachCount > 0 ? 'mixed' : demoCoachCount > 0 ? 'demo' : 'supabase';
    console.log('SUPERADMIN_COACH_LOAD', { realCoachCount, demoCoachCount, source });
  }, [loading, coaches.length, supabaseCoaches]);

  return { coaches, loading, error, reload: load };
}
