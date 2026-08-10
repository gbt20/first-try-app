import { useState } from 'react';

import { weekdayName } from '../dates.ts';
import { describeSchedule, describeTracking, trackingMatches } from '../habits.ts';
import { EMOJI_CHOICES, HABIT_COLORS, MAX_SLOTS, UNIT_SUGGESTIONS } from '../types.ts';
import type { DateKey, Habit, Schedule, Tracking, WeekStart } from '../types.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  habit: Habit;
  isNew: boolean;
  weekStart: WeekStart;
  /** Every tag already in use, offered as shortcuts. */
  knownTags: string[];
  /** How many days this habit already has logged. */
  loggedDays: number;
  today: DateKey;
  onSave: (habit: Habit) => void;
  onCancel: () => void;
}

type ScheduleKind = Schedule['kind'];
type TrackingKind = Tracking['kind'];

const DEFAULT_SLOTS = ['Morning', 'Evening'];

export function HabitEditor({
  habit,
  isNew,
  weekStart,
  knownTags,
  loggedDays,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<Habit>(habit);
  const patch = (fields: Partial<Habit>) => setDraft((d) => ({ ...d, ...fields }));

  const name = draft.name.trim();
  const canSave = name.length > 0;

  // Held outside the draft so flipping between modes doesn't lose your choices.
  const [days, setDays] = useState<number[]>(
    habit.schedule.kind === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5],
  );
  const [everyN, setEveryN] = useState(
    habit.schedule.kind === 'everyNDays' ? habit.schedule.n : 2,
  );
  const [perWeek, setPerWeek] = useState(
    habit.schedule.kind === 'timesPerWeek' ? habit.schedule.times : 3,
  );
  const [perMonth, setPerMonth] = useState(
    habit.schedule.kind === 'timesPerMonth' ? habit.schedule.times : 4,
  );
  const [count, setCount] = useState(habit.tracking.kind === 'count' ? habit.tracking.target : 8);
  const [amount, setAmount] = useState(
    habit.tracking.kind === 'amount'
      ? { target: habit.tracking.target, unit: habit.tracking.unit, step: habit.tracking.step }
      : { target: 5, unit: 'km', step: 1 },
  );
  const [slots, setSlots] = useState<string[]>(
    habit.tracking.kind === 'slots' ? habit.tracking.slots : DEFAULT_SLOTS,
  );

  function chooseSchedule(kind: ScheduleKind) {
    if (kind === 'weekdays') patch({ schedule: { kind, days } });
    else if (kind === 'everyNDays') patch({ schedule: { kind, n: everyN } });
    else if (kind === 'timesPerWeek') patch({ schedule: { kind, times: perWeek } });
    else if (kind === 'timesPerMonth') patch({ schedule: { kind, times: perMonth } });
    else patch({ schedule: { kind: 'daily' } });
  }

  function chooseTracking(kind: TrackingKind) {
    if (kind === 'count') patch({ tracking: { kind, target: count } });
    else if (kind === 'amount') patch({ tracking: { kind, ...amount } });
    else if (kind === 'slots') patch({ tracking: { kind, slots } });
    else patch({ tracking: { kind: 'check' } });
  }

  function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    next.sort((a, b) => a - b);
    // At least one day has to stay selected or the habit could never come due.
    if (next.length === 0) return;
    setDays(next);
    patch({ schedule: { kind: 'weekdays', days: next } });
  }

  function editSlot(index: number, label: string) {
    const next = slots.map((s, i) => (i === index ? label : s));
    setSlots(next);
    patch({ tracking: { kind: 'slots', slots: next } });
  }

  function addSlot() {
    if (slots.length >= MAX_SLOTS) return;
    const next = [...slots, `Slot ${slots.length + 1}`];
    setSlots(next);
    patch({ tracking: { kind: 'slots', slots: next } });
  }

  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    patch({ tracking: { kind: 'slots', slots: next } });
  }

  function toggleTag(tag: string) {
    const has = draft.tags.includes(tag);
    patch({ tags: has ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag].slice(0, 8) });
  }

  const [newTag, setNewTag] = useState('');
  function commitTag() {
    const tag = newTag.trim().slice(0, 20);
    if (tag && !draft.tags.includes(tag)) patch({ tags: [...draft.tags, tag].slice(0, 8) });
    setNewTag('');
  }

  const willConvert =
    !isNew && loggedDays > 0 && !trackingMatches(habit.tracking, draft.tracking);

  // Render the weekday buttons in the user's own week order.
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const suggestions = knownTags.filter((t) => !draft.tags.includes(t));

  function save() {
    // Blank slot labels would render as invisible buttons.
    const cleaned: Habit = { ...draft, name };
    if (cleaned.tracking.kind === 'slots') {
      const labels = cleaned.tracking.slots
        .map((s, i) => s.trim() || `Slot ${i + 1}`)
        .slice(0, MAX_SLOTS);
      cleaned.tracking = { kind: 'slots', slots: labels };
    }
    onSave(cleaned);
  }

  return (
    <Sheet
      title={isNew ? 'New habit' : 'Edit habit'}
      closeLabel="Cancel"
      onClose={onCancel}
      action={
        <button type="button" className="text-button strong" disabled={!canSave} onClick={save}>
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
        <label className="field-label" htmlFor="habit-emoji">
          Icon
        </label>
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
        <input
          id="habit-emoji"
          className="text-input"
          value={draft.emoji}
          placeholder="Or type any emoji"
          maxLength={8}
          // Keeps a whole emoji intact — flags and skin tones are several code
          // points, so slicing by character would shred them.
          onChange={(e) => patch({ emoji: firstGrapheme(e.target.value) || '✅' })}
        />
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
        <label className="custom-color">
          <input
            type="color"
            value={toHex(draft.color)}
            onChange={(e) => patch({ color: e.target.value })}
          />
          <span>Custom colour</span>
        </label>
      </div>

      <div className="field">
        <span className="field-label">How you finish a day</span>
        <div className="segmented wrap" role="group">
          {(
            [
              ['check', 'Just tick it'],
              ['count', 'A number of times'],
              ['amount', 'An amount'],
              ['slots', 'Named times'],
            ] as [TrackingKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`segment${draft.tracking.kind === kind ? ' selected' : ''}`}
              aria-pressed={draft.tracking.kind === kind}
              onClick={() => chooseTracking(kind)}
            >
              {label}
            </button>
          ))}
        </div>

        {draft.tracking.kind === 'count' && (
          <NumberField
            label="Times a day"
            value={count}
            min={1}
            max={99}
            onChange={(n) => {
              setCount(n);
              patch({ tracking: { kind: 'count', target: n } });
            }}
          />
        )}

        {draft.tracking.kind === 'amount' && (
          <>
            <div className="pair">
              <NumberField
                label="Target"
                value={amount.target}
                min={0.1}
                max={100000}
                decimal
                onChange={(n) => {
                  const next = { ...amount, target: n };
                  setAmount(next);
                  patch({ tracking: { kind: 'amount', ...next } });
                }}
              />
              <div className="field">
                <label className="field-label" htmlFor="habit-unit">
                  Unit
                </label>
                <input
                  id="habit-unit"
                  className="text-input"
                  value={amount.unit}
                  maxLength={12}
                  list="unit-suggestions"
                  placeholder="km"
                  onChange={(e) => {
                    const next = { ...amount, unit: e.target.value };
                    setAmount(next);
                    patch({ tracking: { kind: 'amount', ...next } });
                  }}
                />
                <datalist id="unit-suggestions">
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>
            <NumberField
              label="Each tap adds"
              value={amount.step}
              min={0.1}
              max={1000}
              decimal
              onChange={(n) => {
                const next = { ...amount, step: n };
                setAmount(next);
                patch({ tracking: { kind: 'amount', ...next } });
              }}
            />
          </>
        )}

        {willConvert && (
          <p className="warn">
            Changing how a day is measured rewrites this habit’s history: the{' '}
            {loggedDays === 1 ? 'day' : 'days'} you finished stay finished, and any part-finished
            {' '}days are cleared. Streaks survive.
          </p>
        )}

        {draft.tracking.kind === 'slots' && (
          <div className="slot-editor">
            {slots.map((slot, i) => (
              <div className="slot-edit-row" key={i}>
                <input
                  className="text-input"
                  value={slot}
                  maxLength={16}
                  aria-label={`Name for slot ${i + 1}`}
                  onChange={(e) => editSlot(i, e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button tiny"
                  aria-label={`Remove ${slot}`}
                  disabled={slots.length <= 1}
                  onClick={() => removeSlot(i)}
                >
                  ✕
                </button>
              </div>
            ))}
            {slots.length < MAX_SLOTS && (
              <button type="button" className="button" onClick={addSlot}>
                + Add another
              </button>
            )}
            <p className="hint">
              Each one gets its own box, so a missed evening is visible rather than just “half
              done”. Removing a slot also drops its history.
            </p>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">Repeat</span>
        <div className="segmented wrap" role="group">
          {(
            [
              ['daily', 'Every day'],
              ['weekdays', 'Certain days'],
              ['everyNDays', 'Every N days'],
              ['timesPerWeek', 'Times a week'],
              ['timesPerMonth', 'Times a month'],
            ] as [ScheduleKind, string][]
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`segment${draft.schedule.kind === kind ? ' selected' : ''}`}
              aria-pressed={draft.schedule.kind === kind}
              onClick={() => chooseSchedule(kind)}
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

        {draft.schedule.kind === 'everyNDays' && (
          <NumberField
            label="Days between"
            value={everyN}
            min={1}
            max={365}
            onChange={(n) => {
              setEveryN(n);
              patch({ schedule: { kind: 'everyNDays', n } });
            }}
          />
        )}

        {draft.schedule.kind === 'timesPerWeek' && (
          <div className="day-row">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                className={`day-option${perWeek === n ? ' selected' : ''}`}
                aria-label={`${n} times a week`}
                aria-pressed={perWeek === n}
                onClick={() => {
                  setPerWeek(n);
                  patch({ schedule: { kind: 'timesPerWeek', times: n } });
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {draft.schedule.kind === 'timesPerMonth' && (
          <NumberField
            label="Times a month"
            value={perMonth}
            min={1}
            max={31}
            onChange={(n) => {
              setPerMonth(n);
              patch({ schedule: { kind: 'timesPerMonth', times: n } });
            }}
          />
        )}
      </div>

      <div className="field">
        <span className="field-label">Tags</span>
        {draft.tags.length > 0 && (
          <div className="tag-row">
            {draft.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag selected"
                aria-label={`Remove tag ${tag}`}
                onClick={() => toggleTag(tag)}
              >
                {tag} ✕
              </button>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="tag-row">
            {suggestions.map((tag) => (
              <button key={tag} type="button" className="tag" onClick={() => toggleTag(tag)}>
                + {tag}
              </button>
            ))}
          </div>
        )}
        <div className="name-row">
          <input
            className="text-input"
            value={newTag}
            placeholder="Add a tag — health, work…"
            maxLength={20}
            enterKeyHint="done"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTag();
              }
            }}
          />
          <button type="button" className="button" disabled={!newTag.trim()} onClick={commitTag}>
            Add
          </button>
        </div>
      </div>

      <p className="summary-line">
        <strong>{draft.emoji} {name || 'Your habit'}</strong>
        <span className="muted">
          {describeSchedule(draft.schedule)}
          {describeTracking(draft.tracking) && ` · ${describeTracking(draft.tracking)}`}
        </span>
      </p>
    </Sheet>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  decimal,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  decimal?: boolean;
  onChange: (n: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const step = decimal ? 0.5 : 1;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button
          type="button"
          className="step-button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(Math.round((value - step) * 100) / 100))}
        >
          −
        </button>
        <input
          className="text-input step-value"
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={typed ?? String(value)}
          aria-label={label}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? clamp(n) : value);
            setTyped(null);
          }}
        />
        <button
          type="button"
          className="step-button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(Math.round((value + step) * 100) / 100))}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** The first whole emoji of a string, keeping multi-code-point ones together. */
function firstGrapheme(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const Segmenter = (
    Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => {
      segment: (s: string) => Iterable<{ segment: string }>;
    } }
  ).Segmenter;
  if (Segmenter) {
    for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)) {
      return segment;
    }
  }
  return [...trimmed][0] ?? '';
}

/** `<input type="color">` only accepts `#rrggbb`. */
function toHex(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#f97362';
}
