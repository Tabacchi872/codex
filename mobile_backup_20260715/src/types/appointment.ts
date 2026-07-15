// Appuntamento in agenda creato dal coach. Distinto da `Booking`
// (types/booking.ts): Booking è una prenotazione di seduta extra che il
// CLIENTE avvia da sé (tab Prenotazioni, slot predefiniti); Appointment è
// l'agenda del COACH, può collegarsi a qualunque scheda/sessione
// (`workoutSessionId` → WorkoutPlan.id) e ha orari liberi (non a slot fissi).
// Le due entità non condividono lo storage: unificarle avrebbe richiesto
// riscrivere anche il flusso di prenotazione cliente già funzionante, fuori
// scope di questo intervento (vedi docs/DECISIONS.md).
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type AppointmentType = 'workout' | 'extra_session' | 'consultation' | 'checkin';

export type Appointment = {
  id: string;
  clientId: string;
  coachId: string;
  workoutSessionId?: string;
  title: string;
  date: string; // AAAA-MM-GG
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  type: AppointmentType;
  notes?: string;
  createdAt: string;
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Programmato',
  completed: 'Completato',
  cancelled: 'Annullato',
};

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  workout: 'Allenamento',
  extra_session: 'Sessione extra',
  consultation: 'Consulenza',
  checkin: 'Check-in',
};
