import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, addMonths, daysBetween, friendlyDate, startOfMonth, startOfWeek, toKey, todayKey } from './dates.ts';
import {
  dayStatus,
  describeSchedule,
  describeTracking,
  periodProgress,
  progressOn,
  remapDays,
  slotDone,
  slotsFinished,
  statsFor,
  trackingMatches,
  withSlotToggled,
} from './habits.ts';
import type { Days } from './habits.ts';
import { parseState, serializeState, toCsv } from './storage.ts';
import type { AppState, Habit } from './types.ts';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Test',
    emoji: '✅',
    color: '#f97362',
    schedule: { kind: 'daily' },
    tracking: { kind: 'check' },
    tags: [],
    createdAt: '2025-01-01',
    archivedAt: null,
    ...over,
  };
}

/** Days finished, for a plain check habit. */
const checks = (...keys: string[]): Days =>
  Object.fromEntries(keys.map((k) => [k, 1]));

/* ------------------------------------------------------------------ dates */

test('addDays crosses a spring-forward DST boundary cleanly', () => {
  assert.equal(addDays('2025-03-08', 1), '2025-03-09');
  assert.equal(addDays('2025-03-09', 1), '2025-03-10');
  assert.equal(daysBetween('2025-03-08', '2025-03-10'), 2);
  assert.equal(addDays('2025-11-01', 2), '2025-11-03');
  assert.equal(daysBetween('2025-11-01', '2025-11-03'), 2);
});

test('addDays rolls over months and leap years', () => {
  assert.equal(addDays('2025-01-31', 1), '2025-02-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
});

test('toKey uses the local calendar, not UTC', () => {
  assert.equal(toKey(new Date(2025, 6, 4, 23, 30)), '2025-07-04');
});

test('startOfWeek respects the configured first day', () => {
  assert.equal(startOfWeek('2025-08-07', 1), '2025-08-04');
  assert.equal(startOfWeek('2025-08-07', 0), '2025-08-03');
});

test('month helpers land on the first of the month', () => {
  assert.equal(startOfMonth('2025-08-17'), '2025-08-01');
  assert.equal(addMonths('2025-08-17', 1), '2025-09-01');
  assert.equal(addMonths('2025-12-31', 1), '2026-01-01');
  assert.equal(addMonths('2025-01-15', -1), '2024-12-01');
});

/* ------------------------------------------------------- day rollover time */

test('a late night belongs to the previous day when the rollover is set', () => {
  const oneThirtyAm = new Date(2025, 7, 12, 1, 30);
  assert.equal(todayKey(0, oneThirtyAm), '2025-08-12', 'midnight rollover: already tomorrow');
  assert.equal(todayKey(3, oneThirtyAm), '2025-08-11', '3am rollover: still last night');
});

test('the rollover only shifts the hours before it', () => {
  assert.equal(todayKey(3, new Date(2025, 7, 12, 3, 30)), '2025-08-12', 'past the boundary');
  assert.equal(todayKey(3, new Date(2025, 7, 12, 22, 0)), '2025-08-12', 'evening is unaffected');
  assert.equal(todayKey(3, new Date(2025, 7, 12, 2, 59)), '2025-08-11', 'one minute before');
});

/* --------------------------------------------------------- check tracking */

test('daily streak counts consecutive days up to today', () => {
  const s = statsFor(habit(), checks('2025-01-01', '2025-01-02', '2025-01-03'), 1, '2025-01-03');
  assert.equal(s.current.count, 3);
  assert.equal(s.current.unit, 'day');
  assert.equal(s.longest.count, 3);
  assert.equal(s.rate, 1);
});

test('an unfinished today does not break the streak yet', () => {
  const s = statsFor(habit(), checks('2025-01-01', '2025-01-02'), 1, '2025-01-03');
  assert.equal(s.current.count, 2);
  assert.equal(s.rate, 1, 'today stays out of the denominator until finished');
});

test('a missed day in the past does break the streak', () => {
  const s = statsFor(habit(), checks('2025-01-01', '2025-01-02'), 1, '2025-01-04');
  assert.equal(s.current.count, 0);
  assert.equal(s.longest.count, 2);
  assert.equal(s.rate, 2 / 3);
});

test('weekday habits skip unscheduled days without breaking', () => {
  const h = habit({ schedule: { kind: 'weekdays', days: [1, 3, 5] }, createdAt: '2025-08-04' });
  const s = statsFor(h, checks('2025-08-04', '2025-08-06', '2025-08-08', '2025-08-11'), 1, '2025-08-11');
  assert.equal(s.current.count, 4);
  assert.equal(s.rate, 1);
});

/* -------------------------------------------------------- count tracking */

test('a count habit is only done once it reaches its target', () => {
  const h = habit({ tracking: { kind: 'count', target: 8 } });
  const days: Days = { '2025-01-01': 8, '2025-01-02': 5, '2025-01-03': 8 };

  assert.deepEqual(progressOn(h, days, '2025-01-01'), { value: 8, target: 8, raw: 8, done: true });
  assert.equal(progressOn(h, days, '2025-01-02').done, false, '5 of 8 is not done');

  const s = statsFor(h, days, 1, '2025-01-03');
  assert.equal(s.current.count, 1, 'the short day broke the streak');
  assert.equal(s.longest.count, 1);
  assert.equal(s.daysDone, 2);
  assert.equal(s.rate, 2 / 3);
});

test('a partial day reads as partial, not missed', () => {
  const h = habit({ tracking: { kind: 'count', target: 8 } });
  const days: Days = { '2025-01-02': 3 };
  assert.equal(dayStatus(h, days, '2025-01-02', '2025-01-05'), 'partial');
  assert.equal(dayStatus(h, days, '2025-01-03', '2025-01-05'), 'missed', 'nothing logged');
});

test('overshooting a count still counts once', () => {
  const h = habit({ tracking: { kind: 'count', target: 3 } });
  const s = statsFor(h, { '2025-01-01': 9 }, 1, '2025-01-01');
  assert.equal(s.current.count, 1);
  assert.equal(s.rate, 1);
});

/* ------------------------------------------------------- amount tracking */

test('an amount habit tracks fractional progress and totals it', () => {
  const h = habit({ tracking: { kind: 'amount', target: 5, unit: 'km', step: 0.5 } });
  const days: Days = { '2025-01-01': 5, '2025-01-02': 3.2, '2025-01-03': 7.5 };

  assert.equal(progressOn(h, days, '2025-01-02').done, false, '3.2 of 5 km');
  assert.equal(progressOn(h, days, '2025-01-03').done, true, 'over the target');

  const s = statsFor(h, days, 1, '2025-01-03');
  assert.equal(s.daysDone, 2);
  assert.equal(s.amountTotal, 15.7, 'every km logged, including the short day');
  assert.equal(s.current.count, 1);
});

test('amount totals stay zero for other tracking kinds', () => {
  const s = statsFor(habit(), checks('2025-01-01'), 1, '2025-01-01');
  assert.equal(s.amountTotal, 0);
});

/* -------------------------------------------------------- slots tracking */

test('slot bitmasks round-trip', () => {
  let v = 0;
  v = withSlotToggled(v, 0);
  v = withSlotToggled(v, 2);
  assert.equal(slotDone(v, 0), true);
  assert.equal(slotDone(v, 1), false);
  assert.equal(slotDone(v, 2), true);
  assert.equal(slotsFinished(v, 3), 2);
  v = withSlotToggled(v, 0);
  assert.equal(slotDone(v, 0), false, 'toggling again clears it');
  assert.equal(slotsFinished(v, 3), 1);
});

test('a slots habit needs every slot to count as done', () => {
  const h = habit({ tracking: { kind: 'slots', slots: ['Morning', 'Evening'] } });
  const onlyMorning = 0b01;
  const both = 0b11;
  const days: Days = { '2025-01-01': both, '2025-01-02': onlyMorning, '2025-01-03': both };

  assert.equal(progressOn(h, days, '2025-01-01').done, true);
  assert.deepEqual(
    { ...progressOn(h, days, '2025-01-02'), raw: undefined },
    { value: 1, target: 2, raw: undefined, done: false },
  );
  assert.equal(dayStatus(h, days, '2025-01-02', '2025-01-05'), 'partial');

  const s = statsFor(h, days, 1, '2025-01-03');
  assert.equal(s.current.count, 1, 'the half day broke it');
  assert.equal(s.daysDone, 2);
});

/* ----------------------------------------------------------- everyNDays */

test('every N days is anchored to the start date', () => {
  const h = habit({ schedule: { kind: 'everyNDays', n: 3 }, createdAt: '2025-01-01' });
  // Due on the 1st, 4th, 7th, 10th…
  assert.equal(dayStatus(h, {}, '2025-01-02', '2025-01-10'), 'off');
  assert.equal(dayStatus(h, {}, '2025-01-03', '2025-01-10'), 'off');
  assert.equal(dayStatus(h, {}, '2025-01-04', '2025-01-10'), 'missed');

  const s = statsFor(h, checks('2025-01-01', '2025-01-04', '2025-01-07', '2025-01-10'), 1, '2025-01-10');
  assert.equal(s.current.count, 4, 'the gaps in between are not misses');
  assert.equal(s.rate, 1);
});

test('every N days breaks when a due day is skipped', () => {
  const h = habit({ schedule: { kind: 'everyNDays', n: 3 }, createdAt: '2025-01-01' });
  const s = statsFor(h, checks('2025-01-01', '2025-01-07', '2025-01-10'), 1, '2025-01-10');
  assert.equal(s.current.count, 2, 'the 4th was missed');
  assert.equal(s.rate, 3 / 4);
});

/* --------------------------------------------------------- timesPerMonth */

test('a times-per-month habit streaks in months', () => {
  const h = habit({ schedule: { kind: 'timesPerMonth', times: 2 }, createdAt: '2025-01-01' });
  const s = statsFor(
    h,
    checks('2025-01-05', '2025-01-20', '2025-02-03', '2025-02-14'),
    1,
    '2025-02-28',
  );
  assert.equal(s.current.count, 2);
  assert.equal(s.current.unit, 'month');
  assert.equal(s.rate, 1);
});

test('an unfinished current month does not break a monthly streak', () => {
  const h = habit({ schedule: { kind: 'timesPerMonth', times: 4 }, createdAt: '2025-01-01' });
  const s = statsFor(
    h,
    checks('2025-01-05', '2025-01-12', '2025-01-19', '2025-01-26', '2025-02-02'),
    1,
    '2025-02-03',
  );
  assert.equal(s.current.count, 1, 'January stands; February is still running');
  assert.equal(s.rate, 1, 'the open month is not judged');
});

test('a finished month below quota breaks the streak', () => {
  const h = habit({ schedule: { kind: 'timesPerMonth', times: 3 }, createdAt: '2025-01-01' });
  const s = statsFor(h, checks('2025-01-05', '2025-01-12', '2025-01-19', '2025-02-02'), 1, '2025-03-04');
  assert.equal(s.current.count, 0);
  assert.equal(s.longest.count, 1);
  assert.equal(s.rate, 4 / 6, 'Jan 3/3 and Feb 1/3');
});

test('periodProgress reports the right window', () => {
  const weekly = habit({ schedule: { kind: 'timesPerWeek', times: 3 }, createdAt: '2025-08-04' });
  const monthly = habit({ schedule: { kind: 'timesPerMonth', times: 5 }, createdAt: '2025-08-01' });
  const d = checks('2025-08-04', '2025-08-06', '2025-08-11');

  assert.deepEqual(periodProgress(weekly, d, '2025-08-08', 1), { count: 2, quota: 3, unit: 'week' });
  assert.deepEqual(periodProgress(monthly, d, '2025-08-20', 1), { count: 3, quota: 5, unit: 'month' });
  assert.deepEqual(periodProgress(habit(), d, '2025-08-08', 1), { count: 0, quota: 0, unit: 'day' });
});

test('per-period habits combine with count tracking', () => {
  // Gym 3× a week, and a session only counts at 30 minutes.
  const h = habit({
    schedule: { kind: 'timesPerWeek', times: 3 },
    tracking: { kind: 'amount', target: 30, unit: 'min', step: 5 },
    createdAt: '2025-08-04',
  });
  const days: Days = { '2025-08-04': 45, '2025-08-06': 10, '2025-08-08': 30 };
  assert.deepEqual(periodProgress(h, days, '2025-08-08', 1), { count: 2, quota: 3, unit: 'week' },
    'the 10-minute session does not count towards the weekly quota');
  assert.equal(statsFor(h, days, 1, '2025-08-10').amountTotal, 85);
});

/* --------------------------------------------- changing how a day is kept */

test('a stored number only survives when it still means the same thing', () => {
  const count4 = habit({ tracking: { kind: 'count', target: 4 } });
  const count8 = habit({ tracking: { kind: 'count', target: 8 } });
  const twoSlots = habit({ tracking: { kind: 'slots', slots: ['a', 'b'] } });
  const threeSlots = habit({ tracking: { kind: 'slots', slots: ['a', 'b', 'c'] } });

  assert.equal(trackingMatches(count4.tracking, count8.tracking), true, 'only the target moved');
  assert.equal(trackingMatches(count4.tracking, twoSlots.tracking), false, 'different kind');
  assert.equal(
    trackingMatches(twoSlots.tracking, threeSlots.tracking),
    false,
    'a new slot shifts what the bits mean',
  );
});

test('switching tracking mode keeps finished days and drops partial ones', () => {
  // Exactly the case that used to corrupt data: a count of 4 read as a bitmask
  // is 0b100, which names a third slot that does not exist.
  const before = habit({ tracking: { kind: 'count', target: 4 } });
  const after = habit({ tracking: { kind: 'slots', slots: ['Morning', 'Evening'] } });
  const days: Days = { '2025-01-01': 4, '2025-01-02': 2, '2025-01-03': 4 };

  const moved = remapDays(before, after, days);
  // Checked before deepEqual, which narrows `moved` to the literal it matched.
  assert.equal(moved['2025-01-02'], undefined, 'the 2-of-4 day had no honest translation');
  assert.deepEqual(moved, { '2025-01-01': 0b11, '2025-01-03': 0b11 });

  // And the streak that mattered is intact under the new rules.
  assert.equal(statsFor(after, moved, 1, '2025-01-03').daysDone, 2);
  assert.equal(progressOn(after, moved, '2025-01-01').done, true);
});

test('converting to an amount habit fills finished days to the new target', () => {
  const before = habit({ tracking: { kind: 'check' } });
  const after = habit({ tracking: { kind: 'amount', target: 5, unit: 'km', step: 1 } });
  const moved = remapDays(before, after, checks('2025-01-01', '2025-01-02'));
  assert.deepEqual(moved, { '2025-01-01': 5, '2025-01-02': 5 });
  assert.equal(statsFor(after, moved, 1, '2025-01-02').current.count, 2, 'the streak survives');
});

test('raising a count target leaves old days intact but no longer finished', () => {
  const before = habit({ tracking: { kind: 'count', target: 4 } });
  const after = habit({ tracking: { kind: 'count', target: 8 } });
  const days: Days = { '2025-01-01': 4 };
  assert.equal(trackingMatches(before.tracking, after.tracking), true, 'no conversion needed');
  assert.equal(progressOn(before, days, '2025-01-01').done, true);
  assert.equal(progressOn(after, days, '2025-01-01').done, false, '4 of 8 now');
});

test('slot values ignore bits beyond the slots that exist', () => {
  const h = habit({ tracking: { kind: 'slots', slots: ['a', 'b'] } });
  assert.equal(slotsFinished(0b111, 2), 2, 'the stray third bit is not counted');
  assert.equal(progressOn(h, { '2025-01-01': 0b100 }, '2025-01-01').value, 0);
});

/* -------------------------------------------------------------- archiving */

test('archived habits stop accruing misses', () => {
  const h = habit({ archivedAt: '2025-01-03' });
  const s = statsFor(h, checks('2025-01-01', '2025-01-02', '2025-01-03'), 1, '2025-01-31');
  assert.equal(s.current.count, 3);
  assert.equal(s.rate, 1);
});

test('dayStatus classifies each kind of day', () => {
  const h = habit({ createdAt: '2025-01-02' });
  const d = checks('2025-01-02');
  assert.equal(dayStatus(h, d, '2025-01-01', '2025-01-05'), 'inactive');
  assert.equal(dayStatus(h, d, '2025-01-02', '2025-01-05'), 'done');
  assert.equal(dayStatus(h, d, '2025-01-03', '2025-01-05'), 'missed');
  assert.equal(dayStatus(h, d, '2025-01-05', '2025-01-05'), 'pending');
  assert.equal(dayStatus(h, d, '2025-01-06', '2025-01-05'), 'future');
});

/* ------------------------------------------------------------ descriptions */

test('descriptions read naturally', () => {
  assert.equal(describeSchedule({ kind: 'daily' }), 'Every day');
  assert.equal(describeSchedule({ kind: 'weekdays', days: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(describeSchedule({ kind: 'weekdays', days: [0, 6] }), 'Weekends');
  assert.equal(describeSchedule({ kind: 'everyNDays', n: 3 }), 'Every 3 days');
  assert.equal(describeSchedule({ kind: 'timesPerWeek', times: 4 }), '4× a week');
  assert.equal(describeSchedule({ kind: 'timesPerMonth', times: 1 }), 'Once a month');

  assert.equal(describeTracking({ kind: 'check' }), '');
  assert.equal(describeTracking({ kind: 'count', target: 8 }), '8× a day');
  assert.equal(describeTracking({ kind: 'amount', target: 5, unit: 'km', step: 1 }), '5 km');
  assert.equal(describeTracking({ kind: 'slots', slots: ['AM', 'PM'] }), 'AM, PM');
});

test('friendlyDate names the nearby days', () => {
  assert.equal(friendlyDate('2025-08-10', '2025-08-10'), 'Today');
  assert.equal(friendlyDate('2025-08-09', '2025-08-10'), 'Yesterday');
  assert.equal(friendlyDate('2025-08-04', '2025-08-10'), 'Mon, Aug 4');
});

/* ---------------------------------------------------------------- storage */

function state(over: Partial<AppState> = {}): AppState {
  return { habits: [habit()], entries: { h1: { '2025-01-01': 1 } }, weekStart: 1, dayStartHour: 0, ...over };
}

test('state survives a save/load round trip', () => {
  const s = state({
    habits: [habit({ tracking: { kind: 'amount', target: 5, unit: 'km', step: 0.5 }, tags: ['health'] })],
    entries: { h1: { '2025-01-02': 3.2, '2025-01-01': 5 } },
    dayStartHour: 3,
  });
  const back = parseState(serializeState(s));
  assert.deepEqual(back.habits[0].tracking, { kind: 'amount', target: 5, unit: 'km', step: 0.5 });
  assert.deepEqual(back.habits[0].tags, ['health']);
  assert.deepEqual(back.entries.h1, { '2025-01-01': 5, '2025-01-02': 3.2 });
  assert.equal(back.dayStartHour, 3);
});

test('a schema 1 backup still loads, with every check-in intact', () => {
  const old = JSON.stringify({
    schema: 1,
    habits: [
      { id: 'a', name: 'Run', emoji: '🏃', color: '#f97362', schedule: { kind: 'daily' }, createdAt: '2025-01-01', archivedAt: null },
    ],
    completions: { a: ['2025-01-01', '2025-01-02'] },
    weekStart: 1,
  });
  const s = parseState(old);
  assert.equal(s.habits.length, 1);
  assert.deepEqual(s.habits[0].tracking, { kind: 'check' }, 'old habits become plain checks');
  assert.deepEqual(s.habits[0].tags, []);
  assert.deepEqual(s.entries.a, { '2025-01-01': 1, '2025-01-02': 1 });
  assert.equal(s.dayStartHour, 0);
  // And the migrated data still reads as a real streak.
  assert.equal(statsFor(s.habits[0], s.entries.a, 1, '2025-01-02').current.count, 2);
});

test('corrupt storage degrades to an empty app instead of crashing', () => {
  assert.deepEqual(parseState(null).habits, []);
  assert.deepEqual(parseState('not json').habits, []);
  assert.deepEqual(parseState('"a string"').habits, []);
  assert.deepEqual(parseState('{"habits":"nope"}').habits, []);
});

test('malformed habit fields are repaired, not fatal', () => {
  const raw = JSON.stringify({
    schema: 2,
    habits: [
      { id: 'a', name: 'Ok', schedule: { kind: 'weekdays', days: [1, 9, 'x', 1] } },
      { id: 'b', schedule: { kind: 'timesPerMonth', times: 999 }, tracking: { kind: 'count', target: -4 } },
      { id: 'c', schedule: { kind: 'weekdays', days: [] }, tracking: { kind: 'slots', slots: [] } },
      { id: 'd', tracking: { kind: 'amount', target: 0, unit: '   ' }, tags: ['a', 'a', '  ', 'b'] },
      { nope: true },
    ],
    entries: {
      a: { '2025-01-01': 2, garbage: 5, '2025-01-02': 0, '2025-01-03': 'x' },
      ghost: { '2025-01-01': 1 },
    },
    dayStartHour: 99,
  });
  const s = parseState(raw);
  assert.deepEqual(s.habits.map((h) => h.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(s.habits[0].schedule, { kind: 'weekdays', days: [1] });
  assert.deepEqual(s.habits[1].schedule, { kind: 'timesPerMonth', times: 31 }, 'clamped');
  assert.deepEqual(s.habits[1].tracking, { kind: 'count', target: 1 }, 'clamped to at least 1');
  assert.deepEqual(s.habits[2].schedule, { kind: 'daily' }, 'empty weekday list is unusable');
  assert.deepEqual(s.habits[2].tracking, { kind: 'check' }, 'a slots habit needs slots');
  assert.equal(s.habits[3].tracking.kind, 'amount');
  assert.deepEqual(s.habits[3].tags, ['a', 'b'], 'deduped and trimmed');
  assert.deepEqual(s.entries.a, { '2025-01-01': 2 }, 'non-dates and non-positives dropped');
  assert.equal(s.entries.ghost, undefined, 'orphaned history dropped');
  assert.equal(s.dayStartHour, 11, 'rollover clamped to a sane hour');
});

test('csv export lists one row per logged day', () => {
  const s = state({
    habits: [habit({ name: 'Run "fast"', tracking: { kind: 'amount', target: 5, unit: 'km', step: 1 } })],
    entries: { h1: { '2025-01-01': 5, '2025-01-02': 3 } },
  });
  const lines = toCsv(s).split('\n');
  assert.equal(lines[0], '"habit","date","value","target","unit","done"');
  assert.equal(lines[1], '"Run ""fast""","2025-01-01","5","5","km","yes"', 'quotes escaped');
  assert.equal(lines[2], '"Run ""fast""","2025-01-02","3","5","km","no"');
});
