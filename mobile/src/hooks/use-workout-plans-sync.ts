import { useCallback, useEffect, useRef, useState } from 'react';

import { getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import { listWorkoutPlansForCurrentUser } from '@/lib/workout-plan-service';
import { migrateLocalWorkoutPlansForCoach } from '@/lib/workout-plan-migration';
import { subscribeWorkoutPlansRealtime } from '@/lib/workout-plan-realtime';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';

// Hook unico per la sincronizzazione schede/allenamenti con Supabase
// (2026-07-14). Chiamabile da piu' schermate (dashboard, lista schede coach,
// lista allenamenti cliente): la migrazione una tantum e il canale Realtime
// sono deduplicati a livello di modulo (vedi workout-plan-migration.ts,
// workout-plan-realtime.ts), quindi montare questo hook in piu' punti non
// duplica ne' il lavoro di migrazione ne' il canale — ogni istanza ha solo
// il proprio stato locale loading/error per la propria chiamata di refresh.
//
// Se Supabase non e' configurato, refresh() e' un no-op: workoutPlans resta
// gestito interamente da useTrainingStore (addWorkoutPlan/updateWorkoutPlan/
// deleteWorkoutPlan), esattamente come prima di questo intervento.
export function useWorkoutPlansSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRole = useAuthStore((s) => s.currentRole);
  const setWorkoutPlans = useTrainingStore((s) => s.setWorkoutPlans);

  const refresh = useCallback(async () => {
    if (!supabaseConfig.isConfigured) return;
    if (currentRole !== 'coach' && currentRole !== 'cliente') return;

    setLoading(true);
    setError(null);

    // Migrazione una tantum (solo lato coach: un cliente non crea mai schede
    // localmente) PRIMA della lettura remota, cosi' i piani appena migrati
    // compaiono gia' nel primo elenco caricato invece di un secondo giro.
    if (currentRole === 'coach') {
      const session = await getCurrentSession();
      const coachId = session.ok ? (session.data?.user.id ?? null) : null;
      if (coachId) {
        await migrateLocalWorkoutPlansForCoach(coachId, useTrainingStore.getState().workoutPlans, (oldId, migrated) => {
          useTrainingStore.getState().replaceWorkoutPlan(oldId, migrated);
        });
      }
    }

    const result = await listWorkoutPlansForCurrentUser();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setWorkoutPlans(result.data);
  }, [currentRole, setWorkoutPlans]);

  // Ref per evitare che l'effetto Realtime sotto si ri-sottoscriva ogni volta
  // che `refresh` cambia identita' (dipende da currentRole/setWorkoutPlans,
  // stabili nella pratica ma non garantiti referenzialmente stabili) — la
  // sottoscrizione deve dipendere SOLO da un vero cambio di ruolo/utente.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!supabaseConfig.isConfigured || (currentRole !== 'coach' && currentRole !== 'cliente')) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    getCurrentSession().then((session) => {
      if (cancelled || !session.ok || !session.data) return;
      unsubscribe = subscribeWorkoutPlansRealtime(session.data.user.id, currentRole, () => refreshRef.current());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentRole]);

  return { loading, error, refresh };
}
