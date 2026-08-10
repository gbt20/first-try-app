import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { todayKey } from './dates.ts';
import { fullValue, remapDays, targetOf, trackingMatches, withSlotToggled } from './habits.ts';
import { loadState, parseState, saveState, serializeState, toCsv } from './storage.ts';
import type { AppState, DateKey, Habit, WeekStart } from './types.ts';

export interface AppActions {
  /** Set a day outright. Zero clears it. */
  setValue: (habitId: string, day: DateKey, value: number) => void;
  /** Nudge a day up or down, never below zero. */
  bump: (habitId: string, day: DateKey, delta: number) => void;
  /** All-or-nothing: fill the day to its target, or clear it. */
  toggleDone: (habit: Habit, day: DateKey) => void;
  toggleSlot: (habit: Habit, day: DateKey, index: number) => void;
  saveHabit: (habit: Habit) => void;
  removeHabit: (habitId: string) => void;
  setArchived: (habitId: string, archived: boolean, today: DateKey) => void;
  moveHabit: (habitId: string, delta: number) => void;
  setWeekStart: (weekStart: WeekStart) => void;
  setDayStartHour: (hour: number) => void;
  replaceAll: (json: string) => boolean;
  exportJson: () => string;
  exportCsv: () => string;
  clearAll: () => void;
}

export function useAppState(): [AppState, AppActions] {
  const [state, setState] = useState<AppState>(() => loadState());

  // Lets the stable action callbacks read the latest state without being
  // rebuilt (and re-rendering every row) on each change.
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  const actions = useMemo<AppActions>(() => {
    /** Replace one day's value, dropping the key entirely when it hits zero. */
    function writeDay(habitId: string, day: DateKey, next: number) {
      setState((prev) => {
        const days = { ...(prev.entries[habitId] ?? {}) };
        if (next > 0) days[day] = next;
        else delete days[day];
        return { ...prev, entries: { ...prev.entries, [habitId]: days } };
      });
    }

    return {
      setValue(habitId, day, value) {
        writeDay(habitId, day, Math.max(0, value));
      },

      bump(habitId, day, delta) {
        const current = latest.current.entries[habitId]?.[day] ?? 0;
        // Rounded because repeatedly adding a step like 0.1 drifts in binary
        // floating point, and "0.30000000000000004 km" is not a thing.
        writeDay(habitId, day, Math.max(0, Math.round((current + delta) * 1000) / 1000));
      },

      toggleDone(habit, day) {
        const current = latest.current.entries[habit.id]?.[day] ?? 0;
        const target = targetOf(habit.tracking);
        if (habit.tracking.kind === 'slots') {
          // Every slot on, or every slot off.
          const full = (1 << habit.tracking.slots.length) - 1;
          writeDay(habit.id, day, current === full ? 0 : full);
          return;
        }
        writeDay(habit.id, day, current >= target ? 0 : target);
      },

      toggleSlot(habit, day, index) {
        const current = latest.current.entries[habit.id]?.[day] ?? 0;
        // Masked so a value left over from a previous tracking mode cannot
        // leave a bit set for a slot that no longer exists.
        const mask = fullValue(habit.tracking);
        writeDay(habit.id, day, withSlotToggled(current & mask, index) & mask);
      },

      saveHabit(habit) {
        setState((prev) => {
          const before = prev.habits.find((h) => h.id === habit.id);
          const days = prev.entries[habit.id] ?? {};
          // A stored number means something different under a different
          // tracking mode, so history is converted rather than left to be
          // misread.
          const kept =
            before && !trackingMatches(before.tracking, habit.tracking)
              ? remapDays(before, habit, days)
              : days;
          return {
            ...prev,
            habits: before
              ? prev.habits.map((h) => (h.id === habit.id ? habit : h))
              : [...prev.habits, habit],
            entries: { ...prev.entries, [habit.id]: kept },
          };
        });
      },

      removeHabit(habitId) {
        setState((prev) => {
          const entries = { ...prev.entries };
          delete entries[habitId];
          return { ...prev, habits: prev.habits.filter((h) => h.id !== habitId), entries };
        });
      },

      setArchived(habitId, archived, today) {
        setState((prev) => ({
          ...prev,
          habits: prev.habits.map((h) =>
            h.id === habitId ? { ...h, archivedAt: archived ? today : null } : h,
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

      setDayStartHour(hour) {
        setState((prev) => ({ ...prev, dayStartHour: Math.min(11, Math.max(0, hour)) }));
      },

      replaceAll(json) {
        const next = parseState(json);
        // Refuse an import that parsed to nothing — almost always the wrong
        // file, and silently wiping real history would be unforgivable.
        if (next.habits.length === 0) return false;
        setState(next);
        return true;
      },

      exportJson: () => serializeState(latest.current),
      exportCsv: () => toCsv(latest.current),

      clearAll() {
        setState({ habits: [], entries: {}, weekStart: 1, dayStartHour: 0 });
      },
    };
  }, []);

  return [state, actions];
}

/**
 * Today's date, kept honest while the app is open. A phone PWA is usually
 * resumed rather than launched, so without this the header could still say
 * "Today" about yesterday — and the rollover hour means the switch can happen
 * at 3am rather than midnight.
 */
export function useToday(dayStartHour: number): DateKey {
  const [day, setDay] = useState(() => todayKey(dayStartHour));

  const refresh = useCallback(() => {
    setDay((prev) => {
      const now = todayKey(dayStartHour);
      return now === prev ? prev : now;
    });
  }, [dayStartHour]);

  useEffect(() => {
    refresh(); // the rollover setting may have just changed
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
