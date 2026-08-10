import {
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  monthName,
  startOfMonth,
  startOfWeek,

  weekdayOf,
  weekdayName,
  fromKey,
} from './dates.ts';
import { MAX_SLOTS } from './types.ts';
import type {
  DateKey,
  DayStatus,
  DayValue,
  Habit,
  Schedule,
  Tracking,
  WeekStart,
} from './types.ts';

/** One habit's history: day → value. See `DayValue` for what the number means. */
export type Days = Record<DateKey, DayValue>;

/** Streaks are counted in whatever unit the schedule repeats on. */
export type PeriodUnit = 'day' | 'week' | 'month';

export interface Streak {
  count: number;
  unit: PeriodUnit;
}

export interface HabitStats {
  current: Streak;
  longest: Streak;
  /** 0–1 over the habit's whole life, or `null` before there is anything to judge. */
  rate: number | null;
  /** Days finished in full. */
  daysDone: number;
  /** For `amount` habits, everything logged added up — e.g. total km. */
  amountTotal: number;
}

/* ------------------------------------------------------------------ slots */

export const slotDone = (value: DayValue, index: number): boolean =>
  (value & (1 << index)) !== 0;

export const withSlotToggled = (value: DayValue, index: number): DayValue =>
  value ^ (1 << index);

export function slotsFinished(value: DayValue, total: number): number {
  let n = 0;
  for (let i = 0; i < total; i++) if (slotDone(value, i)) n += 1;
  return n;
}

/* --------------------------------------------------------------- progress */

/** What one day of this habit demands. */
export function targetOf(tracking: Tracking): number {
  switch (tracking.kind) {
    case 'check':
      return 1;
    case 'count':
      return tracking.target;
    case 'amount':
      return tracking.target;
    case 'slots':
      return Math.max(1, tracking.slots.length);
  }
}

/**
 * How far into a day's target the habit got, on a common scale.
 *
 * Collapsing all four tracking modes to one pair of numbers is what lets the
 * streak and rate maths below stay identical to when a check-in was a boolean.
 */
export function progressOn(habit: Habit, days: Days, key: DateKey) {
  const raw = days[key] ?? 0;
  const target = targetOf(habit.tracking);
  const value = habit.tracking.kind === 'slots'
    ? slotsFinished(raw, habit.tracking.slots.length)
    : raw;
  return { value, target, raw, done: value >= target };
}

export function isDone(habit: Habit, days: Days, key: DateKey): boolean {
  return progressOn(habit, days, key).done;
}

/** Any progress at all, even short of the target. */
export function hasProgress(habit: Habit, days: Days, key: DateKey): boolean {
  return progressOn(habit, days, key).value > 0;
}

/**
 * Do two tracking settings give a stored day the same meaning?
 *
 * Only the *shape* matters, not the target: changing "8× a day" to "10× a day"
 * leaves a stored 8 meaning eight, it just stops being enough. Changing the
 * kind, or the number of slots, re-reads the same number as something else
 * entirely — a count of 4 would be read as a bitmask naming a slot that may
 * not exist — so those values have to be converted rather than reinterpreted.
 */
export function trackingMatches(a: Tracking, b: Tracking): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'slots' && b.kind === 'slots') return a.slots.length === b.slots.length;
  return true;
}

/** Every slot ticked, for a slots habit; otherwise just the target. */
export function fullValue(tracking: Tracking): number {
  return tracking.kind === 'slots' ? (1 << tracking.slots.length) - 1 : targetOf(tracking);
}

/**
 * Carry history across a change of tracking mode.
 *
 * Whether a day was finished is the part worth keeping — it is what streaks
 * and rates are built from — so finished days are rewritten as finished under
 * the new rules. Part-finished days are dropped: "3.2 km" has no honest
 * translation into "8 glasses", and inventing one would be worse than losing it.
 */
export function remapDays(before: Habit, after: Habit, days: Days): Days {
  const next: Days = {};
  const full = fullValue(after.tracking);
  for (const day of Object.keys(days)) {
    if (isDone(before, days, day)) next[day] = full;
  }
  return next;
}

/* -------------------------------------------------------------- schedules */

/** Habits that set a quota over a whole week or month rather than per day. */
export function periodOf(schedule: Schedule): PeriodUnit {
  if (schedule.kind === 'timesPerWeek') return 'week';
  if (schedule.kind === 'timesPerMonth') return 'month';
  return 'day';
}

/** How many days a per-period schedule asks for. */
function quotaOf(schedule: Schedule): number {
  if (schedule.kind === 'timesPerWeek' || schedule.kind === 'timesPerMonth') {
    return schedule.times;
  }
  return 0;
}

/** Is this day one the habit asks for? Per-period schedules accept any day. */
export function isScheduledDay(habit: Habit, key: DateKey): boolean {
  switch (habit.schedule.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return habit.schedule.days.includes(weekdayOf(key));
    case 'everyNDays':
      // Anchored to the start date, so "every 3 days" means every third day
      // from when the habit began rather than an arbitrary calendar offset.
      return daysBetween(habit.createdAt, key) % habit.schedule.n === 0;
    case 'timesPerWeek':
    case 'timesPerMonth':
      return true;
  }
}

export function isActiveOn(habit: Habit, key: DateKey): boolean {
  if (key < habit.createdAt) return false;
  if (habit.archivedAt && key > habit.archivedAt) return false;
  return true;
}

/** The last day that counts for this habit: today, or the day it was archived. */
function lastDay(habit: Habit, today: DateKey): DateKey {
  return habit.archivedAt && habit.archivedAt < today ? habit.archivedAt : today;
}

export function dayStatus(
  habit: Habit,
  days: Days,
  key: DateKey,
  today: DateKey,
): DayStatus {
  if (key > today) return 'future';
  if (!isActiveOn(habit, key)) return 'inactive';

  const { value, done } = progressOn(habit, days, key);
  if (done) return 'done';
  if (value > 0) return 'partial';

  if (periodOf(habit.schedule) !== 'day') return 'off'; // no single day is required
  if (!isScheduledDay(habit, key)) return 'off';
  return key === today ? 'pending' : 'missed';
}

/* ---------------------------------------------------------------- periods */

function periodStart(key: DateKey, unit: PeriodUnit, weekStart: WeekStart): DateKey {
  if (unit === 'week') return startOfWeek(key, weekStart);
  if (unit === 'month') return startOfMonth(key);
  return key;
}

function nextPeriod(key: DateKey, unit: PeriodUnit): DateKey {
  return unit === 'month' ? addMonths(key, 1) : addDays(key, 7);
}

function periodEnd(start: DateKey, unit: PeriodUnit): DateKey {
  return addDays(nextPeriod(start, unit), -1);
}

export function describePeriod(unit: PeriodUnit, start: DateKey): string {
  if (unit === 'month') return monthName(fromKey(start).getMonth());
  return start;
}

/* ---------------------------------------------------------------- streaks */

function dayStreaks(habit: Habit, days: Days, today: DateKey) {
  const end = lastDay(habit, today);
  if (end < habit.createdAt) return { current: 0, longest: 0 };

  const scheduled = eachDay(habit.createdAt, end).filter((k) => isScheduledDay(habit, k));

  let longest = 0;
  let run = 0;
  for (const k of scheduled) {
    if (isDone(habit, days, k)) {
      run += 1;
      if (run > longest) longest = run;
    } else if (k === today) {
      break; // today is still open — an unfinished habit now is not yet a miss
    } else {
      run = 0;
    }
  }

  let i = scheduled.length - 1;
  if (i >= 0 && scheduled[i] === today && !isDone(habit, days, today)) i -= 1;
  let current = 0;
  for (; i >= 0 && isDone(habit, days, scheduled[i]); i -= 1) current += 1;

  return { current, longest };
}

/**
 * Every week or month, oldest first, from the habit's first through its last
 * active one. A period the habit was created partway through is counted as-is:
 * it usually falls short, which just means the streak starts the period after.
 */
function periodsOf(habit: Habit, days: Days, today: DateKey, weekStart: WeekStart) {
  const unit = periodOf(habit.schedule);
  const quota = quotaOf(habit.schedule);
  const end = lastDay(habit, today);
  const first = periodStart(habit.createdAt, unit, weekStart);
  const last = periodStart(end, unit, weekStart);
  const currentStart = periodStart(today, unit, weekStart);

  const periods: { start: DateKey; count: number; met: boolean; open: boolean }[] = [];
  for (let p = first; p <= last; p = nextPeriod(p, unit)) {
    let count = 0;
    for (const k of eachDay(p, periodEnd(p, unit))) {
      if (k > end) break;
      if (isDone(habit, days, k)) count += 1;
    }
    periods.push({ start: p, count, met: count >= quota, open: p === currentStart });
  }
  return periods;
}

function periodStreaks(habit: Habit, days: Days, today: DateKey, weekStart: WeekStart) {
  const periods = periodsOf(habit, days, today, weekStart);

  let longest = 0;
  let run = 0;
  for (const p of periods) {
    if (p.met) {
      run += 1;
      if (run > longest) longest = run;
    } else if (p.open) {
      break; // still time to hit the quota
    } else {
      run = 0;
    }
  }

  let i = periods.length - 1;
  if (i >= 0 && periods[i].open && !periods[i].met) i -= 1;
  let current = 0;
  for (; i >= 0 && periods[i].met; i -= 1) current += 1;

  return { current, longest };
}

/** How far into the current week's or month's quota this habit is. */
export function periodProgress(
  habit: Habit,
  days: Days,
  key: DateKey,
  weekStart: WeekStart,
): { count: number; quota: number; unit: PeriodUnit } {
  const unit = periodOf(habit.schedule);
  const quota = quotaOf(habit.schedule);
  if (unit === 'day') return { count: 0, quota: 0, unit };

  const start = periodStart(key, unit, weekStart);
  let count = 0;
  for (const k of eachDay(start, periodEnd(start, unit))) {
    if (isDone(habit, days, k)) count += 1;
  }
  return { count, quota, unit };
}

export function statsFor(
  habit: Habit,
  days: Days,
  weekStart: WeekStart,
  today: DateKey,
): HabitStats {
  const logged = Object.keys(days);
  const daysDone = logged.filter((k) => isDone(habit, days, k)).length;
  const amountTotal =
    habit.tracking.kind === 'amount'
      ? logged.reduce((sum, k) => sum + (days[k] ?? 0), 0)
      : 0;

  const unit = periodOf(habit.schedule);

  if (unit !== 'day') {
    const { current, longest } = periodStreaks(habit, days, today, weekStart);
    const periods = periodsOf(habit, days, today, weekStart);
    // An unfinished period is only judged once its quota is reached, so a
    // Monday morning never drags the lifetime rate down.
    const judged = periods.filter((p) => !p.open || p.met);
    const quota = quotaOf(habit.schedule);
    const expected = judged.length * quota;
    const achieved = judged.reduce((sum, p) => sum + Math.min(p.count, quota), 0);
    return {
      current: { count: current, unit },
      longest: { count: longest, unit },
      rate: expected > 0 ? achieved / expected : null,
      daysDone,
      amountTotal,
    };
  }

  const { current, longest } = dayStreaks(habit, days, today);
  const end = lastDay(habit, today);
  const scheduled =
    end < habit.createdAt
      ? []
      : eachDay(habit.createdAt, end).filter(
          // Today only enters the denominator once it has been finished.
          (k) => isScheduledDay(habit, k) && (k !== today || isDone(habit, days, k)),
        );
  const hit = scheduled.filter((k) => isDone(habit, days, k)).length;

  return {
    current: { count: current, unit: 'day' },
    longest: { count: longest, unit: 'day' },
    rate: scheduled.length > 0 ? hit / scheduled.length : null,
    daysDone,
    amountTotal,
  };
}

/* ---------------------------------------------------------- descriptions */

export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'daily':
      return 'Every day';
    case 'weekdays': {
      const days = [...schedule.days].sort((a, b) => a - b);
      if (days.length === 0) return 'No days set';
      if (days.length === 7) return 'Every day';
      if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Weekdays';
      if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
      return days.map((d) => weekdayName(d, true)).join(', ');
    }
    case 'everyNDays':
      return schedule.n === 1 ? 'Every day' : `Every ${schedule.n} days`;
    case 'timesPerWeek':
      return schedule.times === 1 ? 'Once a week' : `${schedule.times}× a week`;
    case 'timesPerMonth':
      return schedule.times === 1 ? 'Once a month' : `${schedule.times}× a month`;
  }
}

/** "8× a day", "5 km", "Morning, Evening" — or nothing for a plain check. */
export function describeTracking(tracking: Tracking): string {
  switch (tracking.kind) {
    case 'check':
      return '';
    case 'count':
      return `${tracking.target}× a day`;
    case 'amount':
      return `${formatNumber(tracking.target)} ${tracking.unit}`;
    case 'slots':
      return tracking.slots.join(', ');
  }
}

/** Trims the pointless ".0" off whole numbers without rounding real decimals. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** "3 of 8", "3.2 / 5 km", "1 of 2 done" — the day's progress in words. */
export function describeProgress(habit: Habit, days: Days, key: DateKey): string {
  const { value, target } = progressOn(habit, days, key);
  switch (habit.tracking.kind) {
    case 'check':
      return value >= 1 ? 'Done' : 'Not yet';
    case 'count':
      return `${value} of ${target}`;
    case 'amount':
      return `${formatNumber(value)} / ${formatNumber(target)} ${habit.tracking.unit}`;
    case 'slots':
      return `${value} of ${target} done`;
  }
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export { MAX_SLOTS };
