import { useState } from 'react';

import { friendlyDate } from '../dates.ts';
import { describeSchedule, formatRate, statsFor, weekProgress } from '../habits.ts';
import type { Done } from '../habits.ts';
import type { DateKey, Habit, WeekStart } from '../types.ts';
import { Heatmap, HeatmapLegend, HeatmapScroll } from './Heatmap.tsx';
import { Sheet } from './Sheet.tsx';

interface Props {
  habit: Habit;
  done: Done;
  today: DateKey;
  weekStart: WeekStart;
  onClose: () => void;
  onEdit: () => void;
  onToggleDay: (day: DateKey) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}

export function HabitDetail({
  habit,
  done,
  today,
  weekStart,
  onClose,
  onEdit,
  onToggleDay,
  onArchive,
  onDelete,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stats = statsFor(habit, done, weekStart, today);
  const week = weekProgress(habit, done, today, weekStart);

  return (
    <Sheet
      title={habit.name}
      onClose={onClose}
      closeLabel="Back"
      action={
        <button type="button" className="text-button" onClick={onEdit}>
          Edit
        </button>
      }
    >
      <div className="detail-hero" style={{ ['--habit-color' as string]: habit.color }}>
        <span className="detail-emoji" style={{ background: habit.color }}>
          {habit.emoji}
        </span>
        <div>
          <h3>{habit.name}</h3>
          <p className="muted">
            {describeSchedule(habit.schedule)}
            {habit.archivedAt && ` · archived ${friendlyDate(habit.archivedAt, today).toLowerCase()}`}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat
          value={String(stats.current.count)}
          unit={stats.current.unit === 'week' ? 'week streak' : 'day streak'}
          highlight
        />
        <Stat value={String(stats.longest.count)} unit={`best ${stats.longest.unit}s`} />
        <Stat value={formatRate(stats.rate)} unit="completed" />
        <Stat value={String(stats.total)} unit="check-ins" />
      </div>

      {habit.schedule.kind === 'timesPerWeek' && (
        <div className="card">
          <div className="row-between">
            <span>This week</span>
            <strong>
              {week.count} of {week.target}
            </strong>
          </div>
          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, (week.count / Math.max(1, week.target)) * 100)}%`,
                background: habit.color,
              }}
            />
          </div>
        </div>
      )}

      <div className="card">
        <div className="row-between">
          <span>History</span>
          <span className="muted small">tap a day to change it</span>
        </div>
        <HeatmapScroll>
          <Heatmap
            habit={habit}
            done={done}
            today={today}
            weekStart={weekStart}
            weeks={26}
            onSelectDay={onToggleDay}
          />
        </HeatmapScroll>
        <HeatmapLegend habit={habit} />
      </div>

      <div className="button-stack">
        <button type="button" className="button" onClick={() => onArchive(!habit.archivedAt)}>
          {habit.archivedAt ? 'Restore habit' : 'Archive habit'}
        </button>
        <p className="hint">
          Archiving hides a habit from Today but keeps every check-in you have logged.
        </p>

        {confirmDelete ? (
          <div className="confirm">
            <p>Delete “{habit.name}” and its entire history? This cannot be undone.</p>
            <div className="confirm-actions">
              <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button type="button" className="button danger" onClick={onDelete}>
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button danger-quiet"
            onClick={() => setConfirmDelete(true)}
          >
            Delete habit
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ value, unit, highlight }: { value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`stat${highlight ? ' highlight' : ''}`}>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

export { Stat };
