import type { Appointment } from '@/types/appointment';

// Due appuntamenti si sovrappongono se condividono coach e data e i loro
// intervalli [startTime, endTime) si intersecano. Gli appuntamenti annullati
// non contano come occupazione (regola esplicita: "status non cancelled").
// Confronto puramente su stringhe "HH:mm" (ordinabili lessicograficamente come
// orari nello stesso giorno, niente parsing di date necessario).
export function findOverlappingAppointment(
  existing: Appointment[],
  candidate: Pick<Appointment, 'coachId' | 'date' | 'startTime' | 'endTime'> & { id?: string }
): Appointment | null {
  return (
    existing.find(
      (a) =>
        a.id !== candidate.id &&
        a.coachId === candidate.coachId &&
        a.date === candidate.date &&
        a.status !== 'cancelled' &&
        candidate.startTime < a.endTime &&
        a.startTime < candidate.endTime
    ) ?? null
  );
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  return timePattern.test(startTime) && timePattern.test(endTime) && startTime < endTime;
}
