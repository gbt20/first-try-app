/** A calendar day in the user's local timezone, formatted `YYYY-MM-DD`. */
export type DateKey = string;

/**
 * How often a habit comes due.
 * - `daily`         — every single day
 * - `weekdays`      — only on the listed weekdays (0 = Sunday … 6 = Saturday)
 * - `everyNDays`    — every N days, counting from the habit's start
 * - `timesPerWeek`  — any N days within a week; no specific day is required
 * - `timesPerMonth` — any N days within a calendar month
 */
export type Schedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'everyNDays'; n: number }
  | { kind: 'timesPerWeek'; times: number }
  | { kind: 'timesPerMonth'; times: number };

/**
 * What finishing a habit *for one day* means.
 * - `check`  — a single yes/no
 * - `count`  — do it N times ("drink water 8×")
 * - `amount` — reach a measured total ("run 5 km", "read 30 pages")
 * - `slots`  — tick off each named occasion ("morning", "evening")
 */
export type Tracking =
  | { kind: 'check' }
  | { kind: 'count'; target: number }
  | { kind: 'amount'; target: number; unit: string; step: number }
  | { kind: 'slots'; slots: string[] };

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  /** Any CSS colour; `HABIT_COLORS` are just the presets. */
  color: string;
  schedule: Schedule;
  tracking: Tracking;
  tags: string[];
  /** Day the habit started counting; days before this are never "missed". */
  createdAt: DateKey;
  /** Set when archived — hidden from Today but history is kept. */
  archivedAt: DateKey | null;
}

/** First day of the week: 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

/**
 * One day's progress, as a single number so every tracking mode shares the
 * same storage and the same streak maths:
 * - `check`  — 0 or 1
 * - `count`  — how many times
 * - `amount` — how much (may be fractional)
 * - `slots`  — a bitmask of finished slots, bit *i* for `slots[i]`
 */
export type DayValue = number;

/** habit id → day → that day's value. Days with no progress are absent. */
export type Entries = Record<string, Record<DateKey, DayValue>>;

export interface AppState {
  habits: Habit[];
  entries: Entries;
  weekStart: WeekStart;
  /**
   * The hour a new day begins, 0–11. At 3, anything logged before 3am counts
   * towards the previous day — which is how people actually think about a
   * late night.
   */
  dayStartHour: number;
}

/** What a single cell in a heatmap represents. */
export type DayStatus =
  | 'done' // target reached
  | 'partial' // some progress, but short of the target
  | 'missed' // due, in the past, nothing logged
  | 'off' // not scheduled (or an optional day for per-period habits)
  | 'pending' // due today, still time left
  | 'inactive' // before the habit started, or after it was archived
  | 'future';

export const HABIT_COLORS = [
  '#f97362', // coral
  '#f5a524', // amber
  '#4ec9a5', // mint
  '#4aa8f0', // sky
  '#8b7bf0', // violet
  '#ec6bb0', // pink
  '#7ab84a', // green
  '#54c7d8', // cyan
] as const;

/** Shortcuts in the icon picker; any emoji can be typed instead. */
export const EMOJI_CHOICES = [
  '✅','🏃','💪','📚','🧘','💧','🥗','😴','🦷','🚭',
  '✍️','🎸','🧹','💊','☀️','🌙','📵','🧠','💰','🚶',
] as const;

/** Offered in the unit field; anything else can be typed. */
export const UNIT_SUGGESTIONS = [
  'min','hr','km','mi','steps','pages','reps','sets','glasses','g','kcal',
] as const;

export const MAX_SLOTS = 6;
