import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { todayKey } from './dates.ts';
import { loadState, parseState, saveState, serializeState } from './storage.ts';
import type { AppState, DateKey, Habit, WeekStart } from './types.ts';

export interface AppActions {
  toggle: (habitId: string, day: DateKey) => void;
  saveHabit: (habit: Habit) => void;
  removeHabit: (habitId: string) => void;
  setArchived: (habitId: string, archived: boolean) => void;
  moveHabit: (habitId: string, delta: number) => void;
  setWeekStart: (weekStart: WeekStart) => void;
  replaceAll: (json: string) => boolean;
  exportJson: () => string;
  clearAll: () => void;
}

export function useAppState(): [AppState, AppActions] {
  const [state, setState] = useState<AppState>(loadState);

  // Lets the stable action callbacks read the latest state without being
  // rebuilt (and re-rendering every row) on each change.
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  const actions = useMemo<AppActions>(
    () => ({
      toggle(habitId, day) {
        setState((prev) => {
          const current = prev.completions[habitId] ?? new Set<DateKey>();
          const next = new Set(current);
          if (next.has(day)) next.delete(day);
          else next.add(day);
          return { ...prev, completions: { ...prev.completions, [habitId]: next } };
        });
      },

      saveHabit(habit) {
        setState((prev) => {
          const exists = prev.habits.some((h) => h.id === habit.id);
          return {
            ...prev,
            habits: exists
              ? prev.habits.map((h) => (h.id === habit.id ? habit : h))
              : [...prev.habits, habit],
            completions: { ...prev.completions, [habit.id]: prev.completions[habit.id] ?? new Set() },
          };
        });
      },

      removeHabit(habitId) {
        setState((prev) => {
          const completions = { ...prev.completions };
          delete completions[habitId];
          return { ...prev, habits: prev.habits.filter((h) => h.id !== habitId), completions };
        });
      },

      setArchived(habitId, archived) {
        setState((prev) => ({
          ...prev,
          habits: prev.habits.map((h) =>
            h.id === habitId ? { ...h, archivedAt: archived ? todayKey() : null } : h,
          ),
        }));
      },

      moveHabit(habitId, delta) {
        setState((prev) => {
          const from = prev.habits.findIndex((h) => h.id === habitId);
          const to = from + delta;
          if (from < 0 || to < 0 || to >= prev.habits.length) return prev;
          const habits = [...prev.habits];
          const [moved] = habits.splice(from, 1);
          habits.splice(to, 0, moved);
          return { ...prev, habits };
        });
      },

      setWeekStart(weekStart) {
        setState((prev) => ({ ...prev, weekStart }));
      },

      replaceAll(json) {
        const next = parseState(json);
        // Refuse an import that parsed to nothing — almost always the wrong
        // file, and silently wiping real history would be unforgivable.
        if (next.habits.length === 0) return false;
        setState(next);
        return true;
      },

      exportJson() {
        return serializeState(latest.current);
      },

      clearAll() {
        setState({ habits: [], completions: {}, weekStart: 1 });
      },
    }),
    [],
  );

  return [state, actions];
}

/**
 * Today's date, kept honest while the app is open. A phone PWA is usually
 * resumed rather than launched, so without this the header could still say
 * "Today" about yesterday.
 */
export function useToday(): DateKey {
  const [day, setDay] = useState(todayKey);

  const refresh = useCallback(() => setDay((prev) => {
    const now = todayKey();
    return now === prev ? prev : now;
  }), []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return day;
}
