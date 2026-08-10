import { useState } from 'react';

import { describeSchedule, describeTracking, statsFor } from '../habits.ts';
import type { AppState, DateKey, Habit } from '../types.ts';

interface Props {
  state: AppState;
  today: DateKey;
  onOpen: (habit: Habit) => void;
  onAddHabit: () => void;
  onMove: (habitId: string, delta: number) => void;
}

export function HabitsView({ state, today, onOpen, onAddHabit, onMove }: Props) {
  const [reordering, setReordering] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = state.habits.filter((h) => !h.archivedAt);
  const archived = state.habits.filter((h) => h.archivedAt);

  return (
    <div className="view">
      <header className="view-header">
        <h1>Habits</h1>
        {active.length > 1 && (
          <button
            type="button"
            className="text-button"
            onClick={() => setReordering((v) => !v)}
          >
            {reordering ? 'Done' : 'Reorder'}
          </button>
        )}
      </header>

      {active.length === 0 ? (
        <p className="muted">No habits yet. Add one to get started.</p>
      ) : (
        <ul className="habit-list">
          {active.map((habit, index) => (
            <li key={habit.id}>
              <div className="manage-row" style={{ ['--habit-color' as string]: habit.color }}>
                {reordering && (
                  <div className="reorder">
                    <button
                      type="button"
                      className="icon-button tiny"
                      aria-label={`Move ${habit.name} up`}
                      disabled={index === 0}
                      onClick={() => onMove(habit.id, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="icon-button tiny"
                      aria-label={`Move ${habit.name} down`}
                      disabled={index === active.length - 1}
                      onClick={() => onMove(habit.id, 1)}
                    >
                      ▼
                    </button>
                  </div>
                )}
                <button type="button" className="manage-main" onClick={() => onOpen(habit)}>
                  <span className="habit-emoji">{habit.emoji}</span>
                  <span className="habit-text">
                    <span className="habit-name">{habit.name}</span>
                    <span className="habit-meta">
                      {describeSchedule(habit.schedule)}
                      {describeTracking(habit.tracking) && ` · ${describeTracking(habit.tracking)}`}
                      {' · '}
                      {streakLabel(habit, state, today)}
                    </span>
                    {habit.tags.length > 0 && (
                      <span className="row-tags">
                        {habit.tags.map((t) => (
                          <span className="tag mini" key={t}>
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="chevron">›</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button type="button" className="button primary full" onClick={onAddHabit}>
          + New habit
        </button>
      </div>

      {archived.length > 0 && (
        <section className="extras">
          <button
            type="button"
            className="section-toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            <span>Archived ({archived.length})</span>
            <span className={`chevron${showArchived ? ' open' : ''}`}>›</span>
          </button>
          {showArchived && (
            <ul className="habit-list">
              {archived.map((habit) => (
                <li key={habit.id}>
                  <button
                    type="button"
                    className="manage-main muted-row"
                    style={{ ['--habit-color' as string]: habit.color }}
                    onClick={() => onOpen(habit)}
                  >
                    <span className="habit-emoji">{habit.emoji}</span>
                    <span className="habit-text">
                      <span className="habit-name">{habit.name}</span>
                      <span className="habit-meta">Archived</span>
                    </span>
                    <span className="chevron">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function streakLabel(habit: Habit, state: AppState, today: DateKey): string {
  const stats = statsFor(habit, state.entries[habit.id] ?? {}, state.weekStart, today);
  if (stats.current.count === 0) return 'no streak yet';
  const unit = stats.current.unit;
  return `🔥 ${stats.current.count} ${unit}${stats.current.count === 1 ? '' : 's'}`;
}
