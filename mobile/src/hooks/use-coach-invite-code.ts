import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ensureCoachOnboarding, getCoachActiveRegistrationCode, getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';

type CoachInviteCodeState = {
  code: string | null;
  active: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useCoachInviteCode(): CoachInviteCodeState {
  const [code, setCode] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    if (!supabaseConfig.isConfigured) {
      setCode(null);
      setActive(false);
      setError('Codice invito non disponibile');
      setLoading(false);
      inFlightRef.current = false;
      return;
    }

    const sessionResult = await getCurrentSession();
    if (requestIdRef.current !== requestId) return;
    const session = sessionResult.ok ? sessionResult.data : null;
    if (!session?.user.id) {
      setCode(null);
      setActive(false);
      setError('Impossibile caricare il codice invito');
      setLoading(false);
      inFlightRef.current = false;
      return;
    }

    const firstRead = await getCoachActiveRegistrationCode(session.user.id);
    if (requestIdRef.current !== requestId) {
      inFlightRef.current = false;
      return;
    }
    if (!firstRead.ok) {
      if (__DEV__) console.warn('COACH_INVITE_CODE_READ_ERROR', firstRead.message);
      setCode(null);
      setActive(false);
      setError('Impossibile caricare il codice invito');
      setLoading(false);
      inFlightRef.current = false;
      return;
    }
    if (firstRead.data) {
      setCode(firstRead.data.code);
      setActive(firstRead.data.active);
      setError(null);
      setLoading(false);
      inFlightRef.current = false;
      return;
    }

    const ensureResult = await ensureCoachOnboarding(session.user.id, session.user.user_metadata ?? {});
    if (requestIdRef.current !== requestId) {
      inFlightRef.current = false;
      return;
    }
    if (!ensureResult.ok) {
      if (__DEV__) console.warn('COACH_INVITE_CODE_ENSURE_ERROR', ensureResult.message);
      setCode(null);
      setActive(false);
      setError('Codice invito non disponibile');
      setLoading(false);
      inFlightRef.current = false;
      return;
    }

    const secondRead = await getCoachActiveRegistrationCode(session.user.id);
    if (requestIdRef.current !== requestId) {
      inFlightRef.current = false;
      return;
    }
    if (!secondRead.ok) {
      if (__DEV__) console.warn('COACH_INVITE_CODE_RELOAD_ERROR', secondRead.message);
      setCode(null);
      setActive(false);
      setError('Impossibile caricare il codice invito');
    } else if (secondRead.data) {
      setCode(secondRead.data.code);
      setActive(secondRead.data.active);
      setError(null);
    } else {
      setCode(null);
      setActive(false);
      setError('Codice invito non disponibile');
    }
    setLoading(false);
    inFlightRef.current = false;
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

  return { code, active, loading, error, reload: load };
}
