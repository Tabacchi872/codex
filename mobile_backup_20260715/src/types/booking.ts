// Prenotazione di una seduta extra. Logica di blocco slot locale (nessun
// backend condiviso tra dispositivi ancora): uno slot prenotato da QUALSIASI
// cliente registrato su questo store risulta occupato per tutti, perché
// bookings non è filtrato per clientId quando si calcola la disponibilità
// (vedi lib/booking-slots.ts) — così due clienti sullo stesso dispositivo/browser
// non possono mai prenotare lo stesso orario.

export type BookingStatus = 'confermata' | 'annullata';

export type Booking = {
  id: string;
  clientId: string;
  date: string;
  time: string;
  type: string;
  status: BookingStatus;
  createdAt: string;
};

export type TimeSlot = {
  date: string;
  time: string;
  available: boolean;
};
