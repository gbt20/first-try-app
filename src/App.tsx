import { useEffect, useMemo, useState } from 'react';

import { newHabit } from './storage.ts';
import { useAppState, useToday } from './useAppState.ts';
import type { DateKey, Habit } from './types.ts';
import { DayEditor } from './components/DayEditor.tsx';
import { HabitDetail } from './components/HabitDetail.tsx';
import { HabitEditor } from './components/HabitEditor.tsx';
import { HabitsView } from './components/HabitsView.tsx';
import { StatsView } from './components/StatsView.tsx';
import { TodayView } from './components/TodayView.tsx';

type Tab = 'today' | 'habits' | 'stats';

/** Drawn inline rather than with glyphs, which vary wildly between phones. */
const ICONS: Record<Tab, string> = {
  today: 'M4 12.5l5 5L20 6.5',
  habits: 'M4 7h16M4 12h16M4 17h10',
  stats: 'M5 20V11M12 20V4M19 20v-6',
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'habits', label: 'Habits' },
  { id: 'stats', label: 'Progress' },
];

export default function App() {
  const [state, actions] = useAppState();
  const today = useToday(state.dayStartHour);

  const [tab, setTab] = useState<Tab>('today');
  const [day, setDay] = useState<DateKey>(today);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ habit: Habit; isNew: boolean } | null>(null);
  const [editingDay, setEditingDay] = useState<{ habitId: string; day: DateKey } | null>(null);

  const knownTags = useMemo(
    () => [...new Set(state.habits.flatMap((h) => h.tags))].sort(),
    [state.habits],
  );

  // If the app was left open overnight, follow the clock forward rather than
  // stranding the user on yesterday.
  useEffect(() => {
    setDay((current) => (current > today ? today : current));
  }, [today]);

  // A habit can disappear underneath the detail sheet (deleted, or a restored
  // backup); close rather than render a blank page.
  const detail = detailId ? (state.habits.find((h) => h.id === detailId) ?? null) : null;
  useEffect(() => {
    if (detailId && !detail) setDetailId(null);
  }, [detailId, detail]);

  const dayTarget = editingDay
    ? (state.habits.find((h) => h.id === editingDay.habitId) ?? null)
    : null;
  useEffect(() => {
    if (editingDay && !dayTarget) setEditingDay(null);
  }, [editingDay, dayTarget]);

  function startNewHabit() {
    setEditing({ habit: newHabit(state.habits.length, today), isNew: true });
  }

  return (
    <div className="app">
      <main className="content">
        {tab === 'today' && (
          <TodayView
            state={state}
            today={today}
            day={day}
            onChangeDay={setDay}
            onToggleDone={actions.toggleDone}
            onBump={actions.bump}
            onToggleSlot={actions.toggleSlot}
            onEditDay={(habit, d) => setEditingDay({ habitId: habit.id, day: d })}
            onAddHabit={startNewHabit}
          />
        )}
        {tab === 'habits' && (
          <HabitsView
            state={state}
            today={today}
            onOpen={(habit) => setDetailId(habit.id)}
            onAddHabit={startNewHabit}
            onMove={actions.moveHabit}
          />
        )}
        {tab === 'stats' && (
          <StatsView
            state={state}
            today={today}
            onOpen={(habit) => setDetailId(habit.id)}
            onSetWeekStart={actions.setWeekStart}
            onSetDayStartHour={actions.setDayStartHour}
            onExport={actions.exportJson}
            onExportCsv={actions.exportCsv}
            onImport={actions.replaceAll}
            onClearAll={actions.clearAll}
          />
        )}
      </main>

      <nav className="tabbar">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? ' selected' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={ICONS[id]}
                fill="none"
                stroke="currentColor"
                strokeWidth={tab === id ? 2.4 : 1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>

      {detail && !editing && !editingDay && (
        <HabitDetail
          habit={detail}
          days={state.entries[detail.id] ?? {}}
          today={today}
          weekStart={state.weekStart}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing({ habit: detail, isNew: false })}
          onEditDay={(d) => setEditingDay({ habitId: detail.id, day: d })}
          onArchive={(archived) => actions.setArchived(detail.id, archived, today)}
          onDelete={() => {
            actions.removeHabit(detail.id);
            setDetailId(null);
          }}
        />
      )}

      {dayTarget && editingDay && (
        <DayEditor
          habit={dayTarget}
          days={state.entries[dayTarget.id] ?? {}}
          day={editingDay.day}
          today={today}
          onClose={() => setEditingDay(null)}
          onSave={(value) => {
            actions.setValue(dayTarget.id, editingDay.day, value);
            setEditingDay(null);
          }}
        />
      )}

      {editing && (
        <HabitEditor
          habit={editing.habit}
          isNew={editing.isNew}
          weekStart={state.weekStart}
          knownTags={knownTags}
          loggedDays={Object.keys(state.entries[editing.habit.id] ?? {}).length}
          today={today}
          onCancel={() => setEditing(null)}
          onSave={(habit) => {
            actions.saveHabit(habit);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
