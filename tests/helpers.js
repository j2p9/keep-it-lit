import { addDays } from '../src/lib/dates.js';
import { checkinKey, makeLookup } from '../src/lib/streaks.js';

// 2026-11-02 is a Monday.
export const TODAY = '2026-11-02';

let n = 0;
export function goal(over = {}) {
  n += 1;
  return {
    id: `g${n}`,
    title: `Goal ${n}`,
    emoji: '🔥',
    target: 1,
    schedule: 'daily',
    days: [0, 1, 2, 3, 4, 5, 6],
    per_week: 3,
    start_on: addDays(TODAY, -30),
    ...over,
  };
}

/** Builds a check-in map. `days` maps 'YYYY-MM-DD' to a count, 'skip', or a full row patch. */
export function checkins(entries) {
  const map = {};
  for (const [g, days] of entries) {
    for (const [day, v] of Object.entries(days)) {
      const row = { goal_id: g.id, day, count: 0, skipped: false, completed_at: null };
      if (v === 'skip') row.skipped = true;
      else if (typeof v === 'number') row.count = v;
      else Object.assign(row, v);
      map[checkinKey(g.id, day)] = row;
    }
  }
  return { map, lookup: makeLookup(map), list: Object.values(map) };
}

/** `count` consecutive days starting at `from`, each set to `value`. */
export function run(from, count, value = 1) {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [addDays(from, i), value]));
}
