import type { Booking, TimeSlot } from '@/types/booking';

const SLOT_HOURS = ['08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'];
const DAYS_AHEAD = 14;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Genera gli slot dei prossimi DAYS_AHEAD giorni (esclusa la domenica, giorno di
// chiusura) e li marca occupati se esiste già una prenotazione CONFERMATA per
// quella data/ora, indipendentemente dal cliente che l'ha fatta: questo è ciò
// che garantisce che uno slot preso da un cliente sparisca per tutti gli altri.
export function generateAvailableSlots(bookings: Booking[], today: Date = new Date()): TimeSlot[] {
  const takenKeys = new Set(
    bookings.filter((b) => b.status === 'confermata').map((b) => `${b.date}_${b.time}`)
  );

  const slots: TimeSlot[] = [];
  for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    if (date.getDay() === 0) continue;
    const dateKey = toDateKey(date);
    for (const time of SLOT_HOURS) {
      slots.push({ date: dateKey, time, available: !takenKeys.has(`${dateKey}_${time}`) });
    }
  }
  return slots;
}

export function groupSlotsByDate(slots: TimeSlot[]): { date: string; slots: TimeSlot[] }[] {
  const byDate = new Map<string, TimeSlot[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.date) ?? [];
    list.push(slot);
    byDate.set(slot.date, list);
  }
  return Array.from(byDate.entries()).map(([date, dateSlots]) => ({ date, slots: dateSlots }));
}
