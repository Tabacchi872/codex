import { supabase, supabaseConfig } from './supabase';

// Sottoscrizione Supabase Realtime scoped a workout_plans (2026-07-14): il
// cliente vede una nuova scheda assegnata senza riavviare l'app, il coach
// vede aggiornamenti di completamento sessione — SEMPRE filtrata per
// coach_id o client_id dell'utente autenticato (mai una sottoscrizione
// globale sulla tabella). Singleton a livello di modulo: chiamare questa
// funzione da piu' schermate montate insieme (es. dashboard + lista schede)
// non crea piu' di UN canale reale per (ruolo, utente) — aggiunge solo un
// listener in piu'. Il canale viene chiuso automaticamente quando l'ultimo
// listener si disiscrive (unmount/logout), mai lasciato aperto in background.
type Role = 'coach' | 'cliente';

let activeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let activeKey: string | null = null;
let listeners = new Set<() => void>();

function keyFor(userId: string, role: Role): string {
  return `${role}:${userId}`;
}

function teardownActiveChannel(): void {
  if (activeChannel && supabase) {
    supabase.removeChannel(activeChannel);
  }
  activeChannel = null;
  activeKey = null;
  listeners = new Set();
}

export function subscribeWorkoutPlansRealtime(userId: string, role: Role, onChange: () => void): () => void {
  if (!supabaseConfig.isConfigured || !supabase) return () => {};

  const key = keyFor(userId, role);
  if (activeKey !== key) {
    teardownActiveChannel();
    const column = role === 'coach' ? 'coach_id' : 'client_id';
    activeChannel = supabase
      .channel(`workout-plans-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workout_plans', filter: `${column}=eq.${userId}` },
        (payload: { eventType: string }) => {
          console.log('WORKOUT_REALTIME_EVENT', { eventType: payload.eventType });
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
      teardownActiveChannel();
    }
  };
}
