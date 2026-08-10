# Habits

A habit tracker that installs to your phone's home screen, opens like a native app, and works
with no signal. Everything is stored on your device — there is no account, no server, and nothing
leaves the phone.

<!-- prettier-ignore -->
| Today | Progress | A habit |
| --- | --- | --- |
| Check off what's due, or step back a day to fill something in | Streaks, completion rates and a year of history | Full heatmap, editable schedule |

## Getting it onto your phone

The app has to be served over HTTPS for the home-screen install to work, which the included
GitHub Pages workflow handles.

**1. Make the repository public (once).** GitHub Pages only works on private repositories with
a paid plan, so on the free plan the repository has to be public:
**Settings → General → Danger Zone → Change visibility → Public**. Nothing sensitive lives in
here — there are no keys or credentials, and your habit data is only ever on your own phone.

**2. Turn on Pages (once).** **Settings → Pages**, then set **Source** to **GitHub Actions**.
The workflow cannot do this step for itself; its token isn't allowed to create a Pages site.

**3. Push.** The `Build and deploy` workflow runs on every push to `main` or the
`claude/habit-tracker-app-tzew8h` branch, and publishes to:

```
https://<your-username>.github.io/first-try-app/
```

**4. Add it to your home screen.**

- **iPhone / iPad** — open that link in **Safari** (it must be Safari; Chrome on iOS cannot
  install web apps), tap **Share**, then **Add to Home Screen**.
- **Android** — open it in Chrome, then **Install app** from the ⋮ menu or the prompt.

It then launches full-screen with no address bar, keeps its own icon, and opens instantly
offline.

> Deploying somewhere other than a GitHub Pages project site? Build with the base path set to
> where it will live — `VITE_BASE=/ npm run build` for a domain root.

## What it does

**Today** — everything due today with a big tap target each, a progress ring, and the current
streak per habit. The `‹` `›` arrows step back through previous days so you can fill in a day you
forgot; you cannot log the future. Habits that aren't due today are tucked into a collapsed
section, in case you want to log a bonus.

**Habits** — add, edit, reorder, archive, and delete. Each habit has a name, any emoji, any
colour, optional tags, a schedule, and a way of measuring a day.

*How often it comes due:*

| Schedule | Meaning | Streaks count |
| --- | --- | --- |
| Every day | Due every day | days |
| Certain days | Due only on the weekdays you pick | days |
| Every N days | Every third day, say — counted from the habit's start | days |
| Times a week | Any N days per week, your choice which | weeks |
| Times a month | Any N days per calendar month | months |

*What finishing a day means:*

| Tracking | Example | On the Today row |
| --- | --- | --- |
| Just tick it | Meditate | one big check |
| A number of times | Drink water 8× a day | tap to add one, `−` to correct |
| An amount | Run 5 km, read 30 pages | tap adds a step you choose |
| Named times | Pills — morning, evening | one chip per slot, ticked separately |

A day only counts as done once it reaches its target, so 5 of 8 glasses is *part way*, not
finished — visible as a fill bar on the row and a paler square in the history grid. The two can be
combined: "gym 3× a week, and a session counts at 30 minutes" is a `times a week` schedule with an
`amount` target.

**Progress** — best active streak, 30-day completion rate, lifetime totals, a combined heatmap
shaded by how much of each day you finished, and a per-habit breakdown. Filter it all by tag. Tap
any habit for its full history, then tap any day to set exactly what you did — a plain toggle
stops being enough once a day can hold "5 of 8".

## How streaks and rates are worked out

These are the rules that make the numbers trustworthy — they're covered by the tests in
`src/habits.test.ts`.

- **Today is never a miss.** An unchecked habit doesn't break your streak until the day is over,
  and it stays out of your completion rate until you check it.
- **Unscheduled days are skipped, not failed.** A Mon/Wed/Fri habit keeps its streak across the
  weekend.
- **"Times a week" streaks are counted in weeks.** A week counts once you hit the target, and the
  current week can't break the streak while it's still running.
- **Nothing before a habit existed counts against it**, and archiving freezes it rather than
  racking up misses.
- **Off-schedule check-ins count as check-ins** but never as streak days — a bonus Sunday run
  doesn't inflate a weekdays-only streak.
- **A day counts when it hits its target**, and only then. Part-finished days show as partial
  everywhere, but they don't extend a streak.
- **All dates are local.** Days are keyed off your own calendar rather than UTC, so a late-night
  check-in lands on the day you actually did it — including across daylight-saving changes.
- **Your day can end after midnight.** Set *my day starts at* to 3am in Settings and a 1am
  check-in belongs to the night before, which is how people actually count a late one.
- **Changing how a habit is measured converts its history rather than reinterpreting it.** The
  same stored number means different things under different modes — a count of 4 read as slots
  would name a slot that doesn't exist — so finished days are rewritten as finished under the new
  rules and part-finished days are cleared. The editor says so before you save.

## Your data

Everything lives in this site's `localStorage`, on the one device. That means:

- Nothing is uploaded, and there is nothing to sign in to.
- It does **not** sync between devices.
- Clearing your browser data for the site — or deleting the installed app on iOS — erases it.

**Progress → Save backup** writes a JSON file, **Copy backup** puts the same JSON on your
clipboard, and **Restore** reads one back. A file with no habits in it is rejected rather than
silently wiping what you have. **Export CSV** gives one row per logged day for spreadsheets —
it's export-only, and can't be restored from.

Backups are versioned. A file saved by the first release (schema 1, when a check-in was a plain
yes/no) still restores today: every completed day is carried across as a finished day under the
new model.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/first-try-app/
npm test           # streak, schedule, date and storage logic
npm run typecheck
npm run build      # -> dist/
npm run preview    # serve the built app, service worker and all
```

To try the installed behaviour on your own phone while developing, run
`npm run dev -- --host` and open the network URL — though iOS only offers **Add to Home Screen**
over HTTPS, so the Pages deploy is the real test.

### Layout

```
src/
  types.ts        habit, schedule and state shapes
  dates.ts        local-calendar day keys; deliberately never uses UTC
  habits.ts       scheduling, streaks, rates, day status, tracking-mode maths
  storage.ts      localStorage load/save; tolerant of corrupt data, migrates schema 1
  useAppState.ts  state, actions, and a clock that notices the day rolling over
  components/     Today, Habits, Progress, habit detail, habit editor, day editor, heatmap
scripts/
  make-icons.py   regenerates the PWA icons (no dependencies)
```

The icon set is generated rather than checked in by hand — edit the colours or artwork in
`scripts/make-icons.py` and run `python3 scripts/make-icons.py`.

### One number per day

Every tracking mode stores a single number per habit per day: `0`/`1` for a tick, the tally for a
count, the quantity for an amount, and a bitmask of finished slots for named times. `progressOn`
collapses all four to a `value` and a `target`, which is why the streak and rate code is identical
to when a check-in was a boolean — and why it stayed covered by the same tests.
