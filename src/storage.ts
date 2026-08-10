import { todayKey } from './dates.ts';
import { HABIT_COLORS } from './types.ts';
import type { AppState, DateKey, Habit, Schedule, WeekStart } from './types.ts';

const KEY = 'habit-tracker/v1';
const SCHEMA = 1;

/** On-disk shape. Sets become sorted arrays so the JSON stays diff-friendly. */
interface Persisted {
  schema: number;
  habits: Habit[];
  completions: Record<string, DateKey[]>;
  weekStart: WeekStart;
}

export function emptyState(): AppState {
  return { habits: [], completions: {}, weekStart: 1 };
}

export function newId(): string {
  // `randomUUID` needs a secure context; file:// and plain http on a LAN
  // address are not, and this app is meant to survive both.
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newHabit(index = 0): Habit {
  return {
    id: newId(),
    name: '',
    emoji: '✅',
    color: HABIT_COLORS[index % HABIT_COLORS.length],
    schedule: { kind: 'daily' },
    createdAt: todayKey(),
    archivedAt: null,
  };
}

function isDateKey(v: unknown): v is DateKey {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function parseSchedule(raw: unknown): Schedule {
  const s = raw as Partial<Schedule> | undefined;
  if (s && typeof s === 'object') {
    if (s.kind === 'weekdays') {
      const days = Array.isArray((s as { days?: unknown }).days)
        ? ((s as { days: unknown[] }).days.filter(
            (d) => typeof d === 'number' && d >= 0 && d <= 6,
          ) as number[])
        : [];
      // A weekday habit with no days can never be done; fall back to daily.
      if (days.length > 0) return { kind: 'weekdays', days: [...new Set(days)].sort() };
    }
    if (s.kind === 'timesPerWeek') {
      const times = (s as { times?: unknown }).times;
      if (typeof times === 'number' && times >= 1) {
        return { kind: 'timesPerWeek', times: Math.min(7, Math.round(times)) };
      }
    }
  }
  return { kind: 'daily' };
}

/**
 * Rebuild state from whatever is in storage, discarding anything malformed
 * rather than throwing. A half-readable save is better than a blank app.
 */
export function parseState(raw: string | null): AppState {
  if (!raw) return emptyState();

  let data: Partial<Persisted>;
  try {
    data = JSON.parse(raw) as Partial<Persisted>;
  } catch {
    return emptyState();
  }
  if (!data || typeof data !== 'object') return emptyState();

  const habits: Habit[] = (Array.isArray(data.habits) ? data.habits : [])
    .filter((h): h is Habit => Boolean(h) && typeof h === 'object' && typeof h.id === 'string')
    .map((h, i) => ({
      id: h.id,
      name: typeof h.name === 'string' ? h.name : 'Untitled',
      emoji: typeof h.emoji === 'string' && h.emoji ? h.emoji : '✅',
      color: typeof h.color === 'string' ? h.color : HABIT_COLORS[i % HABIT_COLORS.length],
      schedule: parseSchedule(h.schedule),
      createdAt: isDateKey(h.createdAt) ? h.createdAt : todayKey(),
      archivedAt: isDateKey(h.archivedAt) ? h.archivedAt : null,
    }));

  const known = new Set(habits.map((h) => h.id));
  const completions: Record<string, Set<DateKey>> = {};
  const rawCompletions = data.completions ?? {};
  for (const id of Object.keys(rawCompletions)) {
    if (!known.has(id)) continue; // drop history for habits that no longer exist
    const days = rawCompletions[id];
    completions[id] = new Set(Array.isArray(days) ? days.filter(isDateKey) : []);
  }
  for (const h of habits) completions[h.id] ??= new Set();

  return {
    habits,
    completions,
    weekStart: data.weekStart === 0 ? 0 : 1,
  };
}

export function serializeState(state: AppState): string {
  const completions: Record<string, DateKey[]> = {};
  for (const h of state.habits) {
    const days = state.completions[h.id];
    if (days && days.size > 0) completions[h.id] = [...days].sort();
  }
  const payload: Persisted = {
    schema: SCHEMA,
    habits: state.habits,
    completions,
    weekStart: state.weekStart,
  };
  return JSON.stringify(payload);
}

export function loadState(): AppState {
  try {
    return parseState(localStorage.getItem(KEY));
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
