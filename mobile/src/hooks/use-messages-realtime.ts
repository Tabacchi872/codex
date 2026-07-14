import { useCallback, useEffect, useRef, useState } from 'react';

import { getCurrentSession } from '@/lib/auth-service';
import { listMessagesForCurrentUser } from '@/lib/message-service';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

// Hook unico per messaggi Supabase + Realtime (fase 6): stesso pattern
// singleton di use-appointments-realtime.ts — un solo canale per (ruolo,
// utente) qualunque sia il numero di schermate montate, cleanup quando
// l'ultimo listener si disiscrive (unmount/logout), refresh deduplicato per
// requestId. Il refresh sostituisce l'intero mirror locale: un messaggio
// ottimistico temporaneo non ancora confermato viene rimpiazzato dalla riga
// reale alla prima lettura, mai duplicato.
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

function subscribeMessagesRealtime(userId: string, role: Role, onChange: () => void): () => void {
  if (!supabaseConfig.isConfigured || !supabase) return () => {};
  const key = `${role}:${userId}`;
  if (activeKey !== key) {
    teardownChannel();
    const column = role === 'coach' ? 'coach_id' : 'client_id';
    activeChannel = supabase
      .channel(`messages-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `${column}=eq.${userId}` },
        (payload: { eventType: string }) => {
          console.log('MESSAGES_REALTIME_EVENT', { eventType: payload.eventType });
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

export function useMessagesRealtime() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRole = useAuthStore((s) => s.currentRole);
  const setMessages = useChatStore((s) => s.setMessages);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabaseConfig.isConfigured) return;
    if (currentRole !== 'coach' && currentRole !== 'cliente') return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listMessagesForCurrentUser();
    if (requestIdRef.current !== requestId) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessages(result.data);
  }, [currentRole, setMessages]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!supabaseConfig.isConfigured || (currentRole !== 'coach' && currentRole !== 'cliente')) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    getCurrentSession().then((session) => {
      if (cancelled || !session.ok || !session.data) return;
      unsubscribe = subscribeMessagesRealtime(session.data.user.id, currentRole, () => refreshRef.current());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentRole]);

  return { loading, error, refresh };
}
