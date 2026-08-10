import { addDays, eachDay, startOfWeek, todayKey, weekdayOf, weekdayName } from './dates.ts';
import type { DateKey, DayStatus, Habit, Schedule, WeekStart } from './types.ts';

/** The set of days a single habit was completed on. */
export type Done = Set<DateKey>;

export interface Streak {
  count: number;
  /** `timesPerWeek` habits streak in weeks, everything else in days. */
  unit: 'day' | 'week';
}

export interface HabitStats {
  current: Streak;
  longest: Streak;
  /** 0–1 over the habit's whole life, or `null` before there is anything to judge. */
  rate: number | null;
  /** Every check-in ever, including ones on unscheduled days. */
  total: number;
}

/** Is this day one the habit asks for? `timesPerWeek` accepts any day. */
export function isScheduledDay(habit: Habit, key: DateKey): boolean {
  switch (habit.schedule.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return habit.schedule.days.includes(weekdayOf(key));
    case 'timesPerWeek':
      return true;
  }
}

/** Was the habit alive on this day — started, and not yet archived? */
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
  done: Done,
  key: DateKey,
  today: DateKey = todayKey(),
): DayStatus {
  if (key > today) return 'future';
  if (!isActiveOn(habit, key)) return 'inactive';
  if (done.has(key)) return 'done';
  // No individual day is required when the target is "N times a week".
  if (habit.schedule.kind === 'timesPerWeek') return 'off';
  if (!isScheduledDay(habit, key)) return 'off';
  return key === today ? 'pending' : 'missed';
}

/** How many times a `timesPerWeek` habit has been done in the week holding `key`. */
export function weekProgress(
  habit: Habit,
  done: Done,
  key: DateKey,
  weekStart: WeekStart,
): { count: number; target: number } {
  const target = habit.schedule.kind === 'timesPerWeek' ? habit.schedule.times : 0;
  const from = startOfWeek(key, weekStart);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    if (done.has(addDays(from, i))) count++;
  }
  return { count, target };
}

function dayStreaks(habit: Habit, done: Done, today: DateKey) {
  const end = lastDay(habit, today);
  if (end < habit.createdAt) return { current: 0, longest: 0 };

  const days = eachDay(habit.createdAt, end).filter((k) => isScheduledDay(habit, k));

  let longest = 0;
  let run = 0;
  for (const k of days) {
    if (done.has(k)) {
      run += 1;
      if (run > longest) longest = run;
    } else if (k === today) {
      // Today is still open — an unchecked box now is not yet a miss.
      break;
    } else {
      run = 0;
    }
  }

  let i = days.length - 1;
  if (i >= 0 && days[i] === today && !done.has(today)) i -= 1; // same grace, walking back
  let current = 0;
  for (; i >= 0 && done.has(days[i]); i -= 1) current += 1;

  return { current, longest };
}

/**
 * Weeks, oldest first, from the habit's first week through its last active one.
 * A week the habit was created partway through is counted as-is: it usually
 * falls short of the target, which just means the streak starts the week after.
 */
function weeksOf(habit: Habit, done: Done, today: DateKey, weekStart: WeekStart) {
  const target = habit.schedule.kind === 'timesPerWeek' ? habit.schedule.times : 0;
  const end = lastDay(habit, today);
  const firstWeek = startOfWeek(habit.createdAt, weekStart);
  const lastWeek = startOfWeek(end, weekStart);
  const currentWeek = startOfWeek(today, weekStart);

  const weeks: { start: DateKey; count: number; met: boolean; open: boolean }[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(w, i);
      if (k > end) break;
      if (done.has(k)) count += 1;
    }
    weeks.push({ start: w, count, met: count >= target, open: w === currentWeek });
  }
  return weeks;
}

function weekStreaks(habit: Habit, done: Done, today: DateKey, weekStart: WeekStart) {
  const weeks = weeksOf(habit, done, today, weekStart);

  let longest = 0;
  let run = 0;
  for (const w of weeks) {
    if (w.met) {
      run += 1;
      if (run > longest) longest = run;
    } else if (w.open) {
      break; // this week can still be saved
    } else {
      run = 0;
    }
  }

  let i = weeks.length - 1;
  if (i >= 0 && weeks[i].open && !weeks[i].met) i -= 1;
  let current = 0;
  for (; i >= 0 && weeks[i].met; i -= 1) current += 1;

  return { current, longest };
}

export function statsFor(
  habit: Habit,
  done: Done,
  weekStart: WeekStart,
  today: DateKey = todayKey(),
): HabitStats {
  const total = done.size;

  if (habit.schedule.kind === 'timesPerWeek') {
    const { current, longest } = weekStreaks(habit, done, today, weekStart);
    const weeks = weeksOf(habit, done, today, weekStart);
    // An unfinished week is only judged once its target is reached, so a
    // Monday morning never drags the lifetime rate down.
    const judged = weeks.filter((w) => !w.open || w.met);
    const target = habit.schedule.times;
    const expected = judged.length * target;
    const achieved = judged.reduce((sum, w) => sum + Math.min(w.count, target), 0);
    return {
      current: { count: current, unit: 'week' },
      longest: { count: longest, unit: 'week' },
      rate: expected > 0 ? achieved / expected : null,
      total,
    };
  }

  const { current, longest } = dayStreaks(habit, done, today);
  const end = lastDay(habit, today);
  const scheduled =
    end < habit.createdAt
      ? []
      : eachDay(habit.createdAt, end).filter(
          // Today only enters the denominator once it has been checked off.
          (k) => isScheduledDay(habit, k) && (k !== today || done.has(k)),
        );
  const hit = scheduled.filter((k) => done.has(k)).length;

  return {
    current: { count: current, unit: 'day' },
    longest: { count: longest, unit: 'day' },
    rate: scheduled.length > 0 ? hit / scheduled.length : null,
    total,
  };
}

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
    case 'timesPerWeek':
      return schedule.times === 1 ? 'Once a week' : `${schedule.times}× a week`;
  }
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
