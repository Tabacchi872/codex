import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { normalizeSubscriptionStoredStatus, type SubscriptionPackage } from '@/types/subscription';

// PERSISTENZA LOCALE (stesso limite degli altri store, vedi client-store.ts):
// gli abbonamenti vivono solo su questo dispositivo/browser, AsyncStorage,
// nessun backend/sincronizzazione. Nessun seed: i clienti esistenti prima di
// questo store non hanno un abbonamento finché il coach non ne crea uno (vedi
// lib/workout-progress.ts per il fallback su Client.purchasedWorkoutsTotal).
type SubscriptionState = {
  subscriptions: SubscriptionPackage[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addSubscription: (subscription: SubscriptionPackage) => void;
  updateSubscription: (subscription: SubscriptionPackage) => void;
  // Incrementa completedWorkouts di 1 per l'abbonamento indicato. Chiamata solo
  // dalla transizione todo -> completed di una sessione (vedi
  // app/schede/[id].tsx, handleFinishSession), che per costruzione avviene una
  // sola volta per sessione: non serve un guard aggiuntivo qui.
  incrementCompletedWorkouts: (subscriptionId: string) => void;
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      subscriptions: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      addSubscription: (subscription) =>
        set((s) => ({ subscriptions: [...s.subscriptions, normalizeSubscriptionStoredStatus(subscription)] })),

      updateSubscription: (subscription) =>
        set((s) => ({
          subscriptions: s.subscriptions.map((sub) =>
            sub.id === subscription.id ? normalizeSubscriptionStoredStatus(subscription) : sub
          ),
        })),

      incrementCompletedWorkouts: (subscriptionId) =>
        set((s) => ({
          subscriptions: s.subscriptions.map((sub) => {
            if (sub.id !== subscriptionId) return sub;

            const completedWorkouts = sub.completedWorkouts + 1;
            return normalizeSubscriptionStoredStatus({
              ...sub,
              completedWorkouts,
              updatedAt: new Date().toISOString(),
            });
          }),
        })),
    }),
    {
      name: 'fitcoach-subscription-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
