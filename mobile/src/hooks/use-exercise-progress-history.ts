import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { listClientExerciseProgress } from '@/lib/exercise-progress-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import type { ExerciseProgressHistory } from '@/types/training';

type UseExerciseProgressHistoryResult = {
  entries: ExerciseProgressHistory[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

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
