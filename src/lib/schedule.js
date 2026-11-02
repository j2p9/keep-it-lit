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
