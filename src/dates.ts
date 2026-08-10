import type { DateKey, WeekStart } from './types.ts';

/**
 * Everything here works in the user's *local* calendar, never UTC.
 * `Date.prototype.toISOString()` is deliberately avoided: for anyone west of
 * Greenwich it reports "tomorrow" for most of the evening, which would let a
 * check-in land on the wrong day and silently break a streak.
 */

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a key. Safe to do date arithmetic on. */
export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The day the user considers "now".
 *
 * `dayStartHour` shifts the boundary later than midnight: at 3, a check-in at
 * 1am still belongs to the previous day. Every other date in the app is
 * derived from this, so the setting only has to be honoured here.
 */
export function todayKey(dayStartHour = 0, now: Date = new Date()): DateKey {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - dayStartHour);
  return toKey(shifted);
}

/**
 * Shift a day key by `n` days. Goes through `setDate`, which is DST-aware:
 * adding 1 to the day before a clock change still lands on the next calendar
 * day rather than 23 or 25 hours later.
 */
export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DateKey): number {
  return fromKey(key).getDay();
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  // Round rather than floor: a DST transition makes one "day" 23 or 25 hours.
  return Math.round(ms / 86_400_000);
}

/** First day of the calendar month holding `key`. */
export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

/** First day of the month `n` months after the one holding `key`. */
export function addMonths(key: DateKey, n: number): DateKey {
  const d = fromKey(startOfMonth(key));
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

export function startOfWeek(key: DateKey, weekStart: WeekStart): DateKey {
  const offset = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -offset);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
];

export function weekdayName(day: number, short = false): string {
  return (short ? WEEKDAY_SHORT : WEEKDAY_LONG)[day];
}

export function monthName(month: number): string {
  return MONTH_SHORT[month];
}

/** "Today", "Yesterday", or e.g. "Mon, Aug 4". */
export function friendlyDate(key: DateKey, today: DateKey = todayKey()): string {
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  const d = fromKey(key);
  const withYear = d.getFullYear() !== fromKey(today).getFullYear();
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}${
    withYear ? ` ${d.getFullYear()}` : ''
  }`;
}
