import { useState } from 'react';

import { addDays, friendlyDate } from '../dates.ts';
import { describeSchedule, isScheduledDay, statsFor, weekProgress } from '../habits.ts';
import type { AppState, DateKey, Habit } from '../types.ts';
import { Ring } from './Ring.tsx';

interface Props {
  state: AppState;
  today: DateKey;
  day: DateKey;
  onChangeDay: (day: DateKey) => void;
  onToggle: (habitId: string, day: DateKey) => void;
  onAddHabit: () => void;
}

export function TodayView({ state, today, day, onChangeDay, onToggle, onAddHabit }: Props) {
  const [showExtras, setShowExtras] = useState(false);

  const live = state.habits.filter((h) => !h.archivedAt && h.createdAt <= day);
  const due = live.filter((h) => isScheduledDay(h, day));
  const extras = live.filter((h) => !isScheduledDay(h, day));

  const completed = due.filter((h) => state.completions[h.id]?.has(day)).length;
  const ratio = due.length === 0 ? 0 : completed / due.length;
  const allDone = due.length > 0 && completed === due.length;

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
              label={due.length === 0 ? '—' : `${completed}/${due.length}`}
              sublabel={due.length === 0 ? 'nothing due' : 'done'}
            />
            <div className="summary-text">
              <strong>
                {due.length === 0
                  ? 'A rest day'
                  : allDone
                    ? 'All done. Nice work.'
                    : `${due.length - completed} to go`}
              </strong>
              <span className="muted">
                {due.length === 0
                  ? 'Nothing is scheduled for this day.'
                  : allDone
                    ? 'Every habit scheduled for this day is checked off.'
                    : 'Tap a habit to check it off.'}
              </span>
            </div>
          </div>

          <ul className="habit-list">
            {due.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                state={state}
                day={day}
                today={today}
                onToggle={onToggle}
              />
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
                    These aren’t due today. Checking one off still counts as a bonus.
                  </p>
                  <ul className="habit-list">
                    {extras.map((habit) => (
                      <HabitRow
                        key={habit.id}
                        habit={habit}
                        state={state}
                        day={day}
                        today={today}
                        onToggle={onToggle}
                        muted
                      />
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
  onToggle: (habitId: string, day: DateKey) => void;
  muted?: boolean;
}

function HabitRow({ habit, state, day, today, onToggle, muted }: RowProps) {
  const done = state.completions[habit.id] ?? new Set<DateKey>();
  const checked = done.has(day);
  const stats = statsFor(habit, done, state.weekStart, today);
  const week = weekProgress(habit, done, day, state.weekStart);

  function handle() {
    onToggle(habit.id, day);
    // Android gives a real tick; iOS ignores this silently.
    if (!checked) navigator.vibrate?.(12);
  }

  return (
    <li>
      <button
        type="button"
        className={`habit-row${checked ? ' checked' : ''}${muted ? ' muted-row' : ''}`}
        style={{ ['--habit-color' as string]: habit.color }}
        aria-pressed={checked}
        onClick={handle}
      >
        <span className="habit-emoji">{habit.emoji}</span>
        <span className="habit-text">
          <span className="habit-name">{habit.name}</span>
          <span className="habit-meta">
            {habit.schedule.kind === 'timesPerWeek'
              ? `${week.count} of ${week.target} this week`
              : describeSchedule(habit.schedule)}
            {stats.current.count > 0 && (
              <span className="streak"> · 🔥 {stats.current.count}</span>
            )}
          </span>
        </span>
        <span className="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
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
