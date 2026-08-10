import { useState } from 'react';

import { weekdayName } from '../dates.ts';
import { EMOJI_CHOICES, HABIT_COLORS } from '../types.ts';
import type { Habit, Schedule, WeekStart } from '../types.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  habit: Habit;
  isNew: boolean;
  weekStart: WeekStart;
  onSave: (habit: Habit) => void;
  onCancel: () => void;
}

type Kind = Schedule['kind'];

export function HabitEditor({ habit, isNew, weekStart, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Habit>(habit);
  const patch = (fields: Partial<Habit>) => setDraft((d) => ({ ...d, ...fields }));

  const name = draft.name.trim();
  const canSave = name.length > 0;

  // Kept while switching tabs so flipping between modes does not lose choices.
  const [days, setDays] = useState<number[]>(
    habit.schedule.kind === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5],
  );
  const [times, setTimes] = useState<number>(
    habit.schedule.kind === 'timesPerWeek' ? habit.schedule.times : 3,
  );

  function chooseKind(kind: Kind) {
    if (kind === 'daily') patch({ schedule: { kind: 'daily' } });
    else if (kind === 'weekdays') patch({ schedule: { kind: 'weekdays', days } });
    else patch({ schedule: { kind: 'timesPerWeek', times } });
  }

  function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    // At least one day has to stay selected or the habit could never come due.
    if (next.length === 0) return;
    setDays(next);
    patch({ schedule: { kind: 'weekdays', days: next } });
  }

  function chooseTimes(n: number) {
    setTimes(n);
    patch({ schedule: { kind: 'timesPerWeek', times: n } });
  }

  // Render the weekday buttons in the user's own week order.
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  return (
    <Sheet
      title={isNew ? 'New habit' : 'Edit habit'}
      closeLabel="Cancel"
      onClose={onCancel}
      action={
        <button
          type="button"
          className="text-button strong"
          disabled={!canSave}
          onClick={() => onSave({ ...draft, name })}
        >
          Save
        </button>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="habit-name">
          Name
        </label>
        <div className="name-row">
          <span className="name-emoji" style={{ background: draft.color }}>
            {draft.emoji}
          </span>
          <input
            id="habit-name"
            className="text-input"
            value={draft.name}
            placeholder="Drink water"
            autoFocus={isNew}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={60}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label">Icon</span>
        <div className="emoji-grid">
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`emoji-option${draft.emoji === emoji ? ' selected' : ''}`}
              aria-pressed={draft.emoji === emoji}
              onClick={() => patch({ emoji })}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Colour</span>
        <div className="color-row">
          {HABIT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-option${draft.color === color ? ' selected' : ''}`}
              style={{ background: color }}
              aria-label={`Colour ${color}`}
              aria-pressed={draft.color === color}
              onClick={() => patch({ color })}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Repeat</span>
        <div className="segmented" role="group">
          {(
            [
              ['daily', 'Every day'],
              ['weekdays', 'Certain days'],
              ['timesPerWeek', 'Times a week'],
            ] as [Kind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`segment${draft.schedule.kind === kind ? ' selected' : ''}`}
              aria-pressed={draft.schedule.kind === kind}
              onClick={() => chooseKind(kind)}
            >
              {label}
            </button>
          ))}
        </div>

        {draft.schedule.kind === 'weekdays' && (
          <div className="day-row">
            {weekdayOrder.map((day) => (
              <button
                key={day}
                type="button"
                className={`day-option${days.includes(day) ? ' selected' : ''}`}
                aria-label={weekdayName(day)}
                aria-pressed={days.includes(day)}
                onClick={() => toggleDay(day)}
              >
                {weekdayName(day, true).slice(0, 2)}
              </button>
            ))}
          </div>
        )}

        {draft.schedule.kind === 'timesPerWeek' && (
          <div className="day-row">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                className={`day-option${times === n ? ' selected' : ''}`}
                aria-label={`${n} times a week`}
                aria-pressed={times === n}
                onClick={() => chooseTimes(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <p className="hint">
          {draft.schedule.kind === 'daily' && 'Due every single day.'}
          {draft.schedule.kind === 'weekdays' &&
            'Only due on the days you pick — the others never count as missed.'}
          {draft.schedule.kind === 'timesPerWeek' &&
            'Any days you like, as long as you hit the total. Streaks count weeks.'}
        </p>
      </div>
    </Sheet>
  );
}
