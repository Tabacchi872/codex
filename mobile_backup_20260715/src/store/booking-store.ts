import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Booking } from '@/types/booking';

// PERSISTENZA LOCALE: le prenotazioni vivono su questo dispositivo/browser.
// Il blocco "slot già occupato" funziona comunque tra clienti diversi che usano
// LO STESSO dispositivo/browser (stesso store), perché la disponibilità si
// calcola su tutte le prenotazioni confermate, non filtrate per cliente — vedi
// lib/booking-slots.ts. Non è una prenotazione condivisa in tempo reale tra
// dispositivi diversi: quello richiede il backend reale (vedi docs/DECISIONS.md).
type BookingState = {
  bookings: Booking[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addBooking: (booking: Booking) => void;
  cancelBooking: (id: string) => void;
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      bookings: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addBooking: (booking) => set((s) => ({ bookings: [...s.bookings, booking] })),
      cancelBooking: (id) =>
        set((s) => ({
          bookings: s.bookings.map((b) => (b.id === id ? { ...b, status: 'annullata' } : b)),
        })),
    }),
    {
      name: 'fitcoach-booking-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
