// Seeded sample data for previewing the app on localhost (?demo). Never used in production.
import { addDays, fromKey } from './dates.js';
import { checkinKey } from './streaks.js';

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (day, hour) => {
  const d = fromKey(day);
  d.setHours(hour, Math.floor(hour * 7) % 60);
  return d.toISOString();
};

export function makeDemo(today, { fresh = false } = {}) {
  const profile = {
    id: 'demo',
    display_name: 'Alex',
    timezone: 'UTC',
    settings: { onboarded: !fresh, theme: 'auto', weekStart: 0, dayEndHour: 0, freezes: true },
    stats: {},
    reminder_checkin_enabled: true,
    reminder_checkin_time: '15:00',
    reminder_saver_enabled: true,
    reminder_saver_time: '21:00',
    reminder_morning_enabled: false,
    reminder_morning_time: '08:00',
    created_at: new Date(fromKey(addDays(today, -92)).getTime() + 9 * 3600e3).toISOString(),
  };
  if (fresh) return { profile, goals: {}, checkins: {}, notes: {}, achievements: {}, challenges: {} };

  const defs = [
    { id: 'demo-water', title: 'Drink water', emoji: '💧', color: 'blue', target: 8, unit: 'glasses', rate: 0.93, hour: 18 },
    { id: 'demo-meditate', title: 'Meditate', emoji: '🧘', color: 'teal', time_of_day: 'morning', rate: 0.9, hour: 7 },
    { id: 'demo-read', title: 'Read', emoji: '📖', color: 'purple', target: 10, unit: 'pages', time_of_day: 'evening', rate: 0.85, hour: 21 },
    { id: 'demo-run', title: 'Morning run', emoji: '🏃', color: 'flame', schedule: 'weekdays', days: [1, 3, 5], time_of_day: 'morning', rate: 0.88, hour: 6 },
    { id: 'demo-gym', title: 'Strength training', emoji: '🏋️', color: 'red', schedule: 'weekly', per_week: 3, rate: 0.55, hour: 17 },
    { id: 'demo-phone', title: 'No phone in bed', emoji: '📵', color: 'indigo', time_of_day: 'evening', rate: 0.82, hour: 22, since: 24 },
  ];
  const rand = seeded(7);
  const goals = {};
  const checkins = {};
  defs.forEach((d, i) => {
    const g = {
      id: d.id,
      user_id: 'demo',
      title: d.title,
      emoji: d.emoji,
      color: d.color,
      target: d.target || 1,
      unit: d.unit || null,
      schedule: d.schedule || 'daily',
      days: d.days || [0, 1, 2, 3, 4, 5, 6],
      per_week: d.per_week || 3,
      time_of_day: d.time_of_day || 'anytime',
      reminder_time: null,
      sort_order: i,
      start_on: addDays(today, -(d.since || 90)),
      archived_on: null,
      deleted_at: null,
      created_at: at(addDays(today, -(d.since || 90)), 9),
    };
    goals[g.id] = g;
    for (let day = g.start_on; day < today; day = addDays(day, 1)) {
      const recent = day >= addDays(today, -11) && d.rate > 0.8; // a solid recent run so streaks show
      const r = rand();
      const key = checkinKey(g.id, day);
      if (recent || r < d.rate) {
        checkins[key] = { goal_id: g.id, day, user_id: 'demo', count: g.target, skipped: false, completed_at: at(day, d.hour) };
      } else if (r > 0.97) {
        checkins[key] = { goal_id: g.id, day, user_id: 'demo', count: 0, skipped: true, completed_at: null };
      }
    }
  });
  // Today, part-way through.
  checkins[checkinKey('demo-meditate', today)] = { goal_id: 'demo-meditate', day: today, user_id: 'demo', count: 1, skipped: false, completed_at: new Date().toISOString() };
  checkins[checkinKey('demo-water', today)] = { goal_id: 'demo-water', day: today, user_id: 'demo', count: 5, skipped: false, completed_at: null };
  const notes = {
    [addDays(today, -1)]: { user_id: 'demo', day: addDays(today, -1), note: 'Great run by the river.', mood: 5 },
  };
  return { profile, goals, checkins, notes, achievements: {}, challenges: {} };
}
