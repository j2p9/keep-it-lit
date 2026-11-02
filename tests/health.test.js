import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates.js';
import { fromCount, healthCount, healthProgressLabel, healthUpdates, metricNumber, toCount } from '../src/lib/healthMetrics.js';
import { buildStreakRows } from '../src/lib/cloudstreaks.js';
import { goalStreak } from '../src/lib/streaks.js';
import { localCopyComplete } from '../src/lib/migrate.js';
import { TODAY, checkins, goal, run } from './helpers.js';

describe('Health numbers', () => {
  it('counts sleep in minutes and everything else as is', () => {
    expect(toCount('sleep', 7.5)).toBe(450);
    expect(fromCount('sleep', 450)).toBe(7.5);
    expect(toCount('steps', 8432.4)).toBe(8432);
    expect(toCount('steps', -5)).toBe(0);
    expect(metricNumber('steps', 10000)).toBe((10000).toLocaleString());
    expect(metricNumber('sleep', 425 / 60)).toBe('7.1');
  });

  it('labels progress in Health units', () => {
    const steps = goal({ target: 10000, health: { metric: 'steps' } });
    expect(healthProgressLabel(steps, 8432)).toBe(`${(8432).toLocaleString()} / ${(10000).toLocaleString()} steps`);
    const sleep = goal({ target: 420, health: { metric: 'sleep' } });
    expect(healthProgressLabel(sleep, 390)).toBe('6.5 / 7 h');
  });

  it('reads the count for a linked goal only', () => {
    expect(healthCount(goal({ health: { metric: 'steps' } }), { steps: 900 })).toBe(900);
    expect(healthCount(goal({ health: { metric: 'steps' } }), { exercise: 9 })).toBeNull();
    expect(healthCount(goal(), { steps: 900 })).toBeNull();
  });

  it('raises linked goals but never lowers a count', () => {
    const steps = goal({ target: 10000, health: { metric: 'steps' } });
    const mind = goal({ target: 10, health: { metric: 'mindful' } });
    const plain = goal({ target: 1 });
    const { lookup } = checkins([[mind, { [TODAY]: 15 }]]);
    const out = healthUpdates([steps, mind, plain], lookup, TODAY, { steps: 12000, mindful: 12 });
    expect(out).toEqual([{ goal: steps, count: 12000 }]);
  });

  it('leaves skipped, not-due and not-started days alone', () => {
    const skipped = goal({ target: 10000, health: { metric: 'steps' } });
    const weekend = goal({ target: 10000, schedule: 'weekdays', days: [0, 6], health: { metric: 'steps' } });
    const later = goal({ target: 10000, start_on: addDays(TODAY, 1), health: { metric: 'steps' } });
    const weekly = goal({ target: 30, schedule: 'weekly', per_week: 3, health: { metric: 'exercise' } });
    const { lookup } = checkins([[skipped, { [TODAY]: 'skip' }]]);
    const out = healthUpdates([skipped, weekend, later, weekly], lookup, TODAY, { steps: 12000, exercise: 45 });
    expect(out).toEqual([{ goal: weekly, count: 45 }]);
  });
});

describe('Streak rows for the cloud', () => {
  const opts = (goals, c) => {
    const streaks = new Map(goals.map((g) => [g.id, goalStreak(g, c.lookup, TODAY)]));
    return { goals, streaks, lookup: c.lookup, today: TODAY, weekStart: 1 };
  };

  it('sends streaks and today’s progress, without archived or deleted goals', () => {
    const a = goal({ title: 'Read', emoji: '📚', reminder_time: '20:00' });
    const b = goal();
    const gone = goal({ deleted_at: '2026-10-01T00:00:00Z' });
    const old = goal({ archived_on: TODAY });
    const later = goal({ archived_on: addDays(TODAY, 3) });
    const c = checkins([
      [a, { ...run(addDays(TODAY, -5), 6) }],
      [b, { [TODAY]: 'skip' }],
    ]);
    const rows = buildStreakRows(opts([a, b, gone, old, later], c));
    expect(rows.map((r) => r.goal_id)).toEqual([a.id, b.id, later.id]);
    expect(rows[0]).toMatchObject({
      title: 'Read',
      emoji: '📚',
      unit: 'day',
      current: 6,
      best: 6,
      day: TODAY,
      done_today: true,
      reminder_time: '20:00',
      health_metric: null,
      health_target: null,
      week_of: null,
    });
    expect(rows[1].done_today).toBe(true); // skipped: nothing left to do
    expect(rows[2].done_today).toBe(false);
  });

  it('describes weekly goals by their week', () => {
    const w = goal({ schedule: 'weekly', per_week: 3, start_on: addDays(TODAY, -21) });
    const c = checkins([[w, { [TODAY]: 1 }]]);
    const [row] = buildStreakRows(opts([w], c));
    expect(row).toMatchObject({ unit: 'week', week_of: TODAY, week_done: 1, done_today: true });
  });

  it('sends Health targets in Health units, and keeps titles in bounds', () => {
    const sleep = goal({ target: 450, health: { metric: 'sleep' }, title: '😴'.repeat(70) });
    const [row] = buildStreakRows(opts([sleep], checkins([])));
    expect(row.health_metric).toBe('sleep');
    expect(row.health_target).toBe(7.5);
    expect(Array.from(row.title)).toHaveLength(60);
    expect(row.title.endsWith('😴')).toBe(true);
  });
});

describe('Moving to local-only', () => {
  const legacy = {
    goals: [{ id: 'g1' }, { id: 'g2' }],
    checkins: [{ goal_id: 'g1', day: TODAY }],
    day_notes: [{ day: TODAY }],
    achievements: [{ award_key: 'first' }],
    challenges: [{ month: '2026-11-01' }],
  };
  const snap = {
    goals: { g1: {}, g2: {} },
    checkins: { [`g1|${TODAY}`]: {} },
    notes: { [TODAY]: {} },
    achievements: { first: {} },
    challenges: { '2026-11-01': {} },
  };

  it('only lets the cloud copy go once the phone holds every row', () => {
    expect(localCopyComplete(legacy, snap)).toBe(true);
    expect(localCopyComplete(legacy, { ...snap, goals: { g1: {} } })).toBe(false);
    expect(localCopyComplete(legacy, { ...snap, checkins: {} })).toBe(false);
    expect(localCopyComplete(legacy, { ...snap, notes: undefined })).toBe(false);
    expect(localCopyComplete(legacy, null)).toBe(false);
    expect(localCopyComplete(null, snap)).toBe(false);
    expect(localCopyComplete({ goals: [], checkins: [] }, { goals: {} })).toBe(true);
  });
});
