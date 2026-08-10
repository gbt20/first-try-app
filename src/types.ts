/** A calendar day in the user's local timezone, formatted `YYYY-MM-DD`. */
export type DateKey = string;

/**
 * How often a habit is meant to happen.
 * - `daily`        — every single day
 * - `weekdays`     — only on the listed weekdays (0 = Sunday … 6 = Saturday)
 * - `timesPerWeek` — any N days within a week; no specific day is required
 */
export type Schedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'timesPerWeek'; times: number };

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  /** Index into `HABIT_COLORS`. */
  color: string;
  schedule: Schedule;
  /** Day the habit started counting; days before this are never "missed". */
  createdAt: DateKey;
  /** Set when archived — hidden from Today but history is kept. */
  archivedAt: DateKey | null;
}

/** First day of the week: 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

export interface AppState {
  habits: Habit[];
  /** habit id → the days it was completed. */
  completions: Record<string, Set<DateKey>>;
  weekStart: WeekStart;
}

/** What a single cell in a heatmap represents. */
export type DayStatus =
  | 'done' // completed
  | 'missed' // scheduled, in the past, not completed
  | 'off' // not scheduled (or an optional day for timesPerWeek)
  | 'pending' // scheduled today, still time left
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

export const EMOJI_CHOICES = [
  '✅','🏃','💪','📚','🧘','💧','🥗','😴','🦷','🚭',
  '✍️','🎸','🧹','💊','☀️','🌙','📵','🧠','💰','🚶',
] as const;
