import { weekday, weekdayName } from './dates.js';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function isActiveOn(goal, day) {
  if (goal.deleted_at) return false;
  if (day < goal.start_on) return false;
  if (goal.archived_on && day >= goal.archived_on) return false;
  return true;
}

/** Whether a day-based goal is due on `day`. Weekly goals are judged per week, never per day. */
export function isDueOn(goal, day) {
  if (!isActiveOn(goal, day)) return false;
  if (goal.schedule === 'weekly') return false;
  if (goal.schedule === 'weekdays') return (goal.days || ALL_DAYS).includes(weekday(day));
  return true;
}

export const isWeekly = (goal) => goal.schedule === 'weekly';

export const isDone = (goal, c) => !!c && !c.skipped && c.count >= goal.target;

/** The day a goal was added. Its start can move earlier when earlier days are filled in. */
export const addedOn = (goal) => goal.added_on || goal.start_on;

/** A check-in that records something: done, partly done, or skipped. */
export const isLogged = (c) => Boolean(c && (c.skipped || c.count > 0));

/** Whether the goal's schedule includes `day`, ignoring when it started. Weekly goals: any day. */
export const scheduledOn = (goal, day) => goal.schedule !== 'weekdays' || (goal.days || ALL_DAYS).includes(weekday(day));

/**
 * What a day's list shows: goals due that day, weekly goals, and goals added later that can
 * still be filled in for that day (until they are, they don't count toward it).
 */
export function goalsForDay(goals, day, lookup) {
  const due = [];
  const weekly = [];
  const later = [];
  for (const g of goals) {
    if (g.deleted_at || (g.archived_on && day >= g.archived_on)) continue;
    if (day < g.start_on || (day < addedOn(g) && !isLogged(lookup?.(g.id, day)))) {
      if (scheduledOn(g, day)) later.push(g);
    } else if (g.schedule === 'weekly') weekly.push(g);
    else if (isDueOn(g, day)) due.push(g);
  }
  return { due, weekly, later };
}

/**
 * Where a goal's history starts: the day it was added, or the earliest day before that when it
 * was done (filled in afterwards).
 */
export function historyStart(goal, loggedDays) {
  let start = addedOn(goal);
  for (const d of loggedDays) if (d < start) start = d;
  return start;
}

export const progressOf = (goal, c) => (!c || c.skipped ? 0 : Math.min(1, c.count / goal.target));

export function scheduleLabel(goal) {
  if (goal.schedule === 'weekly') return `${goal.per_week}× a week`;
  if (goal.schedule !== 'weekdays') return 'Every day';
  const days = [...(goal.days || ALL_DAYS)].sort();
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '0,6') return 'Weekends';
  return days.map((d) => weekdayName(d)).join(', ');
}

export function targetLabel(goal) {
  // Sleep linked to Apple Health counts minutes but reads better in hours.
  if (goal.health?.metric === 'sleep') return `${Math.round((goal.target / 60) * 10) / 10} h`;
  if (goal.target <= 1) return '';
  return `${goal.target.toLocaleString()}${goal.unit ? ` ${goal.unit}` : ''}`;
}

export const TIME_SECTIONS = [
  { key: 'morning', label: 'Morning', icon: '🌅' },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️' },
  { key: 'evening', label: 'Evening', icon: '🌙' },
  { key: 'anytime', label: 'Anytime', icon: '✨' },
];
