import { useMemo, useRef, useState } from 'react';

import { addDays, eachDay, friendlyDate, fromKey, monthName, startOfWeek } from '../dates.ts';
import { formatNumber, formatRate, isDone, isScheduledDay, progressOn, statsFor } from '../habits.ts';
import type { Days } from '../habits.ts';
import type { AppState, DateKey, Habit, WeekStart } from '../types.ts';
import { Heatmap, HeatmapScroll } from './Heatmap.tsx';

interface Props {
  state: AppState;
  today: DateKey;
  onOpen: (habit: Habit) => void;
  onSetWeekStart: (weekStart: WeekStart) => void;
  onSetDayStartHour: (hour: number) => void;
  onExport: () => string;
  onExportCsv: () => string;
  onImport: (json: string) => boolean;
  onClearAll: () => void;
}

const OVERVIEW_WEEKS = 18;

export function StatsView({
  state,
  today,
  onOpen,
  onSetWeekStart,
  onSetDayStartHour,
  onExport,
  onExportCsv,
  onImport,
  onClearAll,
}: Props) {
  const [tag, setTag] = useState<string | null>(null);

  const active = useMemo(() => state.habits.filter((h) => !h.archivedAt), [state.habits]);
  const allTags = useMemo(
    () => [...new Set(active.flatMap((h) => h.tags))].sort(),
    [active],
  );
  const shown = useMemo(
    () => (tag ? active.filter((h) => h.tags.includes(tag)) : active),
    [active, tag],
  );

  const perHabit = useMemo(
    () =>
      shown.map((habit) => {
        const days: Days = state.entries[habit.id] ?? {};
        return { habit, days, stats: statsFor(habit, days, state.weekStart, today) };
      }),
    [shown, state.entries, state.weekStart, today],
  );

  const totals = useMemo(() => {
    const daysDone = perHabit.reduce((sum, p) => sum + p.stats.daysDone, 0);
    const best = perHabit.reduce((max, p) => Math.max(max, p.stats.current.count), 0);
    const bestEver = perHabit.reduce((max, p) => Math.max(max, p.stats.longest.count), 0);

    // Last 30 days, pooled: of the days a habit was actually due, how many got
    // finished? Today only counts once it is done.
    let due = 0;
    let hit = 0;
    for (const { habit, days } of perHabit) {
      for (const day of eachDay(addDays(today, -29), today)) {
        if (day < habit.createdAt) continue;
        if (!isScheduledDay(habit, day)) continue;
        const done = isDone(habit, days, day);
        if (day === today && !done) continue;
        due += 1;
        if (done) hit += 1;
      }
    }
    return { daysDone, best, bestEver, rate: due > 0 ? hit / due : null };
  }, [perHabit, today]);

  return (
    <div className="view">
      <header className="view-header">
        <h1>Progress</h1>
      </header>

      {active.length === 0 ? (
        <p className="muted">Add a habit and your progress will show up here.</p>
      ) : (
        <>
          {allTags.length > 0 && (
            <div className="tag-row filter">
              <button
                type="button"
                className={`tag${tag === null ? ' selected' : ''}`}
                onClick={() => setTag(null)}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tag${tag === t ? ' selected' : ''}`}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="stat-grid">
            <div className="stat highlight">
              <strong>{totals.best}</strong>
              <small>best active streak</small>
            </div>
            <div className="stat">
              <strong>{formatRate(totals.rate)}</strong>
              <small>last 30 days</small>
            </div>
            <div className="stat">
              <strong>{totals.bestEver}</strong>
              <small>longest ever</small>
            </div>
            <div className="stat">
              <strong>{totals.daysDone}</strong>
              <small>days completed</small>
            </div>
          </div>

          <div className="card">
            <div className="row-between">
              <span>Every habit, every day</span>
            </div>
            <OverviewHeatmap state={state} today={today} habits={shown} />
            <div className="legend">
              <span className="cell cell-missed" /> none
              <span className="overview-cell" style={{ opacity: 0.55 }} /> some
              <span className="overview-cell" style={{ opacity: 1 }} /> all
            </div>
          </div>

          <h2 className="section-title">By habit</h2>
          <ul className="habit-list">
            {perHabit.map(({ habit, days, stats }) => (
              <li key={habit.id}>
                <button
                  type="button"
                  className="stat-row"
                  style={{ ['--habit-color' as string]: habit.color }}
                  onClick={() => onOpen(habit)}
                >
                  <span className="stat-row-head">
                    <span className="habit-emoji">{habit.emoji}</span>
                    <span className="habit-text">
                      <span className="habit-name">{habit.name}</span>
                      <span className="habit-meta">
                        {formatRate(stats.rate)} · 🔥 {stats.current.count} {stats.current.unit}
                        {stats.current.count === 1 ? '' : 's'}
                        {habit.tracking.kind === 'amount'
                          ? ` · ${formatNumber(stats.amountTotal)} ${habit.tracking.unit}`
                          : ` · best ${stats.longest.count}`}
                      </span>
                    </span>
                    <span className="chevron">›</span>
                  </span>
                  <Heatmap
                    habit={habit}
                    days={days}
                    today={today}
                    weekStart={state.weekStart}
                    weeks={16}
                    showLabels={false}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Settings
        state={state}
        onSetWeekStart={onSetWeekStart}
        onSetDayStartHour={onSetDayStartHour}
        onExport={onExport}
        onExportCsv={onExportCsv}
        onImport={onImport}
        onClearAll={onClearAll}
      />
    </div>
  );
}

/** One cell per day, shaded by how much of that day's plan was completed. */
function OverviewHeatmap({
  state,
  today,
  habits,
}: {
  state: AppState;
  today: DateKey;
  habits: Habit[];
}) {
  const columns = useMemo(() => {
    const first = addDays(startOfWeek(today, state.weekStart), -7 * (OVERVIEW_WEEKS - 1));
    return Array.from({ length: OVERVIEW_WEEKS }, (_, w) => {
      const weekOf = addDays(first, w * 7);
      return { weekOf, cells: Array.from({ length: 7 }, (_, d) => addDays(weekOf, d)) };
    });
  }, [today, state.weekStart]);

  const monthLabels = useMemo(() => {
    let last = -1;
    return columns.map(({ weekOf }) => {
      const month = fromKey(weekOf).getMonth();
      if (month === last) return '';
      last = month;
      return monthName(month);
    });
  }, [columns]);

  function ratioFor(day: DateKey): number | null {
    let due = 0;
    let sum = 0;
    for (const habit of habits) {
      if (day < habit.createdAt) continue;
      if (!isScheduledDay(habit, day)) continue;
      due += 1;
      // Part-finished habits count as a fraction, matching the ring on Today.
      const { value, target } = progressOn(habit, state.entries[habit.id] ?? {}, day);
      sum += Math.min(1, value / target);
    }
    return due === 0 ? null : sum / due;
  }

  return (
    <HeatmapScroll>
      <div className="heatmap">
        <div className="heatmap-body">
          <div className="heatmap-months" aria-hidden="true">
            {monthLabels.map((label, i) => (
              <span key={columns[i].weekOf}>{label}</span>
            ))}
          </div>
          <div className="heatmap-grid">
            {columns.map(({ weekOf, cells }) => (
              <div className="heatmap-week" key={weekOf}>
                {cells.map((day) => {
                  if (day > today) return <span key={day} className="cell cell-future" />;
                  const ratio = ratioFor(day);
                  if (ratio === null) return <span key={day} className="cell cell-off" />;
                  const label = `${friendlyDate(day, today)} — ${Math.round(ratio * 100)}% of habits done`;
                  return (
                    <span
                      key={day}
                      className={ratio === 0 ? 'cell cell-missed' : 'cell overview-cell'}
                      style={ratio === 0 ? undefined : { opacity: 0.3 + ratio * 0.7 }}
                      title={label}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </HeatmapScroll>
  );
}

type SettingsProps = Pick<
  Props,
  | 'state'
  | 'onSetWeekStart'
  | 'onSetDayStartHour'
  | 'onExport'
  | 'onExportCsv'
  | 'onImport'
  | 'onClearAll'
>;

function Settings({
  state,
  onSetWeekStart,
  onSetDayStartHour,
  onExport,
  onExportCsv,
  onImport,
  onClearAll,
}: SettingsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function download(text: string, extension: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habits-${new Date().toISOString().slice(0, 10)}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(`Saved as .${extension}`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(onExport());
      setNote('Backup copied to the clipboard.');
    } catch {
      setNote('Could not copy — use Save backup instead.');
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setNote(onImport(text) ? 'Backup restored.' : 'That file had no habits in it — nothing changed.');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="settings">
      <h2 className="section-title">Settings</h2>

      <div className="card">
        <div className="row-between">
          <span>Week starts on</span>
          <div className="segmented compact">
            {([1, 0] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`segment${state.weekStart === value ? ' selected' : ''}`}
                aria-pressed={state.weekStart === value}
                onClick={() => onSetWeekStart(value)}
              >
                {value === 1 ? 'Monday' : 'Sunday'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between">
          <label htmlFor="day-start">My day starts at</label>
          <select
            id="day-start"
            className="select"
            value={state.dayStartHour}
            onChange={(e) => onSetDayStartHour(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? 'Midnight' : `${h}:00 am`}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          {state.dayStartHour === 0
            ? 'A new day begins at midnight.'
            : `Anything logged before ${state.dayStartHour}:00 am counts towards the day before, so a late night doesn’t split in two.`}
        </p>
      </div>

      <div className="card">
        <p className="muted small">
          Everything is stored on this device only. Nothing is uploaded anywhere, and clearing your
          browser data for this site would erase it — so keep a backup if it matters to you.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={() => download(onExport(), 'json', 'application/json')}>
            Save backup
          </button>
          <button type="button" className="button" onClick={copy}>
            Copy backup
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Restore
          </button>
          <button type="button" className="button" onClick={() => download(onExportCsv(), 'csv', 'text/csv')}>
            Export CSV
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <p className="hint">
          {note ?? 'The CSV is for spreadsheets — only the JSON backup can be restored.'}
        </p>
      </div>

      <div className="card">
        {confirmClear ? (
          <div className="confirm">
            <p>Erase every habit and all history on this device?</p>
            <div className="confirm-actions">
              <button type="button" className="button" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                  setNote('All data erased.');
                }}
              >
                Erase everything
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button danger-quiet full"
            onClick={() => setConfirmClear(true)}
          >
            Erase all data
          </button>
        )}
      </div>
    </section>
  );
}
