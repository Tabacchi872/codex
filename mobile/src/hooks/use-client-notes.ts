import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppState } from 'react-native';

import { listClientNotes } from '@/lib/client-notes-service';
import type { ClientNote } from '@/types/client-note';

type UseClientNotesResult = {
  notes: ClientNote[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setNotes: Dispatch<SetStateAction<ClientNote[]>>;
};

export function useClientNotes(clientId: string | null | undefined): UseClientNotesResult {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(Boolean(clientId));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!clientId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    const result = await listClientNotes(clientId);
    if (requestIdRef.current !== requestId) return;
    if (!result.ok) {
      setError(result.message);
    } else {
      setNotes(result.data);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  return { notes, loading, error, reload, setNotes };
}
