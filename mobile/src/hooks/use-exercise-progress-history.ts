import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getCurrentSession } from '@/lib/auth-service';
import { listClientExerciseProgress } from '@/lib/exercise-progress-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import type { ExerciseProgressHistory } from '@/types/training';
import { supabase } from '@/lib/supabase';

type UseExerciseProgressHistoryResult = {
  entries: ExerciseProgressHistory[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

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

function subscribeExerciseProgressRealtime(userId: string, clientId: string, role: Role, onChange: () => void): () => void {
  if (!supabaseConfig.isConfigured || !supabase) return () => {};

  const key = `${role}:${userId}:${clientId}`;
  if (activeKey !== key) {
    teardownChannel();
    activeChannel = supabase
      .channel(`exercise-progress-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exercise_progress_history', filter: `client_id=eq.${clientId}` },
        (payload: { eventType: string }) => {
          console.log('EXERCISE_PROGRESS_REALTIME_EVENT', { eventType: payload.eventType });
          listeners.forEach((listener) => listener());
        },
      )
      .subscribe();
    activeKey = key;
  }

  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      teardownChannel();
    }
  };
}

export function useExerciseProgressHistory(clientId: string | null | undefined): UseExerciseProgressHistoryResult {
  const currentRole = useAuthStore((s) => s.currentRole);
  const replaceClientProgressHistory = useTrainingStore((s) => s.replaceClientProgressHistory);
  const [entries, setEntries] = useState<ExerciseProgressHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!clientId || (currentRole !== 'cliente' && currentRole !== 'coach')) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!supabaseConfig.isConfigured) {
      const cachedEntries = readCachedEntries(clientId);
      setEntries(cachedEntries);
      setError('Storico carichi remoto non disponibile in questo ambiente.');
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const result = await listClientExerciseProgress(clientId);
    if (requestIdRef.current !== requestId) return;
    setLoading(false);

    if (!result.ok) {
      const cachedEntries = readCachedEntries(clientId);
      setEntries(cachedEntries);
      setError(result.message);
      return;
    }

    setEntries(result.data);
    replaceClientProgressHistory(clientId, result.data);
  }, [clientId, currentRole, replaceClientProgressHistory]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!supabaseConfig.isConfigured || !clientId || (currentRole !== 'coach' && currentRole !== 'cliente')) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    getCurrentSession().then((session) => {
      if (cancelled || !session.ok || !session.data) return;
      unsubscribe = subscribeExerciseProgressRealtime(session.data.user.id, clientId, currentRole, () => loadRef.current());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [clientId, currentRole]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { entries, loading, error, reload: load };
}

function readCachedEntries(clientId: string) {
  return useTrainingStore.getState().progressHistory.filter((entry) => entry.clientId === clientId);
}
