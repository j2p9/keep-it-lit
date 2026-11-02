// Apple Health numbers a goal can follow. Values arrive from the user's Shortcut in these units.
// A linked goal counts in whole numbers: sleep is counted in minutes so 7.5 h stays exact.
import { isActiveOn, isDueOn } from './schedule.js';

export const HEALTH_METRICS = [
  { key: 'steps', label: 'Steps', short: 'Steps', unit: 'steps', target: 10000, emoji: '👟', title: 'Walk 10k steps' },
  { key: 'exercise', label: 'Exercise', short: 'Exercise', unit: 'min', target: 30, emoji: '🏃', title: 'Exercise 30 minutes' },
  { key: 'active', label: 'Active calories', short: 'Active', unit: 'kcal', target: 500, emoji: '🔥', title: 'Burn 500 calories' },
  { key: 'mindful', label: 'Mindful minutes', short: 'Mindful', unit: 'min', target: 10, emoji: '🧘', title: 'Meditate' },
  { key: 'sleep', label: 'Sleep', short: 'Sleep', unit: 'h', target: 7, emoji: '💤', title: 'Sleep 7 hours' },
  { key: 'water', label: 'Water', short: 'Water', unit: 'mL', target: 2000, emoji: '💧', title: 'Drink 2 L of water' },
  { key: 'workouts', label: 'Workouts', short: 'Workouts', unit: 'workouts', target: 1, emoji: '🏋️', title: 'Work out' },
];
export const METRIC = Object.fromEntries(HEALTH_METRICS.map((m) => [m.key, m]));

/** Health value (in the metric's unit) → goal count. */
export const toCount = (metric, value) => Math.max(0, Math.round(metric === 'sleep' ? value * 60 : value));

/** Goal count → Health value (in the metric's unit). */
export const fromCount = (metric, count) => (metric === 'sleep' ? count / 60 : count);

/** The unit a linked goal counts in (sleep counts minutes). */
export const unitFor = (metric) => (metric === 'sleep' ? 'min' : METRIC[metric]?.unit || null);

const oneDecimal = (v) => Math.round(v * 10) / 10;

/** The bare number for display: "8,432", "7.5". */
export function metricNumber(metric, value) {
  if (value == null || Number.isNaN(Number(value))) return '–';
  const n = Number(value);
  return METRIC[metric]?.unit === 'h' ? String(oneDecimal(n)) : Math.round(n).toLocaleString();
}

/** A Health value with its unit: "8,432 steps", "7.5 h", "1,500 mL". */
export function formatMetric(metric, value) {
  const unit = METRIC[metric]?.unit;
  if (value == null) return '–';
  if (unit === 'workouts') return `${metricNumber(metric, value)} ${Number(value) === 1 ? 'workout' : 'workouts'}`;
  return `${metricNumber(metric, value)} ${unit}`;
}

/** "8,432 / 10,000 steps" for a goal linked to Health; `count` is in goal units. */
export function healthProgressLabel(goal, count) {
  const metric = goal.health.metric;
  const show = (c) => metricNumber(metric, fromCount(metric, c));
  return `${show(count || 0)} / ${show(goal.target)} ${METRIC[metric].unit}`;
}

/** The goal count Health reports for one day, or null when there's no number for it. */
export function healthCount(goal, metrics) {
  const metric = goal.health?.metric;
  const v = metric ? metrics?.[metric] : null;
  return v == null || !Number.isFinite(Number(v)) ? null : toCount(metric, Number(v));
}

/**
 * Check-in counts that Health should raise for one day: goals linked to a metric we have a value
 * for, that are active (and due, unless weekly) that day. A manual count is never lowered.
 */
export function healthUpdates(goals, lookup, day, metrics) {
  const out = [];
  for (const g of goals) {
    const count = healthCount(g, metrics);
    if (count == null) continue;
    if (!isActiveOn(g, day) || (g.schedule !== 'weekly' && !isDueOn(g, day))) continue;
    const c = lookup(g.id, day);
    if (c?.skipped) continue;
    if (count > (c?.count || 0)) out.push({ goal: g, count });
  }
  return out;
}
