// Calendar helpers. A "day" is a local 'YYYY-MM-DD' string, never a UTC timestamp,
// so late-night check-offs and daylight-saving changes land on the right date.

const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

export const weekday = (key) => fromKey(key).getDay();

export function startOfWeek(key, weekStart = 0) {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7));
}

export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

export function endOfMonth(key) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export const daysInMonth = (key) => Number(endOfMonth(key).slice(8));

export function addMonths(key, n) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export const minKey = (a, b) => (a < b ? a : b);
export const maxKey = (a, b) => (a > b ? a : b);

/** Shifts a moment back so a day that "ends at 2 AM" still counts 1 AM as the previous date. */
export function logicalDate(now = new Date(), dayEndHour = 0) {
  const d = new Date(now.getTime());
  d.setHours(d.getHours() - dayEndHour);
  return d;
}

export const todayKey = (now = new Date(), dayEndHour = 0) => toKey(logicalDate(now, dayEndHour));

/** Hours left before the current (logical) day ends. */
export function hoursLeft(now = new Date(), dayEndHour = 0) {
  const day = logicalDate(now, dayEndHour);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, dayEndHour, 0, 0, 0);
  return (end - now) / 3600000;
}

export function* eachDay(from, to) {
  for (let k = from; k <= to; k = addDays(k, 1)) yield k;
}

export function rangeKeys(from, to) {
  return [...eachDay(from, to)];
}

export const localDayOf = (iso) => toKey(new Date(iso));

// ---- formatting (device locale) ----

const formatters = new Map();
function fmt(opts) {
  const id = JSON.stringify(opts);
  if (!formatters.has(id)) formatters.set(id, new Intl.DateTimeFormat(undefined, opts));
  return formatters.get(id);
}

export const formatDay = (key, opts = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  fmt(opts).format(fromKey(key));

export const formatMonth = (key, opts = { month: 'long', year: 'numeric' }) => fmt(opts).format(fromKey(key));

// 1 Jan 2023 was a Sunday, so day i of that week has getDay() === i.
export const weekdayName = (i, style = 'short') => fmt({ weekday: style }).format(new Date(2023, 0, 1 + i));

export const weekdayLetters = (weekStart = 0) =>
  Array.from({ length: 7 }, (_, i) => weekdayName((weekStart + i) % 7, 'narrow'));

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2023, 0, 1, h, m));
}

/** "today, 3:12 PM", "yesterday, 9:05 AM", or "Nov 1" for a timestamp. */
export function formatWhen(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = toKey(d);
  const t = toKey(now);
  const time = fmt({ hour: 'numeric', minute: '2-digit' }).format(d);
  if (day === t) return `today, ${time}`;
  if (day === addDays(t, -1)) return `yesterday, ${time}`;
  return fmt({ month: 'short', day: 'numeric' }).format(d);
}

export const hhmm = (t) => (t ? t.slice(0, 5) : t);
