// The only goal data that leaves the phone: each current goal's streak and today's progress.
// The server uses it for smart reminders, and to bring streaks back on a new phone.
import { startOfWeek } from './dates.js';
import { fromCount } from './healthMetrics.js';
import { ALL_DAYS, isDone } from './schedule.js';

// Cut by characters, not UTF-16 units, so an emoji is never split in half.
const clip = (s, n) => Array.from(String(s || '')).slice(0, n).join('');

export function buildStreakRows({ goals, streaks, lookup, today, weekStart = 0 }) {
  return goals
    .filter((g) => !g.deleted_at && (!g.archived_on || g.archived_on > today))
    .map((g) => {
      const s = streaks.get(g.id);
      const c = lookup(g.id, today);
      const weekly = g.schedule === 'weekly';
      return {
        goal_id: g.id,
        title: clip(g.title, 60).trim() || 'Goal',
        emoji: clip(g.emoji, 16) || '🔥',
        schedule: g.schedule || 'daily',
        days: g.days?.length ? g.days : ALL_DAYS,
        per_week: Math.min(7, Math.max(1, g.per_week || 3)),
        unit: weekly ? 'week' : 'day',
        current: s?.current || 0,
        best: s?.best || 0,
        start_on: g.start_on,
        day: today,
        // "Nothing left to do today": done, or skipped on purpose.
        done_today: isDone(g, c) || Boolean(c?.skipped),
        week_of: weekly ? startOfWeek(today, weekStart) : null,
        week_done: weekly ? Math.min(7, s?.week?.done || 0) : 0,
        reminder_time: g.reminder_time || null,
        health_metric: g.health?.metric || null,
        health_target: g.health?.metric ? fromCount(g.health.metric, g.target) : null,
      };
    });
}
