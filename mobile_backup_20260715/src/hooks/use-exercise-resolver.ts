import { useCallback, useRef, useState } from 'react';

import { getExerciseById } from '@/data/exercise-library';
import { getFitCoachExerciseById } from '@/lib/fitcoach-exercises-service';
import { supabaseConfig } from '@/lib/supabase';
import type { Exercise } from '@/types/training';

// Unifica la lookup sincrona storica (getExerciseById, 44 esercizi locali in
// data/exercise-library.ts, INVARIATA) con gli esercizi FitCoach su Supabase
// (custom/ymove, public.exercises) — senza riscrivere il rendering sincrono
// gia' esistente in workout-plan-form.tsx/esercizi/[id].tsx. resolve() e'
// SEMPRE sincrona: se l'id e' uno dei 44 locali lo ritorna subito; se e' gia'
// in cache lo ritorna subito; altrimenti ritorna undefined e avvia un fetch
// Supabase in background che aggiorna lo stato (il componente chiamante deve
// solo essere React, si ri-renderizza da solo quando lo stato cambia).
export function useExerciseResolver() {
  const [cache, setCache] = useState<Record<string, Exercise>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const resolve = useCallback(
    (id: string): Exercise | undefined => {
      const local = getExerciseById(id);
      if (local) return local;
      if (cache[id]) return cache[id];

      if (supabaseConfig.isConfigured && !pendingRef.current.has(id)) {
        pendingRef.current.add(id);
        getFitCoachExerciseById(id).then((result) => {
          pendingRef.current.delete(id);
          if (result.ok && result.data) {
            const resolved = result.data;
            setCache((prev) => ({ ...prev, [id]: resolved }));
          }
        });
      }
      return undefined;
    },
    [cache],
  );

  // Usata subito dopo un import/creazione riusciti (YMoveExercisePicker):
  // l'esercizio e' gia' noto, non serve aspettare un fetch di ritorno.
  const registerExercise = useCallback((exercise: Exercise) => {
    setCache((prev) => ({ ...prev, [exercise.id]: exercise }));
  }, []);

  return { resolve, registerExercise };
}
