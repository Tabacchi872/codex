const WEEKDAYS_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS_IT_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Formattazione data in italiano senza dipendenze esterne (Intl/date-fns), per
// coerenza con lo stile numerico "AAAA-MM-GG" già usato altrove nell'app.
export function formatDayMonth(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${MONTHS_IT_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  return WEEKDAYS_IT[d.getDay()];
}
