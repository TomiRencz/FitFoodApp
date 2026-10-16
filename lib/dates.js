// Fechas en horario local del celular

export function dayRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function localDateKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isToday(date) {
  return localDateKey(date) === localDateKey(new Date());
}

export function dayLabel(date) {
  if (isToday(date)) return 'Hoy';
  if (localDateKey(date) === localDateKey(addDays(new Date(), -1))) return 'Ayer';
  return new Date(date).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function timeLabel(date) {
  return new Date(date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Para <input type="datetime-local">
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
