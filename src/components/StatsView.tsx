import { useMemo, useRef, useState } from 'react';

import { addDays, eachDay, friendlyDate, fromKey, monthName, startOfWeek } from '../dates.ts';
import { formatRate, isScheduledDay, statsFor } from '../habits.ts';
import type { AppState, DateKey, Habit } from '../types.ts';
import { Heatmap, HeatmapScroll } from './Heatmap.tsx';

interface Props {
  state: AppState;
  today: DateKey;
  onOpen: (habit: Habit) => void;
  onSetWeekStart: (weekStart: 0 | 1) => void;
  onExport: () => string;
  onImport: (json: string) => boolean;
  onClearAll: () => void;
}

const OVERVIEW_WEEKS = 18;

export function StatsView({
  state,
  today,
  onOpen,
  onSetWeekStart,
  onExport,
  onImport,
  onClearAll,
}: Props) {
  const active = useMemo(() => state.habits.filter((h) => !h.archivedAt), [state.habits]);

  const perHabit = useMemo(
    () =>
      active.map((habit) => ({
        habit,
        done: state.completions[habit.id] ?? new Set<DateKey>(),
        stats: statsFor(habit, state.completions[habit.id] ?? new Set(), state.weekStart, today),
      })),
    [active, state.completions, state.weekStart, today],
  );

  const totals = useMemo(() => {
    const checkIns = perHabit.reduce((sum, p) => sum + p.stats.total, 0);
    const best = perHabit.reduce((max, p) => Math.max(max, p.stats.current.count), 0);
    const bestEver = perHabit.reduce((max, p) => Math.max(max, p.stats.longest.count), 0);

    // Last 30 days, pooled across habits: how many of the days a habit was
    // actually due did it get done? Today only counts once it is checked off.
    let due = 0;
    let hit = 0;
    for (const { habit, done } of perHabit) {
      for (const day of eachDay(addDays(today, -29), today)) {
        if (day < habit.createdAt) continue;
        if (!isScheduledDay(habit, day)) continue;
        const checked = done.has(day);
        if (day === today && !checked) continue;
        due += 1;
        if (checked) hit += 1;
      }
    }
    return { checkIns, best, bestEver, rate: due > 0 ? hit / due : null };
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
              <strong>{totals.checkIns}</strong>
              <small>total check-ins</small>
            </div>
          </div>

          <div className="card">
            <div className="row-between">
              <span>Every habit, every day</span>
            </div>
            <OverviewHeatmap state={state} today={today} habits={active} />
            <div className="legend">
              <span className="cell cell-missed" /> none
              <span className="overview-cell" style={{ opacity: 0.55 }} /> some
              <span className="overview-cell" style={{ opacity: 1 }} /> all
            </div>
          </div>

          <h2 className="section-title">By habit</h2>
          <ul className="habit-list">
            {perHabit.map(({ habit, done, stats }) => (
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
                        {stats.current.count === 1 ? '' : 's'} · best {stats.longest.count}
                      </span>
                    </span>
                    <span className="chevron">›</span>
                  </span>
                  <Heatmap
                    habit={habit}
                    done={done}
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
        onExport={onExport}
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
      return { weekOf, days: Array.from({ length: 7 }, (_, d) => addDays(weekOf, d)) };
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
    let hit = 0;
    for (const habit of habits) {
      if (day < habit.createdAt) continue;
      if (!isScheduledDay(habit, day)) continue;
      due += 1;
      if (state.completions[habit.id]?.has(day)) hit += 1;
    }
    return due === 0 ? null : hit / due;
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
            {columns.map(({ weekOf, days }) => (
              <div className="heatmap-week" key={weekOf}>
                {days.map((day) => {
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

function Settings({
  state,
  onSetWeekStart,
  onExport,
  onImport,
  onClearAll,
}: Pick<Props, 'state' | 'onSetWeekStart' | 'onExport' | 'onImport' | 'onClearAll'>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function download() {
    const blob = new Blob([onExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habits-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote('Backup saved.');
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
        <p className="muted small">
          Everything is stored on this device only. Nothing is uploaded anywhere, and clearing your
          browser data for this site would erase it — so keep a backup if it matters to you.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={download}>
            Save backup
          </button>
          <button type="button" className="button" onClick={copy}>
            Copy backup
          </button>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Restore
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {note && <p className="hint">{note}</p>}
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
