import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates.js';
import { goalStreak, isAtRisk, nextMilestone } from '../src/lib/streaks.js';
import { TODAY, checkins, goal, run } from './helpers.js';

const ago = (n) => addDays(TODAY, -n);

describe('daily goal streaks', () => {
  it('keeps the streak alive while today is still pending', () => {
    const g = goal({ start_on: ago(5) });
    const { lookup } = checkins([[g, run(ago(5), 5)]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.current).toBe(5);
    expect(s.status.get(TODAY)).toBe('pending');
  });

  it('adds today once it is done', () => {
    const g = goal({ start_on: ago(5) });
    const { lookup } = checkins([[g, run(ago(5), 6)]]);
    expect(goalStreak(g, lookup, TODAY).current).toBe(6);
  });

  it('breaks after a missed day with no freeze banked', () => {
    const g = goal({ start_on: ago(6) });
    const { lookup } = checkins([[g, { ...run(ago(6), 3), ...run(ago(2), 2) }]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.status.get(ago(3))).toBe('missed');
    expect(s.current).toBe(2);
    expect(s.best).toBe(3);
  });

  it('earns a freeze every 7 days and spends it on a miss', () => {
    const g = goal({ start_on: ago(10) });
    // 7 done, 1 missed, 2 done (yesterday included), today pending.
    const { lookup } = checkins([[g, { ...run(ago(10), 7), ...run(ago(2), 2) }]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.status.get(ago(3))).toBe('frozen');
    expect(s.current).toBe(9);
    expect(s.freezes).toBe(0);
    expect(s.firstFrozen).toBe(ago(3));
  });

  it('caps banked freezes at 2', () => {
    const g = goal({ start_on: ago(28) });
    const { lookup } = checkins([[g, run(ago(28), 28)]]);
    expect(goalStreak(g, lookup, TODAY).freezes).toBe(2);
  });

  it('breaks on a miss when freezes are turned off', () => {
    const g = goal({ start_on: ago(10) });
    const { lookup } = checkins([[g, { ...run(ago(10), 7), ...run(ago(2), 2) }]]);
    expect(goalStreak(g, lookup, TODAY, { freezes: false }).current).toBe(2);
  });

  it('treats skipped days as neutral', () => {
    const g = goal({ start_on: ago(7) });
    const { lookup } = checkins([[g, { ...run(ago(7), 3), [ago(4)]: 'skip', ...run(ago(3), 3) }]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.status.get(ago(4))).toBe('skipped');
    expect(s.current).toBe(6);
  });

  it('only counts scheduled weekdays', () => {
    // Mon/Wed/Fri. TODAY is Monday; the last two scheduled days were Fri and Wed.
    const g = goal({ schedule: 'weekdays', days: [1, 3, 5], start_on: ago(14) });
    const done = {};
    for (let i = 14; i >= 1; i -= 1) {
      const d = ago(i);
      if ([1, 3, 5].includes(new Date(`${d}T12:00`).getDay())) done[d] = 1;
    }
    const { lookup } = checkins([[g, done]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.current).toBe(6);
    expect(s.status.get(ago(1))).toBe('off');
  });

  it('needs the full target on counted goals', () => {
    const g = goal({ target: 8, start_on: ago(2) });
    const { lookup } = checkins([[g, { [ago(2)]: 8, [ago(1)]: 5 }]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.status.get(ago(2))).toBe('done');
    expect(s.status.get(ago(1))).toBe('missed');
    expect(s.current).toBe(0);
  });

  it('stops counting at the archive date', () => {
    const g = goal({ start_on: ago(10), archived_on: ago(4) });
    const { lookup } = checkins([[g, run(ago(10), 6)]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(s.current).toBe(6);
    expect(s.status.has(ago(3))).toBe(false);
  });

  it('records milestone days and comebacks', () => {
    const g = goal({ start_on: ago(20) });
    // 7 done, freezes off -> miss breaks, then 7 done again.
    const { lookup } = checkins([[g, { ...run(ago(20), 7), ...run(ago(12), 7) }]]);
    const s = goalStreak(g, lookup, TODAY, { freezes: false });
    expect(s.milestones[3]).toBe(ago(18));
    expect(s.milestones[7]).toBe(ago(14));
    expect(s.comebackOn).toBe(ago(6));
  });
});

describe('weekly goal streaks', () => {
  it('counts weeks where the target was met and keeps this week pending', () => {
    // Week starts Sunday. TODAY (Mon 2 Nov) is in the week of Sun 1 Nov.
    const g = goal({ schedule: 'weekly', per_week: 3, start_on: '2026-10-18' });
    const days = {
      '2026-10-19': 1,
      '2026-10-21': 1,
      '2026-10-23': 1,
      '2026-10-26': 1,
      '2026-10-27': 1,
      '2026-10-30': 1,
      '2026-11-01': 1,
    };
    const { lookup } = checkins([[g, days]]);
    const s = goalStreak(g, lookup, TODAY, { weekStart: 0 });
    expect(s.unit).toBe('week');
    expect(s.current).toBe(2);
    expect(s.status.get('2026-11-01')).toBe('pending');
    expect(s.week).toEqual({ done: 1, required: 3, skipped: 0 });
  });

  it('resets after a short week when no freeze is banked', () => {
    const g = goal({ schedule: 'weekly', per_week: 2, start_on: '2026-10-18' });
    const { lookup } = checkins([[g, { '2026-10-19': 1, '2026-10-20': 1, '2026-10-27': 1 }]]);
    const s = goalStreak(g, lookup, TODAY, { weekStart: 0 });
    expect(s.status.get('2026-10-25')).toBe('missed');
    expect(s.current).toBe(0);
  });

  it('only asks for what is possible in a partial first week', () => {
    // Starts Friday 30 Oct: two days left in that week, so 2 of 3 is enough.
    const g = goal({ schedule: 'weekly', per_week: 3, start_on: '2026-10-30' });
    const { lookup } = checkins([[g, { '2026-10-30': 1, '2026-10-31': 1 }]]);
    const s = goalStreak(g, lookup, TODAY, { weekStart: 0 });
    expect(s.status.get('2026-10-25')).toBe('done');
    expect(s.current).toBe(1);
  });
});

describe('at-risk and milestones', () => {
  it('shows the hourglass only in the last hours on a live, undone streak', () => {
    const g = goal({ start_on: ago(3) });
    const { lookup } = checkins([[g, run(ago(3), 3)]]);
    const s = goalStreak(g, lookup, TODAY);
    expect(isAtRisk(g, s, TODAY, false, 3)).toBe(true);
    expect(isAtRisk(g, s, TODAY, false, 6)).toBe(false);
    expect(isAtRisk(g, s, TODAY, true, 3)).toBe(false);
  });

  it('points at the next streak milestone', () => {
    expect(nextMilestone({ unit: 'day', current: 12 })).toEqual({ target: 14, left: 2 });
    expect(nextMilestone({ unit: 'week', current: 4 })).toEqual({ target: 12, left: 8 });
  });
});
