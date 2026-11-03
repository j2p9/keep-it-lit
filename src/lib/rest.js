// Banked rest days. Perfect days earn them (how many, how often and the most you can bank are
// settings), and they're spent automatically: a day that's over with a goal left undone uses one
// for the whole day, and so does a finished week where a weekly goal fell short (a week is one
// unit). Taking a rest day on purpose spends one right away. Sick days and sick weeks are free.
//
// The rules are kept as a list, each with the day it started (`from`), so a change only applies
// from that day on: switching rest days on, or changing how they're earned, never rewrites the past.
import { addDays, minKey, startOfWeek } from './dates.js';
import { isDone } from './schedule.js';
import { countsOn, daySummary, firstDay } from './stats.js';
import { weekProgress } from './streaks.js';

export const REST_DEFAULTS = { on: true, every: 7, amount: 1, max: 5 };

/** The rule in effect on `day`, or null before the first one. */
export function ruleOn(rules, day) {
  let rule = null;
  for (const r of rules || []) if (r.from <= day) rule = r;
  return rule;
}

/**
 * Replays the history and returns { days, weeks (rested week starts), bank (rest days left),
 * earnedOn, usedOn, nextIn (perfect days until the next one, or null when off) }.
 */
export function planRest({ goals, lookup, today, weekStart = 0, rules = [], weekMark = () => null }) {
  const days = new Set();
  const weeks = new Set();
  const earnedOn = [];
  const usedOn = [];
  let bank = 0;
  let progress = 0; // perfect days toward the next rest day
  const live = goals.filter((g) => !g.deleted_at);
  const first = firstDay(live);
  const current = ruleOn(rules, today);
  const nextIn = () => (current?.on ? Math.max(1, current.every - progress) : null);
  if (!first || !rules?.length) return { days, weeks, bank, earnedOn, usedOn, nextIn: nextIn() };

  const use = (set, key, day) => {
    if (bank < 1) return;
    bank -= 1;
    set.add(key);
    usedOn.push(day);
  };

  for (let d = first < rules[0].from ? rules[0].from : first; d <= today; d = addDays(d, 1)) {
    const rule = ruleOn(rules, d);
    if (!rule?.on) continue;
    const over = d < today;

    // A day goal left undone once the day is over, or a rest day taken on purpose.
    let needDay = false;
    for (const g of live) {
      if (g.schedule === 'weekly') continue;
      const c = lookup(g.id, d);
      if (!countsOn(g, d, c)) continue;
      if (c?.skipped) {
        if (c.skip === 'rest') needDay = true;
      } else if (over && !isDone(g, c)) needDay = true;
    }
    if (needDay) use(days, d, d);

    // Weekly goals, once their week is over (or rested on purpose during it).
    const wk = startOfWeek(d, weekStart);
    const weekOver = addDays(wk, 6) === d && over;
    if (addDays(wk, 6) === d || d === today) {
      let needWeek = false;
      for (const g of live) {
        if (g.schedule !== 'weekly' || addDays(wk, 6) < g.start_on || (g.archived_on && wk >= g.archived_on)) continue;
        const mark = weekMark(g.id, wk);
        const lastDay = g.archived_on ? minKey(addDays(g.archived_on, -1), today) : today;
        const w = weekProgress(g, lookup, wk, lastDay, mark);
        if (w.required > 0 && w.done < w.required && (weekOver || mark === 'rest')) needWeek = true;
      }
      if (needWeek) use(weeks, wk, d);
    }

    // Perfect days earn rest days. Lowering the limit never takes away ones already banked.
    if (daySummary(live, lookup, d).perfect) {
      progress += 1;
      if (progress >= rule.every) {
        progress = 0;
        const before = bank;
        bank = Math.max(bank, Math.min(rule.max, bank + rule.amount));
        if (bank > before) earnedOn.push(d);
      }
    }
  }
  return { days, weeks, bank, earnedOn, usedOn, nextIn: nextIn() };
}
