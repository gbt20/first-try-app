import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, daysBetween, startOfWeek, toKey, friendlyDate } from './dates.ts';
import { dayStatus, statsFor, weekProgress, describeSchedule } from './habits.ts';
import { parseState, serializeState } from './storage.ts';
import type { Habit, Schedule } from './types.ts';

function habit(schedule: Schedule, createdAt = '2025-01-01', archivedAt: string | null = null): Habit {
  return {
    id: 'h1',
    name: 'Test',
    emoji: '✅',
    color: '#f97362',
    schedule,
    createdAt,
    archivedAt,
  };
}

const daily = (createdAt?: string) => habit({ kind: 'daily' }, createdAt);
const done = (...days: string[]) => new Set(days);

test('addDays crosses a spring-forward DST boundary cleanly', () => {
  // 2025-03-09 is when US clocks jump forward; that day is only 23 hours long.
  assert.equal(addDays('2025-03-08', 1), '2025-03-09');
  assert.equal(addDays('2025-03-09', 1), '2025-03-10');
  assert.equal(daysBetween('2025-03-08', '2025-03-10'), 2);
  // ...and fall-back, where a day is 25 hours long.
  assert.equal(addDays('2025-11-01', 2), '2025-11-03');
  assert.equal(daysBetween('2025-11-01', '2025-11-03'), 2);
});

test('addDays rolls over months and leap years', () => {
  assert.equal(addDays('2025-01-31', 1), '2025-02-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
});

test('toKey uses the local calendar, not UTC', () => {
  // Late-evening local time is already "tomorrow" in UTC for western zones;
  // the key must still read as the local day.
  const d = new Date(2025, 6, 4, 23, 30);
  assert.equal(toKey(d), '2025-07-04');
});

test('startOfWeek respects the configured first day', () => {
  assert.equal(startOfWeek('2025-08-07', 1), '2025-08-04'); // Thu -> Monday
  assert.equal(startOfWeek('2025-08-07', 0), '2025-08-03'); // Thu -> Sunday
  assert.equal(startOfWeek('2025-08-04', 1), '2025-08-04'); // already Monday
  assert.equal(startOfWeek('2025-08-03', 0), '2025-08-03'); // already Sunday
});

test('daily streak counts consecutive days up to today', () => {
  const s = statsFor(daily(), done('2025-01-01', '2025-01-02', '2025-01-03'), 1, '2025-01-03');
  assert.equal(s.current.count, 3);
  assert.equal(s.current.unit, 'day');
  assert.equal(s.longest.count, 3);
  assert.equal(s.rate, 1);
});

test("an unchecked today does not break the streak yet", () => {
  const s = statsFor(daily(), done('2025-01-01', '2025-01-02'), 1, '2025-01-03');
  assert.equal(s.current.count, 2, 'streak still stands through yesterday');
  assert.equal(s.longest.count, 2);
  // Today is excluded from the denominator until it is checked off.
  assert.equal(s.rate, 1);
});

test('a missed day in the past does break the streak', () => {
  const s = statsFor(daily(), done('2025-01-01', '2025-01-02'), 1, '2025-01-04');
  assert.equal(s.current.count, 0, '2025-01-03 was missed');
  assert.equal(s.longest.count, 2);
  assert.equal(s.rate, 2 / 3); // Jan 1-3 judged, Jan 4 still open
});

test('longest streak survives a later break', () => {
  const s = statsFor(
    daily(),
    done('2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-06', '2025-01-07'),
    1,
    '2025-01-07',
  );
  assert.equal(s.current.count, 2);
  assert.equal(s.longest.count, 4);
  assert.equal(s.total, 6);
});

test('weekday habits skip unscheduled days without breaking', () => {
  // Mon/Wed/Fri, starting Mon 2025-08-04.
  const h = habit({ kind: 'weekdays', days: [1, 3, 5] }, '2025-08-04');
  // Mon 4th, Wed 6th, Fri 8th, Mon 11th — the weekend gap must not count.
  const s = statsFor(h, done('2025-08-04', '2025-08-06', '2025-08-08', '2025-08-11'), 1, '2025-08-11');
  assert.equal(s.current.count, 4);
  assert.equal(s.rate, 1);
});

test('weekday habits break when a scheduled day is missed', () => {
  const h = habit({ kind: 'weekdays', days: [1, 3, 5] }, '2025-08-04');
  // Wed 2025-08-06 skipped.
  const s = statsFor(h, done('2025-08-04', '2025-08-08', '2025-08-11'), 1, '2025-08-11');
  assert.equal(s.current.count, 2, 'Fri + Mon');
  assert.equal(s.longest.count, 2);
  assert.equal(s.rate, 3 / 4);
});

test('a check-in on an unscheduled day counts as a check-in but not a streak day', () => {
  const h = habit({ kind: 'weekdays', days: [1] }, '2025-08-04'); // Mondays only
  const s = statsFor(h, done('2025-08-04', '2025-08-05'), 1, '2025-08-05');
  assert.equal(s.current.count, 1, 'only the Monday counts toward the streak');
  assert.equal(s.total, 2, 'but both are real check-ins');
});

test('timesPerWeek streaks are measured in weeks', () => {
  const h = habit({ kind: 'timesPerWeek', times: 3 }, '2025-08-04'); // a Monday
  const s = statsFor(
    h,
    done(
      '2025-08-04', '2025-08-06', '2025-08-08', // week 1: 3 ✓
      '2025-08-11', '2025-08-13', '2025-08-15', // week 2: 3 ✓
    ),
    1,
    '2025-08-17', // Sunday, end of week 2
  );
  assert.equal(s.current.count, 2);
  assert.equal(s.current.unit, 'week');
  assert.equal(s.longest.count, 2);
  assert.equal(s.rate, 1);
});

test('an unfinished current week does not break a weekly streak', () => {
  const h = habit({ kind: 'timesPerWeek', times: 3 }, '2025-08-04');
  const s = statsFor(
    h,
    done('2025-08-04', '2025-08-06', '2025-08-08', '2025-08-11'), // week 2 only has 1 so far
    1,
    '2025-08-12', // Tuesday of week 2
  );
  assert.equal(s.current.count, 1, 'week 1 still counts; week 2 is not over');
  assert.equal(s.rate, 1, 'the in-progress week is not judged yet');
});

test('a finished week below target breaks a weekly streak', () => {
  const h = habit({ kind: 'timesPerWeek', times: 3 }, '2025-08-04');
  const s = statsFor(
    h,
    done('2025-08-04', '2025-08-06', '2025-08-08', '2025-08-11'), // week 2: only 1
    1,
    '2025-08-18', // Monday of week 3
  );
  assert.equal(s.current.count, 0);
  assert.equal(s.longest.count, 1);
  assert.equal(s.rate, 4 / 6, 'weeks 1 and 2 judged: 3/3 and 1/3');
});

test('extra check-ins in a week do not inflate the rate above 100%', () => {
  const h = habit({ kind: 'timesPerWeek', times: 2 }, '2025-08-04');
  const s = statsFor(
    h,
    done('2025-08-04', '2025-08-05', '2025-08-06', '2025-08-07', '2025-08-08'),
    1,
    '2025-08-11',
  );
  assert.equal(s.rate, 1);
  assert.equal(s.total, 5);
});

test('weekProgress counts within the configured week', () => {
  const h = habit({ kind: 'timesPerWeek', times: 3 }, '2025-08-04');
  const d = done('2025-08-04', '2025-08-06', '2025-08-11');
  assert.deepEqual(weekProgress(h, d, '2025-08-08', 1), { count: 2, target: 3 });
  assert.deepEqual(weekProgress(h, d, '2025-08-12', 1), { count: 1, target: 3 });
});

test('archived habits stop accruing misses', () => {
  const h = habit({ kind: 'daily' }, '2025-01-01', '2025-01-03');
  const s = statsFor(h, done('2025-01-01', '2025-01-02', '2025-01-03'), 1, '2025-01-31');
  assert.equal(s.current.count, 3, 'frozen at the archive date');
  assert.equal(s.rate, 1, 'the weeks after archiving are not counted as missed');
});

test('dayStatus classifies each kind of day', () => {
  const h = daily('2025-01-02');
  const d = done('2025-01-02');
  assert.equal(dayStatus(h, d, '2025-01-01', '2025-01-05'), 'inactive');
  assert.equal(dayStatus(h, d, '2025-01-02', '2025-01-05'), 'done');
  assert.equal(dayStatus(h, d, '2025-01-03', '2025-01-05'), 'missed');
  assert.equal(dayStatus(h, d, '2025-01-05', '2025-01-05'), 'pending');
  assert.equal(dayStatus(h, d, '2025-01-06', '2025-01-05'), 'future');

  const mondays = habit({ kind: 'weekdays', days: [1] }, '2025-08-04');
  assert.equal(dayStatus(mondays, new Set(), '2025-08-05', '2025-08-08'), 'off');

  const twice = habit({ kind: 'timesPerWeek', times: 2 }, '2025-08-04');
  assert.equal(dayStatus(twice, new Set(), '2025-08-05', '2025-08-08'), 'off', 'no day is required');
});

test('a brand new habit has no rate to report', () => {
  const s = statsFor(daily('2025-01-05'), new Set(), 1, '2025-01-05');
  assert.equal(s.rate, null);
  assert.equal(s.current.count, 0);
});

test('describeSchedule reads naturally', () => {
  assert.equal(describeSchedule({ kind: 'daily' }), 'Every day');
  assert.equal(describeSchedule({ kind: 'weekdays', days: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(describeSchedule({ kind: 'weekdays', days: [0, 6] }), 'Weekends');
  assert.equal(describeSchedule({ kind: 'weekdays', days: [1, 3] }), 'Mon, Wed');
  assert.equal(describeSchedule({ kind: 'timesPerWeek', times: 1 }), 'Once a week');
  assert.equal(describeSchedule({ kind: 'timesPerWeek', times: 4 }), '4× a week');
});

test('friendlyDate names the nearby days', () => {
  assert.equal(friendlyDate('2025-08-10', '2025-08-10'), 'Today');
  assert.equal(friendlyDate('2025-08-09', '2025-08-10'), 'Yesterday');
  assert.equal(friendlyDate('2025-08-04', '2025-08-10'), 'Mon, Aug 4');
  assert.equal(friendlyDate('2024-12-25', '2025-08-10'), 'Wed, Dec 25 2024');
});

test('state survives a save/load round trip', () => {
  const state = {
    habits: [daily('2025-01-01')],
    completions: { h1: done('2025-01-02', '2025-01-01') },
    weekStart: 1 as const,
  };
  const back = parseState(serializeState(state));
  assert.equal(back.habits.length, 1);
  assert.deepEqual([...back.completions.h1], ['2025-01-01', '2025-01-02']);
  assert.equal(back.weekStart, 1);
});

test('corrupt storage degrades to an empty app instead of crashing', () => {
  assert.deepEqual(parseState(null).habits, []);
  assert.deepEqual(parseState('not json').habits, []);
  assert.deepEqual(parseState('"a string"').habits, []);
  assert.deepEqual(parseState('{"habits":"nope"}').habits, []);
});

test('malformed habit fields are repaired, not fatal', () => {
  const raw = JSON.stringify({
    schema: 1,
    habits: [
      { id: 'a', name: 'Ok', schedule: { kind: 'weekdays', days: [1, 9, 'x', 1] } },
      { id: 'b', schedule: { kind: 'timesPerWeek', times: 99 } },
      { id: 'c', schedule: { kind: 'weekdays', days: [] } },
      { nope: true },
    ],
    completions: { a: ['2025-01-01', 'garbage'], ghost: ['2025-01-01'] },
  });
  const s = parseState(raw);
  assert.deepEqual(s.habits.map((h) => h.id), ['a', 'b', 'c']);
  assert.deepEqual(s.habits[0].schedule, { kind: 'weekdays', days: [1] }, 'dedupes and drops out-of-range');
  assert.deepEqual(s.habits[1].schedule, { kind: 'timesPerWeek', times: 7 }, 'clamped to 7');
  assert.deepEqual(s.habits[2].schedule, { kind: 'daily' }, 'empty weekday list is unusable');
  assert.deepEqual([...s.completions.a], ['2025-01-01'], 'non-date entries dropped');
  assert.equal(s.completions.ghost, undefined, 'orphaned history dropped');
  assert.equal(s.habits[1].name, 'Untitled');
});
