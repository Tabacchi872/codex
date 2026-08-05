import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Flag globale minimale, stesso pattern di client-onboarding-store.ts /
// client-fitness-profile-store.ts: attivato da "Controlla questionario"
// (pending_template, workout.tsx) per far bypassare al gate di auth-gate.tsx
// il redirect automatico verso Home su /onboarding-cliente e
// /questionario-fitness quando il profilo e' gia' completo. Persistito per
// sopravvivere a un refresh del browser durante la modifica.
type ProgramEditState = {
  active: boolean;
  start: () => void;
  finish: () => void;
};

export const useProgramEditStore = create<ProgramEditState>()(
  persist(
    (set) => ({
      active: false,
      start: () => set({ active: true }),
      finish: () => set({ active: false }),
    }),
    {
      name: 'fitcoach-program-edit-mode',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
