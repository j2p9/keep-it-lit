import { addDays, addMonths, daysBetween, daysInMonth, endOfMonth, startOfMonth } from './dates.js';
import { daySummary } from './stats.js';

/**
 * Apple Fitness-style personal monthly challenge: a perfect-day target about 10% above
 * last month's pace (10 for newcomers), never more than the days left in the month.
 */
export function challengeTarget({ goals, lookup, today, first }) {
  const month = startOfMonth(today);
  const dim = daysInMonth(month);
  const remaining = daysBetween(today, endOfMonth(month)) + 1;
  const prev = addMonths(month, -1);
  let tracked = 0;
  let perfect = 0;
  for (let d = prev; d < month; d = addDays(d, 1)) {
    if (first && d < first) continue;
    const s = daySummary(goals, lookup, d);
    if (s.due) tracked += 1;
    if (s.perfect) perfect += 1;
  }
  let base = 10;
  if (tracked >= 10) {
    const pace = (perfect / tracked) * dim;
    base = Math.max(Math.ceil(pace * 1.1), Math.ceil(pace) + 1);
  }
  base = Math.max(5, Math.min(dim, base));
  return { month, target: Math.max(1, Math.min(base, remaining)) };
}
