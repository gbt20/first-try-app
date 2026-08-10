import { useState } from 'react';

import { addDays, friendlyDate } from '../dates.ts';
import {
  describeSchedule,
  formatNumber,
  isScheduledDay,
  periodProgress,
  progressOn,
  slotDone,
  statsFor,
} from '../habits.ts';
import type { Days } from '../habits.ts';
import type { AppState, DateKey, Habit } from '../types.ts';
import { Ring } from './Ring.tsx';

interface Props {
  state: AppState;
  today: DateKey;
  day: DateKey;
  onChangeDay: (day: DateKey) => void;
  onToggleDone: (habit: Habit, day: DateKey) => void;
  onBump: (habitId: string, day: DateKey, delta: number) => void;
  onToggleSlot: (habit: Habit, day: DateKey, index: number) => void;
  onEditDay: (habit: Habit, day: DateKey) => void;
  onAddHabit: () => void;
}

export function TodayView({
  state,
  today,
  day,
  onChangeDay,
  onToggleDone,
  onBump,
  onToggleSlot,
  onEditDay,
  onAddHabit,
}: Props) {
  const [showExtras, setShowExtras] = useState(false);

  const live = state.habits.filter((h) => !h.archivedAt && h.createdAt <= day);
  const due = live.filter((h) => isScheduledDay(h, day));
  const extras = live.filter((h) => !isScheduledDay(h, day));

  // Partly-finished habits count as a fraction, so the ring creeps up as you
  // tick off the fifth of eight glasses rather than jumping at the end.
  const fraction = due.reduce((sum, h) => {
    const { value, target } = progressOn(h, state.entries[h.id] ?? {}, day);
    return sum + Math.min(1, value / target);
  }, 0);
  const finished = due.filter((h) => progressOn(h, state.entries[h.id] ?? {}, day).done).length;
  const ratio = due.length === 0 ? 0 : fraction / due.length;
  const allDone = due.length > 0 && finished === due.length;

  const rowProps = { state, day, today, onToggleDone, onBump, onToggleSlot, onEditDay };

  return (
    <div className="view">
      <header className="day-header">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous day"
          onClick={() => onChangeDay(addDays(day, -1))}
        >
          ‹
        </button>
        <div className="day-title">
          <h1>{friendlyDate(day, today)}</h1>
          {day !== today && (
            <button type="button" className="text-button small" onClick={() => onChangeDay(today)}>
              Jump to today
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Next day"
          // There is nothing to log in the future, so forward stops at today.
          disabled={day >= today}
          onClick={() => onChangeDay(addDays(day, 1))}
        >
          ›
        </button>
      </header>

      {live.length === 0 ? (
        <Empty onAddHabit={onAddHabit} />
      ) : (
        <>
          <div className="summary card">
            <Ring
              value={ratio}
              label={due.length === 0 ? '—' : `${Math.round(ratio * 100)}%`}
              sublabel={due.length === 0 ? 'nothing due' : `${finished} of ${due.length}`}
            />
            <div className="summary-text">
              <strong>
                {due.length === 0
                  ? 'A rest day'
                  : allDone
                    ? 'All done. Nice work.'
                    : `${due.length - finished} to go`}
              </strong>
              <span className="muted">
                {due.length === 0
                  ? 'Nothing is scheduled for this day.'
                  : allDone
                    ? 'Every habit scheduled for this day is finished.'
                    : 'Tap a habit to log it.'}
              </span>
            </div>
          </div>

          <ul className="habit-list">
            {due.map((habit) => (
              <HabitRow key={habit.id} habit={habit} {...rowProps} />
            ))}
          </ul>

          {extras.length > 0 && (
            <section className="extras">
              <button
                type="button"
                className="section-toggle"
                aria-expanded={showExtras}
                onClick={() => setShowExtras((v) => !v)}
              >
                <span>Not scheduled today ({extras.length})</span>
                <span className={`chevron${showExtras ? ' open' : ''}`}>›</span>
              </button>
              {showExtras && (
                <>
                  <p className="hint">
                    These aren’t due today. Logging one still counts as a bonus.
                  </p>
                  <ul className="habit-list">
                    {extras.map((habit) => (
                      <HabitRow key={habit.id} habit={habit} {...rowProps} muted />
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface RowProps {
  habit: Habit;
  state: AppState;
  day: DateKey;
  today: DateKey;
  onToggleDone: (habit: Habit, day: DateKey) => void;
  onBump: (habitId: string, day: DateKey, delta: number) => void;
  onToggleSlot: (habit: Habit, day: DateKey, index: number) => void;
  onEditDay: (habit: Habit, day: DateKey) => void;
  muted?: boolean;
}

function HabitRow({
  habit,
  state,
  day,
  today,
  onToggleDone,
  onBump,
  onToggleSlot,
  onEditDay,
  muted,
}: RowProps) {
  const days: Days = state.entries[habit.id] ?? {};
  const { value, target, done } = progressOn(habit, days, day);
  const stats = statsFor(habit, days, state.weekStart, today);
  const period = periodProgress(habit, days, day, state.weekStart);
  const step = habit.tracking.kind === 'amount' ? habit.tracking.step : 1;
  const stepped = habit.tracking.kind === 'count' || habit.tracking.kind === 'amount';

  function buzz() {
    // Android gives a real tick; iOS ignores this silently.
    navigator.vibrate?.(12);
  }

  const subtitle =
    period.unit !== 'day'
      ? `${period.count} of ${period.quota} this ${period.unit}`
      : habit.tracking.kind === 'check'
        ? describeSchedule(habit.schedule)
        : habit.tracking.kind === 'amount'
          ? `${formatNumber(value)} / ${formatNumber(target)} ${habit.tracking.unit}`
          : habit.tracking.kind === 'count'
            ? `${value} of ${target}`
            : `${value} of ${target} done`;

  return (
    <li>
      <div
        className={`habit-row${done ? ' checked' : ''}${muted ? ' muted-row' : ''}`}
        style={{ ['--habit-color' as string]: habit.color }}
      >
        {/* The whole left side is the positive action: check it, or add one more. */}
        <button
          type="button"
          className="row-main"
          aria-label={
            stepped ? `Add to ${habit.name}` : `Mark ${habit.name} ${done ? 'not done' : 'done'}`
          }
          onClick={() => {
            if (habit.tracking.kind === 'slots') onEditDay(habit, day);
            else if (stepped) onBump(habit.id, day, step);
            else onToggleDone(habit, day);
            buzz();
          }}
        >
          <span className="habit-emoji">{habit.emoji}</span>
          <span className="habit-text">
            <span className="habit-name">{habit.name}</span>
            <span className="habit-meta">
              {subtitle}
              {stats.current.count > 0 && <span className="streak"> · 🔥 {stats.current.count}</span>}
            </span>
            {habit.tracking.kind !== 'check' && (
              <span className="row-bar" aria-hidden="true">
                <span
                  className="row-bar-fill"
                  style={{ width: `${Math.min(100, (value / target) * 100)}%` }}
                />
              </span>
            )}
          </span>
        </button>

        {habit.tracking.kind === 'slots' ? (
          <div className="slot-chips">
            {habit.tracking.slots.map((slot, i) => (
              <button
                key={slot + i}
                type="button"
                className={`slot-chip${slotDone(days[day] ?? 0, i) ? ' on' : ''}`}
                aria-pressed={slotDone(days[day] ?? 0, i)}
                aria-label={`${habit.name} — ${slot}`}
                onClick={() => {
                  onToggleSlot(habit, day, i);
                  buzz();
                }}
              >
                {slot}
              </button>
            ))}
          </div>
        ) : stepped ? (
          <div className="row-actions">
            <button
              type="button"
              className="step-button small"
              aria-label={`Subtract from ${habit.name}`}
              disabled={value <= 0}
              onClick={() => onBump(habit.id, day, -step)}
            >
              −
            </button>
            <button
              type="button"
              className="row-readout"
              aria-label={`Set an exact value for ${habit.name}`}
              onClick={() => onEditDay(habit, day)}
            >
              {formatNumber(value)}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="check"
            aria-label={`Mark ${habit.name} ${done ? 'not done' : 'done'}`}
            aria-pressed={done}
            onClick={() => {
              onToggleDone(habit, day);
              buzz();
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

function Empty({ onAddHabit }: { onAddHabit: () => void }) {
  return (
    <div className="empty">
      <div className="empty-mark">🌱</div>
      <h2>Start with one habit</h2>
      <p className="muted">
        Pick something small enough that you can do it on your worst day. You can always add more
        later.
      </p>
      <button type="button" className="button primary" onClick={onAddHabit}>
        Add your first habit
      </button>
    </div>
  );
}
