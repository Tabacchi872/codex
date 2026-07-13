const WEEKDAYS_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

// Eyebrow data completa ("MERCOLEDÌ 9 LUGLIO", stile mockup Home): calcolata
// dalla data reale passata (di norma `new Date()`), mai un valore fisso.
export function formatFullDateEyebrow(date: Date): string {
  const weekday = WEEKDAYS_IT[date.getDay()].toUpperCase();
  const month = MONTHS_IT[date.getMonth()].toUpperCase();
  return `${weekday} ${date.getDate()} ${month}`;
}
// Formattazione data in italiano senza dipendenze esterne (Intl/date-fns), per
// coerenza con lo stile numerico "AAAA-MM-GG" già usato altrove nell'app.
export function formatDayMonth(dateStr: string): string {
  return formatDateForDisplay(dateStr);
}

export function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  return WEEKDAYS_IT[d.getDay()];
}

export function formatDateForDisplay(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function parseDateFromDisplay(displayDate: string): string {
  const value = displayDate.trim();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  const isValid =
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day);

  return isValid ? `${year}-${month}-${day}` : '';
}
