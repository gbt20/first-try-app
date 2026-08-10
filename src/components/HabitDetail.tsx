import { useState } from 'react';

import { friendlyDate } from '../dates.ts';
import {
  describeSchedule,
  describeTracking,
  formatNumber,
  formatRate,
  periodProgress,
  statsFor,
} from '../habits.ts';
import type { Days } from '../habits.ts';
import type { DateKey, Habit, WeekStart } from '../types.ts';
import { Heatmap, HeatmapLegend, HeatmapScroll } from './Heatmap.tsx';
import { Sheet } from './Sheet.tsx';

interface Props {
  habit: Habit;
  days: Days;
  today: DateKey;
  weekStart: WeekStart;
  onClose: () => void;
  onEdit: () => void;
  onEditDay: (day: DateKey) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}

export function HabitDetail({
  habit,
  days,
  today,
  weekStart,
  onClose,
  onEdit,
  onEditDay,
  onArchive,
  onDelete,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stats = statsFor(habit, days, weekStart, today);
  const period = periodProgress(habit, days, today, weekStart);

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
            {describeTracking(habit.tracking) && ` · ${describeTracking(habit.tracking)}`}
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
        {habit.tracking.kind === 'amount' ? (
          <Stat
            value={formatNumber(stats.amountTotal)}
            unit={`${habit.tracking.unit} all time`}
          />
        ) : (
          <Stat value={String(stats.daysDone)} unit="days done" />
        )}
      </div>

      {period.unit !== 'day' && (
        <div className="card">
          <div className="row-between">
            <span>This {period.unit}</span>
            <strong>
              {period.count} of {period.quota}
            </strong>
          </div>
          <div className="bar">
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, (period.count / Math.max(1, period.quota)) * 100)}%`,
                background: habit.color,
              }}
            />
          </div>
        </div>
      )}

      <div className="card">
        <div className="row-between">
          <span>History</span>
          <span className="muted small">tap a day to edit it</span>
        </div>
        <HeatmapScroll>
          <Heatmap
            habit={habit}
            days={days}
            today={today}
            weekStart={weekStart}
            weeks={26}
            onSelectDay={onEditDay}
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
