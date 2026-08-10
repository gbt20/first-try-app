import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { addDays, friendlyDate, monthName, fromKey, startOfWeek, WEEKDAY_INITIAL } from '../dates.ts';
import { dayStatus } from '../habits.ts';
import type { Done } from '../habits.ts';
import type { DateKey, Habit, WeekStart } from '../types.ts';

interface Props {
  habit: Habit;
  done: Done;
  today: DateKey;
  weekStart: WeekStart;
  /** How many week-columns to draw. */
  weeks?: number;
  showLabels?: boolean;
  onSelectDay?: (day: DateKey) => void;
}

/**
 * A GitHub-style grid: one column per week, one row per weekday, oldest at the
 * left. Rendered as a plain CSS grid so it stays crisp at any zoom.
 */
export function Heatmap({
  habit,
  done,
  today,
  weekStart,
  weeks = 18,
  showLabels = true,
  onSelectDay,
}: Props) {
  const columns = useMemo(() => {
    const firstColumn = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1));
    return Array.from({ length: weeks }, (_, w) => {
      const weekOf = addDays(firstColumn, w * 7);
      return {
        weekOf,
        days: Array.from({ length: 7 }, (_, d) => addDays(weekOf, d)),
      };
    });
  }, [today, weekStart, weeks]);

  // A month label sits above the first column that starts a new month.
  const monthLabels = useMemo(() => {
    let last = -1;
    return columns.map(({ weekOf }) => {
      const month = fromKey(weekOf).getMonth();
      if (month === last) return '';
      last = month;
      return monthName(month);
    });
  }, [columns]);

  return (
    <div className="heatmap" style={{ ['--habit-color' as string]: habit.color }}>
      {showLabels && (
        <div className="heatmap-weekdays" aria-hidden="true">
          {Array.from({ length: 7 }, (_, d) => (
            // Only alternate rows are labelled — all seven would not fit.
            <span key={d}>{d % 2 === 1 ? WEEKDAY_INITIAL[(d + weekStart) % 7] : ''}</span>
          ))}
        </div>
      )}
      <div className="heatmap-body">
        {showLabels && (
          <div className="heatmap-months" aria-hidden="true">
            {monthLabels.map((label, i) => (
              <span key={columns[i].weekOf}>{label}</span>
            ))}
          </div>
        )}
        <div className="heatmap-grid">
          {columns.map(({ weekOf, days }) => (
            <div className="heatmap-week" key={weekOf}>
              {days.map((day) => {
                const status = dayStatus(habit, done, day, today);
                const label = `${friendlyDate(day, today)} — ${STATUS_LABEL[status]}`;
                return onSelectDay && status !== 'future' && status !== 'inactive' ? (
                  <button
                    key={day}
                    type="button"
                    className={`cell cell-${status}`}
                    title={label}
                    aria-label={label}
                    onClick={() => onSelectDay(day)}
                  />
                ) : (
                  <span key={day} className={`cell cell-${status}`} title={label} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal scroller pinned to the most recent week. Scrolling is set
 * imperatively rather than with `direction: rtl`, which would also shove a
 * heatmap that happens to fit over to the right-hand edge.
 */
export function HeatmapScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div className="heatmap-scroll" ref={ref}>
      {children}
    </div>
  );
}

/** Key for the colours in a heatmap, matched to what that habit can show. */
export function HeatmapLegend({ habit }: { habit: Habit }) {
  // No single day is required by a "N times a week" habit, so it can never
  // show a missed day and saying otherwise would be confusing.
  const canMiss = habit.schedule.kind !== 'timesPerWeek';
  return (
    <div className="legend" style={{ ['--habit-color' as string]: habit.color }}>
      <span className="cell cell-off" /> {canMiss ? 'not scheduled' : 'not done'}
      {canMiss && (
        <>
          <span className="cell cell-missed" /> missed
        </>
      )}
      <span className="cell cell-done" /> done
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  done: 'done',
  missed: 'missed',
  off: 'not scheduled',
  pending: 'not yet done',
  inactive: 'before this habit started',
  future: 'upcoming',
};
