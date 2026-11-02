import { METRIC, toCount, unitFor } from './healthMetrics.js';
import { targetLabel } from './schedule.js';

// One-tap starting points, so setup takes seconds instead of typing.
export const TEMPLATES = [
  { title: 'Drink water', emoji: '💧', color: 'blue', target: 8, unit: 'glasses', time_of_day: 'anytime' },
  { title: 'Exercise', emoji: '🏃', color: 'flame', target: 1, time_of_day: 'afternoon', hint: '30 minutes' },
  { title: 'Read', emoji: '📖', color: 'purple', target: 10, unit: 'pages', time_of_day: 'evening' },
  { title: 'Meditate', emoji: '🧘', color: 'teal', target: 1, time_of_day: 'morning', hint: '10 minutes' },
  { title: 'Walk 10k steps', emoji: '🚶', color: 'green', target: 1, time_of_day: 'anytime' },
  { title: 'In bed by 11', emoji: '😴', color: 'indigo', target: 1, time_of_day: 'evening' },
  { title: 'Eat healthy', emoji: '🥗', color: 'lime', target: 1, time_of_day: 'anytime' },
  { title: 'No phone in bed', emoji: '📵', color: 'cyan', target: 1, time_of_day: 'evening' },
  { title: 'Gratitude', emoji: '🙏', color: 'yellow', target: 3, unit: 'things', time_of_day: 'morning' },
  { title: 'Take vitamins', emoji: '💊', color: 'pink', target: 1, time_of_day: 'morning' },
  { title: 'Journal', emoji: '📝', color: 'brown', target: 1, time_of_day: 'evening' },
  { title: 'Floss', emoji: '🦷', color: 'cyan', target: 1, time_of_day: 'evening' },
  { title: 'Wake up early', emoji: '🌅', color: 'yellow', target: 1, time_of_day: 'morning' },
  { title: 'Learn something', emoji: '🧠', color: 'indigo', target: 1, time_of_day: 'anytime', hint: '15 minutes' },
  { title: 'Strength training', emoji: '🏋️', color: 'red', target: 1, schedule: 'weekly', per_week: 3, time_of_day: 'anytime' },
  { title: 'No sugar', emoji: '🍬', color: 'pink', target: 1, time_of_day: 'anytime' },
  { title: 'Sleep 7 hours', emoji: '💤', color: 'indigo', target: 1, time_of_day: 'morning' },
];

// With Apple Health connected, these fill in and check themselves off.
const HEALTH_LINKS = { 'Walk 10k steps': 'steps', Exercise: 'exercise', Meditate: 'mindful', 'Sleep 7 hours': 'sleep' };

export function withHealth(t, connected) {
  const metric = connected && HEALTH_LINKS[t.title];
  if (!metric) return t;
  return { ...t, health: { metric }, target: toCount(metric, METRIC[metric].target), unit: unitFor(metric), hint: null };
}

/** The small line under a template: "8 glasses", "3× a week", "❤️ 10,000 steps". */
export function templateHint(t) {
  if (t.health) return `❤️ ${targetLabel(t)}`;
  if (t.schedule === 'weekly') return `${t.per_week}× a week`;
  if (t.target > 1) return `${t.target} ${t.unit}`;
  return t.hint || 'Every day';
}

export const EMOJIS = [
  '🔥', '💧', '🏃', '📖', '🧘', '🚶', '😴', '🥗', '📵', '🙏', '💊', '📝', '🦷', '🌅', '🧠', '🏋️',
  '🚴', '🏊', '🤸', '🥾', '🎯', '💪', '🍎', '🥦', '☕', '🚭', '🍬', '🛏️', '🧴', '🎸', '🎨', '✍️',
  '💻', '📞', '❤️', '🌱', '🐶', '🧹', '💰', '📈', '🗣️', '🎧', '🌿', '🌞', '🕯️', '🚿', '🧊', '⭐',
];
