import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Appointment } from '@/types/appointment';

// PERSISTENZA LOCALE (stesso limite degli altri store): appuntamenti solo su
// questo dispositivo/browser. Il controllo anti-sovrapposizione (vedi
// lib/appointment-overlap.ts) va fatto dal chiamante PRIMA di invocare
// addAppointment, così la UI può mostrare "Orario non disponibile" senza
// scrivere nulla: lo store stesso resta un semplice CRUD, senza logica di
// validazione, per restare coerente con gli altri store del progetto.
type AppointmentState = {
  appointments: Appointment[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (appointment: Appointment) => void;
  cancelAppointment: (id: string) => void;
};

export const useAppointmentStore = create<AppointmentState>()(
  persist(
    (set) => ({
      appointments: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      addAppointment: (appointment) => set((s) => ({ appointments: [...s.appointments, appointment] })),

      updateAppointment: (appointment) =>
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === appointment.id ? appointment : a)),
        })),

      cancelAppointment: (id) =>
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a)),
        })),
    }),
    {
      name: 'fitcoach-appointment-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
