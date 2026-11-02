import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates.js';
import { evaluateAwards, newAwards } from '../src/lib/awards.js';
import { challengeTarget } from '../src/lib/challenge.js';
import { goalStreak } from '../src/lib/streaks.js';
import { daySummary, habitStrength, periodStats } from '../src/lib/stats.js';
import { TODAY, checkins, goal, run } from './helpers.js';

const ago = (n) => addDays(TODAY, -n);

function evaluate(goals, entries, extra = {}) {
  const { lookup, list } = checkins(entries);
  const streaks = new Map(goals.map((g) => [g.id, goalStreak(g, lookup, TODAY)]));
  return evaluateAwards({ goals, checkinsList: list, lookup, today: TODAY, streaks, weekStart: 0, ...extra });
}

describe('day summaries', () => {
  it('counts partial progress on counted goals and skips', () => {
    const a = goal({ target: 8, start_on: ago(1) });
    const b = goal({ start_on: ago(1) });
    const c = goal({ start_on: ago(1) });
    const { lookup } = checkins([[a, { [TODAY]: 4 }], [b, { [TODAY]: 1 }], [c, { [TODAY]: 'skip' }]]);
    const s = daySummary([a, b, c], lookup, TODAY);
    expect(s).toMatchObject({ due: 2, done: 1, skipped: 1, perfect: false });
    expect(s.fill).toBeCloseTo(0.75);
  });

  it('adds up a period', () => {
    const a = goal({ start_on: ago(6) });
    const { lookup } = checkins([[a, run(ago(6), 5)]]);
    const p = periodStats([a], lookup, ago(6), TODAY);
    expect(p).toMatchObject({ due: 7, done: 5, perfect: 5 });
  });

  it('grows habit strength with done days', () => {
    const a = goal({ start_on: ago(29) });
    const { lookup } = checkins([[a, run(ago(29), 29)]]);
    expect(habitStrength(goalStreak(a, lookup, TODAY))).toBeGreaterThan(0.9);
  });
});

describe('awards', () => {
  it('awards per-goal streak milestones on the day they were reached', () => {
    const a = goal({ start_on: ago(10) });
    const { earned } = evaluate([a], [[a, run(ago(10), 10)]]);
    expect(earned.get(`streak-3:${a.id}`)).toBe(ago(8));
    expect(earned.get(`streak-7:${a.id}`)).toBe(ago(4));
    expect(earned.has(`streak-14:${a.id}`)).toBe(false);
  });

  it('awards perfect days, check-in milestones and getting started', () => {
    const a = goal({ start_on: ago(9) });
    const b = goal({ start_on: ago(9) });
    const { earned, stats } = evaluate([a, b], [[a, run(ago(9), 10)], [b, run(ago(9), 10)]]);
    expect(earned.get('getting-started')).toBe(ago(9));
    expect(earned.get('perfect-1')).toBe(ago(9));
    expect(earned.get('perfect-10')).toBe(TODAY);
    expect(earned.get('checkins-1')).toBe(ago(9));
    expect(stats.perfectDays).toBe(10);
    expect(stats.checkins).toBe(20);
    expect(earned.get('unstoppable')).toBe(TODAY);
  });

  it('awards a perfect week only for a fully tracked, clean week', () => {
    // Week of Sun 25 Oct – Sat 31 Oct, goal started before it.
    const a = goal({ start_on: '2026-10-20' });
    const { earned } = evaluate([a], [[a, run('2026-10-25', 7)]]);
    expect(earned.get('perfect-week:2026-10-25')).toBe('2026-10-31');
    expect(earned.has('perfect-week:2026-10-18')).toBe(false);
  });

  it('gives Early Bird when everything was done before 9 AM that day', () => {
    const a = goal({ start_on: ago(1) });
    const early = new Date(2026, 9, 31 + 1, 7, 45).toISOString(); // 1 Nov, 7:45 local
    const { earned } = evaluate([a], [[a, { [ago(1)]: { count: 1, completed_at: early } }]]);
    expect(earned.get('early-bird')).toBe(ago(1));
  });

  it('does not count a 2 AM check-off as an early bird', () => {
    const a = goal({ start_on: ago(1) });
    const late = new Date(2026, 10, 1, 2, 10).toISOString();
    const { earned } = evaluate([a], [[a, { [ago(1)]: { count: 1, completed_at: late } }]]);
    expect(earned.has('early-bird')).toBe(false);
  });

  it('awards On Fire when three goals are on 7-day streaks together', () => {
    const goals = [goal({ start_on: ago(8) }), goal({ start_on: ago(8) }), goal({ start_on: ago(8) })];
    const { earned } = evaluate(goals, goals.map((g) => [g, run(ago(8), 8)]));
    expect(earned.get('on-fire')).toBe(ago(2));
  });

  it('awards the monthly challenge when the target is reached', () => {
    const a = goal({ start_on: '2026-10-20' });
    const { earned } = evaluate([a], [[a, run('2026-11-01', 2)]], {
      challenges: [{ month: '2026-11-01', target: 2 }],
    });
    expect(earned.get('challenge:2026-11')).toBe(TODAY);
  });

  it('takes an award away again when the check-offs behind it are undone', () => {
    const a = goal({ start_on: TODAY });
    const b = goal({ start_on: TODAY });
    const done = evaluate([a, b], [[a, { [TODAY]: 1 }], [b, { [TODAY]: 1 }]]).earned;
    expect(done.get('perfect-1')).toBe(TODAY);
    expect(done.get('checkins-1')).toBe(TODAY);
    const undone = evaluate([a, b], [[a, { [TODAY]: 0 }], [b, { [TODAY]: 0 }]]).earned;
    expect(undone.has('perfect-1')).toBe(false);
    expect(undone.has('checkins-1')).toBe(false);
  });

  it('only reports awards that are not stored yet', () => {
    const earned = new Map([
      ['perfect-1', ago(3)],
      ['checkins-1', ago(3)],
    ]);
    expect(newAwards(new Set(['perfect-1']), earned)).toEqual([{ award_key: 'checkins-1', earned_on: ago(3) }]);
  });
});

describe('monthly challenge target', () => {
  it('starts newcomers at 10, capped by the days left', () => {
    const a = goal({ start_on: TODAY });
    const { lookup } = checkins([[a, {}]]);
    expect(challengeTarget({ goals: [a], lookup, today: TODAY, first: TODAY }).target).toBe(10);
    expect(challengeTarget({ goals: [a], lookup, today: '2026-11-27', first: TODAY }).target).toBe(4);
  });

  it('aims a little above last month’s pace', () => {
    const a = goal({ start_on: '2026-10-01' });
    const { lookup } = checkins([[a, run('2026-10-01', 20)]]);
    // 20 of 31 days perfect -> pace ~19.4 over 30 days -> target 22.
    expect(challengeTarget({ goals: [a], lookup, today: TODAY, first: '2026-10-01' }).target).toBe(22);
  });
});
