import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates.js';
import { planRest } from '../src/lib/rest.js';
import { goalStreak } from '../src/lib/streaks.js';
import { TODAY, checkins, goal, run } from './helpers.js';

// TODAY (2026-11-02) is a Monday; weeks start on Monday here.
const d = (n) => addDays(TODAY, n);
const plan = (goals, lookup, { every = 7, amount = 1, max = 5, from = '2000-01-01', weekMark } = {}) =>
  planRest({ goals, lookup, today: TODAY, weekStart: 1, rules: [{ from, on: true, every, amount, max }], weekMark });
const streak = (g, lookup, rest, extra = {}) => goalStreak(g, lookup, TODAY, { freezes: false, weekStart: 1, rest, ...extra });

describe('Banked rest days', () => {
  it('earns them with perfect days and spends one on a missed day', () => {
    const a = goal({ start_on: d(-20) });
    const { lookup } = checkins([[a, { ...run(d(-20), 7), ...run(d(-12), 12) }]]);
    const p = plan([a], lookup);
    expect(p.days.has(d(-13))).toBe(true);
    expect(p.earnedOn).toEqual([d(-14), d(-6)]);
    expect(p.bank).toBe(1);
    const s = streak(a, lookup, p);
    expect(s.status.get(d(-13))).toBe('rest');
    expect(s.current).toBe(19);
  });

  it('lets you choose how many to earn, how often, and the most to keep', () => {
    const a = goal({ start_on: d(-12) });
    const { lookup } = checkins([[a, run(d(-12), 12)]]);
    expect(plan([a], lookup, { every: 3, amount: 2 }).bank).toBe(5); // 4 rewards of 2, kept at 5
    expect(plan([a], lookup, { every: 3, amount: 2, max: 10 }).bank).toBe(8);
    expect(plan([a], lookup, { every: 5 }).nextIn).toBe(3);
  });

  it('covers every goal missed that day with one rest day', () => {
    const a = goal({ start_on: d(-10) });
    const b = goal({ start_on: d(-10) });
    const { lookup } = checkins([
      [a, { ...run(d(-10), 7), ...run(d(-2), 2) }],
      [b, { ...run(d(-10), 7), ...run(d(-2), 2) }],
    ]);
    const p = plan([a, b], lookup);
    expect([...p.days]).toEqual([d(-3)]);
    expect(p.bank).toBe(0);
    expect(streak(a, lookup, p).current).toBe(9);
    expect(streak(b, lookup, p).current).toBe(9);
  });

  it('keeps sick days free', () => {
    const a = goal({ start_on: d(-10) });
    const { lookup } = checkins([[a, { ...run(d(-10), 7), [d(-3)]: { skipped: true, skip: 'sick' }, ...run(d(-2), 2) }]]);
    const p = plan([a], lookup);
    expect(p.days.size).toBe(0);
    expect(p.bank).toBe(1);
    expect(streak(a, lookup, p).status.get(d(-3))).toBe('skipped');
  });

  it('spends one straight away when you rest today on purpose', () => {
    const a = goal({ start_on: d(-7) });
    const { lookup } = checkins([[a, { ...run(d(-7), 7), [TODAY]: { skipped: true, skip: 'rest' } }]]);
    const p = plan([a], lookup);
    expect(p.days.has(TODAY)).toBe(true);
    expect(p.bank).toBe(0);
    expect(streak(a, lookup, p).status.get(TODAY)).toBe('rest');
  });

  it('only applies rules from the day they started, so the past stays as it was', () => {
    const a = goal({ start_on: d(-20) });
    const { lookup } = checkins([[a, { ...run(d(-20), 7), ...run(d(-12), 12) }]]);
    // Switched on 10 days ago: the miss on d(-13) stays a miss, and only later perfect days count.
    const p = plan([a], lookup, { from: d(-10) });
    expect(p.days.size).toBe(0);
    expect(p.earnedOn).toEqual([d(-4)]);
    expect(streak(a, lookup, p).status.get(d(-13))).toBe('missed');

    // A later change (every 3 days, 2 at a time) applies from its own day on.
    const rules = [
      { from: d(-10), on: true, every: 7, amount: 1, max: 5 },
      { from: d(-3), on: true, every: 3, amount: 2, max: 5 },
    ];
    const q = planRest({ goals: [a], lookup, today: TODAY, weekStart: 1, rules });
    expect(q.earnedOn).toEqual([d(-4), d(-1)]);
    expect(q.bank).toBe(3);

    // Switched off: nothing is earned or spent from then on, and what's banked stays.
    const off = [...rules, { from: d(-2), on: false, every: 3, amount: 2, max: 5 }];
    const r = planRest({ goals: [a], lookup, today: TODAY, weekStart: 1, rules: off });
    expect(r.bank).toBe(1);
    expect(r.nextIn).toBeNull();
  });

  it('counts a missed day as missed once no rest days are left', () => {
    const a = goal({ start_on: d(-5) });
    const { lookup } = checkins([[a, { ...run(d(-5), 3), ...run(d(-1), 1) }]]);
    const p = plan([a], lookup);
    expect(p.days.size).toBe(0);
    expect(streak(a, lookup, p).status.get(d(-2))).toBe('missed');
  });
});

describe('Rest weeks for weekly goals', () => {
  const daily = goal({ start_on: d(-21) });
  const tennis = goal({ schedule: 'weekly', per_week: 2, start_on: d(-21) });
  const entries = [
    [daily, run(d(-21), 21)],
    [tennis, { [d(-21)]: 1, [d(-19)]: 1, [d(-7)]: 1, [d(-5)]: 1 }],
  ];

  it('uses one rest day for a whole missed week', () => {
    const { lookup } = checkins(entries);
    const p = plan([daily, tennis], lookup);
    expect([...p.weeks]).toEqual([d(-14)]);
    const s = streak(tennis, lookup, p);
    expect(s.status.get(d(-14))).toBe('rest');
    expect(s.current).toBe(2);
  });

  it('pauses a week marked sick for free', () => {
    const { lookup } = checkins(entries);
    const weekMark = (id, wk) => (id === tennis.id && wk === d(-14) ? 'sick' : null);
    const p = plan([daily, tennis], lookup, { weekMark });
    expect(p.weeks.size).toBe(0);
    const s = streak(tennis, lookup, p, { weekMark });
    expect(s.status.get(d(-14))).toBe('skipped');
    expect(s.current).toBe(2);
  });
});
