import { todayKey } from './dates.ts';
import { HABIT_COLORS, MAX_SLOTS } from './types.ts';
import type {
  AppState,
  DateKey,
  Entries,
  Habit,
  Schedule,
  Tracking,
  WeekStart,
} from './types.ts';

const KEY = 'habit-tracker/v1';
const SCHEMA = 2;

/**
 * On-disk shape.
 *
 * Schema 1 stored a plain list of completed days per habit, because a check-in
 * was a yes/no. Schema 2 stores a number per day so counts, amounts and slots
 * all fit; `parseState` still reads the old shape and lifts it forward.
 */
interface Persisted {
  schema: number;
  habits: Habit[];
  entries: Record<string, Record<DateKey, number>>;
  /** Schema 1 only. */
  completions?: Record<string, DateKey[]>;
  weekStart: WeekStart;
  dayStartHour: number;
}

export function emptyState(): AppState {
  return { habits: [], entries: {}, weekStart: 1, dayStartHour: 0 };
}

export function newId(): string {
  // `randomUUID` needs a secure context; file:// and plain http on a LAN
  // address are not, and this app is meant to survive both.
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newHabit(index = 0, today: DateKey): Habit {
  return {
    id: newId(),
    name: '',
    emoji: '✅',
    color: HABIT_COLORS[index % HABIT_COLORS.length],
    schedule: { kind: 'daily' },
    tracking: { kind: 'check' },
    tags: [],
    createdAt: today,
    archivedAt: null,
  };
}

function isDateKey(v: unknown): v is DateKey {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, Math.round(v)))
    : fallback;
}

function parseSchedule(raw: unknown): Schedule {
  const s = raw as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    if (s.kind === 'weekdays') {
      const days = Array.isArray(s.days)
        ? (s.days.filter((d) => typeof d === 'number' && d >= 0 && d <= 6) as number[])
        : [];
      // A weekday habit with no days can never come due; fall back to daily.
      if (days.length > 0) {
        return { kind: 'weekdays', days: [...new Set(days)].sort((a, b) => a - b) };
      }
    }
    if (s.kind === 'everyNDays') {
      return { kind: 'everyNDays', n: clampInt(s.n, 1, 365, 2) };
    }
    if (s.kind === 'timesPerWeek') {
      return { kind: 'timesPerWeek', times: clampInt(s.times, 1, 7, 3) };
    }
    if (s.kind === 'timesPerMonth') {
      return { kind: 'timesPerMonth', times: clampInt(s.times, 1, 31, 4) };
    }
  }
  return { kind: 'daily' };
}

function parseTracking(raw: unknown): Tracking {
  const t = raw as Record<string, unknown> | undefined;
  if (t && typeof t === 'object') {
    if (t.kind === 'count') {
      return { kind: 'count', target: clampInt(t.target, 1, 99, 2) };
    }
    if (t.kind === 'amount') {
      const target =
        typeof t.target === 'number' && Number.isFinite(t.target) && t.target > 0
          ? t.target
          : 1;
      const step =
        typeof t.step === 'number' && Number.isFinite(t.step) && t.step > 0 ? t.step : 1;
      const unit = typeof t.unit === 'string' && t.unit.trim() ? t.unit.trim() : 'units';
      return { kind: 'amount', target, unit: unit.slice(0, 12), step };
    }
    if (t.kind === 'slots') {
      const slots = Array.isArray(t.slots)
        ? t.slots
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 16))
            .slice(0, MAX_SLOTS)
        : [];
      if (slots.length > 0) return { kind: 'slots', slots };
    }
  }
  return { kind: 'check' };
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim().slice(0, 20));
  return [...new Set(tags)].slice(0, 8);
}

/**
 * Rebuild state from whatever is in storage, discarding anything malformed
 * rather than throwing. A half-readable save is better than a blank app.
 */
export function parseState(raw: string | null, today = todayKey()): AppState {
  if (!raw) return emptyState();

  let data: Partial<Persisted>;
  try {
    data = JSON.parse(raw) as Partial<Persisted>;
  } catch {
    return emptyState();
  }
  if (!data || typeof data !== 'object') return emptyState();

  const habits: Habit[] = (Array.isArray(data.habits) ? data.habits : [])
    .filter(
      (h): h is Habit => Boolean(h) && typeof h === 'object' && typeof h.id === 'string',
    )
    .map((h, i) => ({
      id: h.id,
      name: typeof h.name === 'string' ? h.name : 'Untitled',
      emoji: typeof h.emoji === 'string' && h.emoji ? h.emoji : '✅',
      color: typeof h.color === 'string' ? h.color : HABIT_COLORS[i % HABIT_COLORS.length],
      schedule: parseSchedule(h.schedule),
      tracking: parseTracking(h.tracking),
      tags: parseTags(h.tags),
      createdAt: isDateKey(h.createdAt) ? h.createdAt : today,
      archivedAt: isDateKey(h.archivedAt) ? h.archivedAt : null,
    }));

  const known = new Set(habits.map((h) => h.id));
  const entries: Entries = {};

  // Schema 2: day → value.
  for (const [id, days] of Object.entries(data.entries ?? {})) {
    if (!known.has(id) || !days || typeof days !== 'object') continue;
    const clean: Record<DateKey, number> = {};
    for (const [day, value] of Object.entries(days)) {
      if (!isDateKey(day)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
      clean[day] = value;
    }
    entries[id] = clean;
  }

  // Schema 1: a list of days that were done. Each becomes a value of 1, which
  // is exactly "finished" for the check habits that were the only kind then.
  for (const [id, days] of Object.entries(data.completions ?? {})) {
    if (!known.has(id) || !Array.isArray(days)) continue;
    const clean: Record<DateKey, number> = entries[id] ?? {};
    for (const day of days) if (isDateKey(day)) clean[day] ??= 1;
    entries[id] = clean;
  }

  for (const h of habits) entries[h.id] ??= {};

  return {
    habits,
    entries,
    weekStart: data.weekStart === 0 ? 0 : 1,
    dayStartHour: clampInt(data.dayStartHour, 0, 11, 0),
  };
}

export function serializeState(state: AppState): string {
  const entries: Record<string, Record<DateKey, number>> = {};
  for (const h of state.habits) {
    const days = state.entries[h.id];
    if (!days) continue;
    // Sorted so a backup file diffs cleanly and reads in date order.
    const sorted: Record<DateKey, number> = {};
    for (const day of Object.keys(days).sort()) {
      if (days[day] > 0) sorted[day] = days[day];
    }
    if (Object.keys(sorted).length > 0) entries[h.id] = sorted;
  }
  const payload: Persisted = {
    schema: SCHEMA,
    habits: state.habits,
    entries,
    weekStart: state.weekStart,
    dayStartHour: state.dayStartHour,
  };
  return JSON.stringify(payload);
}

/** A spreadsheet-friendly dump: one row per logged day. */
export function toCsv(state: AppState): string {
  const rows = [['habit', 'date', 'value', 'target', 'unit', 'done']];
  for (const h of state.habits) {
    const target =
      h.tracking.kind === 'count' || h.tracking.kind === 'amount'
        ? h.tracking.target
        : h.tracking.kind === 'slots'
          ? h.tracking.slots.length
          : 1;
    const unit = h.tracking.kind === 'amount' ? h.tracking.unit : '';
    for (const day of Object.keys(state.entries[h.id] ?? {}).sort()) {
      const value = state.entries[h.id][day];
      rows.push([h.name, day, String(value), String(target), unit, value >= target ? 'yes' : 'no']);
    }
  }
  return rows
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function loadState(today?: DateKey): AppState {
  try {
    return parseState(localStorage.getItem(KEY), today);
  } catch {
    // Safari in private mode can throw on access alone.
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, serializeState(state));
  } catch {
    // Out of quota or storage blocked — the session still works in memory.
  }
}
