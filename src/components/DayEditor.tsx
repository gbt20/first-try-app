import { useState } from 'react';

import { friendlyDate } from '../dates.ts';
import {
  describeTracking,
  formatNumber,
  progressOn,
  slotDone,
  targetOf,
  withSlotToggled,
} from '../habits.ts';
import type { Days } from '../habits.ts';
import type { DateKey, Habit } from '../types.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  habit: Habit;
  days: Days;
  day: DateKey;
  today: DateKey;
  onSave: (value: number) => void;
  onClose: () => void;
}

/**
 * Set one day's progress exactly. Reached by tapping a square in the history
 * grid, or the readout on a Today row — a plain toggle stops being enough once
 * a day can hold "5 of 8".
 */
export function DayEditor({ habit, days, day, today, onSave, onClose }: Props) {
  const [value, setValue] = useState(() => progressOn(habit, days, day).raw);
  const target = targetOf(habit.tracking);
  const step = habit.tracking.kind === 'amount' ? habit.tracking.step : 1;
  const unit = habit.tracking.kind === 'amount' ? habit.tracking.unit : '';

  // Free text so a half-typed "1." or an emptied field doesn't fight the user.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? (value === 0 ? '' : formatNumber(value));

  function commitTyped(raw: string) {
    const n = Number(raw);
    setValue(raw.trim() === '' || !Number.isFinite(n) || n < 0 ? 0 : n);
    setTyped(null);
  }

  return (
    <Sheet
      title={friendlyDate(day, today)}
      closeLabel="Cancel"
      onClose={onClose}
      action={
        <button type="button" className="text-button strong" onClick={() => onSave(value)}>
          Save
        </button>
      }
    >
      <div className="day-edit" style={{ ['--habit-color' as string]: habit.color }}>
        <span className="detail-emoji" style={{ background: habit.color }}>
          {habit.emoji}
        </span>
        <div>
          <h3>{habit.name}</h3>
          <p className="muted">{describeTracking(habit.tracking) || 'Tick it off'}</p>
        </div>
      </div>

      {habit.tracking.kind === 'check' && (
        <div className="field">
          <button
            type="button"
            className={`big-toggle${value >= 1 ? ' on' : ''}`}
            style={{ ['--habit-color' as string]: habit.color }}
            aria-pressed={value >= 1}
            onClick={() => setValue(value >= 1 ? 0 : 1)}
          >
            {value >= 1 ? 'Done' : 'Not done'}
          </button>
        </div>
      )}

      {habit.tracking.kind === 'slots' && (
        <div className="field">
          <span className="field-label">Which ones</span>
          <div className="slot-list">
            {habit.tracking.slots.map((slot, i) => (
              <button
                key={slot + i}
                type="button"
                className={`slot-option${slotDone(value, i) ? ' selected' : ''}`}
                style={{ ['--habit-color' as string]: habit.color }}
                aria-pressed={slotDone(value, i)}
                onClick={() => setValue(withSlotToggled(value, i))}
              >
                <span className="slot-check" aria-hidden="true" />
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {(habit.tracking.kind === 'count' || habit.tracking.kind === 'amount') && (
        <div className="field">
          <span className="field-label">
            How much{unit && ` (${unit})`} — target {formatNumber(target)}
          </span>
          <div className="stepper big">
            <button
              type="button"
              className="step-button"
              aria-label="Less"
              disabled={value <= 0}
              onClick={() => setValue(Math.max(0, Math.round((value - step) * 1000) / 1000))}
            >
              −
            </button>
            <input
              className="text-input step-value"
              type="text"
              inputMode="decimal"
              value={shown}
              placeholder="0"
              aria-label="Value"
              onChange={(e) => setTyped(e.target.value)}
              onBlur={(e) => commitTyped(e.target.value)}
            />
            <button
              type="button"
              className="step-button"
              aria-label="More"
              onClick={() => setValue(Math.round((value + step) * 1000) / 1000)}
            >
              +
            </button>
          </div>
          <div className="quick-row">
            <button type="button" className="button" onClick={() => setValue(0)}>
              Clear
            </button>
            <button type="button" className="button" onClick={() => setValue(target)}>
              Mark done ({formatNumber(target)})
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
