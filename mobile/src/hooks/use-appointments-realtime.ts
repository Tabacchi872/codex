import { useCallback, useEffect, useRef, useState } from 'react';

import { listAppointmentsForCurrentUser } from '@/lib/appointment-service';
import { getCurrentSession } from '@/lib/auth-service';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';

// Hook unico per appuntamenti Supabase + Realtime (fase 5): stesso pattern di
// use-workout-plans-sync.ts. Chiamabile da piu' schermate insieme (agenda,
// dashboard): il canale Realtime e' un singleton a livello di modulo per
// (ruolo, utente) — montare l'hook in piu' punti aggiunge solo listener, mai
// un secondo canale; l'ultimo unmount/logout chiude il canale (nessuna
// subscription duplicata dopo logout/login). Se Supabase non e' configurato,
// refresh() e' un no-op e lo store locale resta la fonte, come prima.
type Role = 'coach' | 'cliente';

let activeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let activeKey: string | null = null;
let listeners = new Set<() => void>();

function teardownChannel(): void {
  if (activeChannel && supabase) supabase.removeChannel(activeChannel);
  activeChannel = null;
  activeKey = null;
  listeners = new Set();
}

function subscribeAppointmentsRealtime(userId: string, role: Role, onChange: () => void): () => void {
  if (!supabaseConfig.isConfigured || !supabase) return () => {};
  const key = `${role}:${userId}`;
  if (activeKey !== key) {
    teardownChannel();
    const column = role === 'coach' ? 'coach_id' : 'client_id';
    activeChannel = supabase
      .channel(`appointments-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `${column}=eq.${userId}` },
        (payload: { eventType: string }) => {
          console.log('APPOINTMENTS_REALTIME_EVENT', { eventType: payload.eventType });
          listeners.forEach((listener) => listener());
        },
      )
      .subscribe();
    activeKey = key;
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) teardownChannel();
  };
}

export function useAppointmentsRealtime() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRole = useAuthStore((s) => s.currentRole);
  const setAppointments = useAppointmentStore((s) => s.setAppointments);
  // Dedup delle letture concorrenti: vince sempre l'ultima richiesta partita
  // (stesso pattern requestId di use-superadmin-coaches.ts).
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabaseConfig.isConfigured) return;
    if (currentRole !== 'coach' && currentRole !== 'cliente') return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listAppointmentsForCurrentUser();
    if (requestIdRef.current !== requestId) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAppointments(result.data);
  }, [currentRole, setAppointments]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!supabaseConfig.isConfigured || (currentRole !== 'coach' && currentRole !== 'cliente')) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    getCurrentSession().then((session) => {
      if (cancelled || !session.ok || !session.data) return;
      unsubscribe = subscribeAppointmentsRealtime(session.data.user.id, currentRole, () => refreshRef.current());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentRole]);

  return { loading, error, refresh };
}
