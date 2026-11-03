import { describe, expect, it } from 'vitest';
import { evaluateAwards, goalShelf } from '../src/lib/awards.js';
import { addDays, dayEndsAt, effectiveToday, hoursLeft } from '../src/lib/dates.js';
import { goalsForDay, historyStart } from '../src/lib/schedule.js';
import { daySummary } from '../src/lib/stats.js';
import { goalStreak } from '../src/lib/streaks.js';
import { TODAY, checkins, goal, run } from './helpers.js';

const d = (n) => addDays(TODAY, n);

describe('Awards per goal', () => {
  it('gives each goal its own times-done medals, on the day of the nth check-off', () => {
    const read = goal({ start_on: d(-40) });
    const walk = goal({ start_on: d(-40) });
    const { lookup, list } = checkins([
      [read, run(d(-29), 27)],
      [walk, run(d(-9), 10)],
    ]);
    const streaks = new Map([read, walk].map((g) => [g.id, goalStreak(g, lookup, TODAY)]));
    const { earned, stats } = evaluateAwards({ goals: [read, walk], checkinsList: list, lookup, today: TODAY, streaks });
    expect(earned.get(`done-10:${read.id}`)).toBe(d(-20));
    expect(earned.get(`done-25:${read.id}`)).toBe(d(-5));
    expect(earned.has(`done-50:${read.id}`)).toBe(false);
    expect(earned.get(`done-10:${walk.id}`)).toBe(d(0));
    expect(stats.goalDone.get(read.id)).toBe(27);

    const shelf = goalShelf(read, streaks.get(read.id), earned, stats.goalDone.get(read.id));
    expect(shelf.map((x) => x.def.id).slice(0, 3)).toEqual(['streak-3', 'streak-7', 'streak-14']);
    const done50 = shelf.find((x) => x.def.id === 'done-50');
    expect(done50).toMatchObject({ day: null, progress: [27, 50] });
    expect(shelf.find((x) => x.def.id === 'streak-14').day).toBe(d(-16));
  });

  it('uses week medals on a weekly goal’s shelf', () => {
    const w = goal({ schedule: 'weekly', per_week: 2 });
    const shelf = goalShelf(w, null, new Map(), 0);
    expect(shelf[0].def.id).toBe('wstreak-4');
    expect(shelf.some((x) => x.def.id.startsWith('streak-'))).toBe(false);
  });
});

describe('Goals on a day', () => {
  it('splits goals into due, weekly and added later', () => {
    const daily = goal({ start_on: d(-10) });
    const weekends = goal({ schedule: 'weekdays', days: [0, 6], start_on: d(-10) });
    const weekly = goal({ schedule: 'weekly', start_on: d(-10) });
    const newer = goal({ start_on: TODAY, added_on: TODAY });
    const gone = goal({ start_on: d(-10), archived_on: d(-3) });
    const { due, weekly: w, later } = goalsForDay([daily, weekends, weekly, newer, gone], d(-1));
    // d(-1) is a Sunday.
    expect(due).toEqual([daily, weekends]);
    expect(w).toEqual([weekly]);
    expect(later).toEqual([newer]);
    expect(goalsForDay([gone], d(-4)).due).toEqual([gone]);
  });

  it('lists a filled-in goal normally, and its unfilled days as added later', () => {
    const g = goal({ start_on: d(-3), added_on: TODAY });
    const { lookup } = checkins([[g, { [d(-3)]: 1 }]]);
    expect(goalsForDay([g], d(-3), lookup).due).toEqual([g]);
    expect(goalsForDay([g], d(-2), lookup).later).toEqual([g]);
    expect(goalsForDay([g], TODAY, lookup).due).toEqual([g]);
  });
});

describe('Filling in a goal added later', () => {
  const old = goal({ start_on: d(-20) });
  const added = goal({ start_on: d(-5), added_on: TODAY });
  const { lookup } = checkins([
    [old, run(d(-20), 20)],
    [added, { [d(-5)]: 1 }],
  ]);

  it('counts the filled-in day, and leaves the other days as they were', () => {
    const filled = daySummary([old, added], lookup, d(-5));
    expect(filled).toMatchObject({ due: 2, done: 2, perfect: true });
    const gap = daySummary([old, added], lookup, d(-3));
    expect(gap).toMatchObject({ due: 1, done: 1, perfect: true });
  });

  it('counts the days in between as missed for that goal', () => {
    const s = goalStreak(added, lookup, TODAY, { freezes: false });
    expect(s.status.get(d(-5))).toBe('done');
    expect(s.status.get(d(-4))).toBe('missed');
    expect(s.current).toBe(0);
    expect(s.best).toBe(1);
  });

  it('starts the history at the earliest day it was done', () => {
    expect(historyStart(added, [d(-5), d(-9), d(-7)])).toBe(d(-9));
    expect(historyStart(added, [])).toBe(TODAY);
    // Older goals without added_on keep their start.
    expect(historyStart(old, [])).toBe(d(-20));
  });
});

describe('Starting the next day early', () => {
  const lateNight = new Date(2026, 10, 3, 0, 30); // 12:30 AM on Nov 3

  it('stays on the previous day until the day-end hour', () => {
    expect(effectiveToday(lateNight, 2)).toBe('2026-11-02');
    expect(effectiveToday(lateNight, 0)).toBe('2026-11-03');
  });

  it('moves to the new date once it is started', () => {
    expect(effectiveToday(lateNight, 2, '2026-11-03')).toBe('2026-11-03');
    // An old or future start is ignored.
    expect(effectiveToday(lateNight, 2, '2026-11-01')).toBe('2026-11-02');
    expect(effectiveToday(lateNight, 2, '2026-11-04')).toBe('2026-11-02');
  });

  it('works out when each day ends', () => {
    expect(dayEndsAt('2026-11-03', 2)).toEqual(new Date(2026, 10, 4, 2));
    expect(hoursLeft(lateNight, 2)).toBeCloseTo(1.5);
    expect((dayEndsAt('2026-11-03', 2) - lateNight) / 3600000).toBeCloseTo(25.5);
  });
});
