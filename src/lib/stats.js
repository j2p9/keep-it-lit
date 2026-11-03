import {
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  endOfMonth,
  formatDay,
  formatMonth,
  minKey,
  startOfMonth,
  weekday,
  weekdayName,
} from './dates.js';
import { addedOn, isActiveOn, isDone, isDueOn, isLogged, progressOf } from './schedule.js';

/** Whether a goal belongs in a day's tally. Before it was added, only days filled in for it count. */
export const countsOn = (goal, day, c) => isDueOn(goal, day) && (day >= addedOn(goal) || isLogged(c));

/** How a single day went across all day-based goals. `fill` counts partial progress on counted goals. */
export function daySummary(goals, lookup, day) {
  let due = 0;
  let done = 0;
  let skipped = 0;
  let fill = 0;
  for (const g of goals) {
    const c = lookup(g.id, day);
    if (!countsOn(g, day, c)) continue;
    // A sick day (or an older skip) leaves the goal out; a rest day counts as not done.
    if (c?.skipped && c.skip !== 'rest') {
      skipped += 1;
      continue;
    }
    due += 1;
    if (isDone(g, c)) done += 1;
    fill += progressOf(g, c);
  }
  return {
    day,
    due,
    done,
    skipped,
    pct: due ? done / due : null,
    fill: due ? fill / due : null,
    perfect: due > 0 && done === due,
  };
}

export const firstDay = (goals) =>
  goals.reduce((min, g) => (!g.deleted_at && (!min || g.start_on < min) ? g.start_on : min), null);

/** Completed goal-days per day (every schedule type), straight from the check-in rows. */
export function doneByDay(goals, checkinsList) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const out = new Map();
  for (const c of checkinsList) {
    const g = byId.get(c.goal_id);
    if (!g || !isActiveOn(g, c.day) || !isDone(g, c)) continue;
    out.set(c.day, (out.get(c.day) || 0) + 1);
  }
  return out;
}

export function periodStats(goals, lookup, from, to, doneMap) {
  let due = 0;
  let done = 0;
  let perfect = 0;
  let tracked = 0;
  let checkins = 0;
  for (const day of eachDay(from, to)) {
    const s = daySummary(goals, lookup, day);
    due += s.due;
    done += s.done;
    if (s.due) tracked += 1;
    if (s.perfect) perfect += 1;
    if (doneMap) checkins += doneMap.get(day) || 0;
  }
  return { from, to, due, done, pct: due ? done / due : null, perfect, tracked, checkins };
}

const RANGE_DAYS = { week: 7, month: 30 };

/** Health-style ranges: the last 7 days, the last 30 days, or the last 12 months, plus the period before. */
export function rangeBounds(range, today) {
  if (range === 'year') {
    const from = addMonths(startOfMonth(today), -11);
    return { from, to: today, prevFrom: addMonths(from, -12), prevTo: addDays(from, -1) };
  }
  const n = RANGE_DAYS[range];
  const from = addDays(today, -(n - 1));
  return { from, to: today, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
}

export function chartSeries(goals, lookup, range, today) {
  if (range === 'year') {
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(startOfMonth(today), i - 11);
      const st = periodStats(goals, lookup, m, minKey(endOfMonth(m), today));
      return {
        key: m,
        label: formatMonth(m, { month: 'narrow' }),
        title: formatMonth(m),
        value: st.pct,
        due: st.due,
        done: st.done,
      };
    });
  }
  const n = RANGE_DAYS[range];
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1));
    const s = daySummary(goals, lookup, day);
    const dom = Number(day.slice(8));
    return {
      key: day,
      label: range === 'week' ? weekdayName(weekday(day), 'narrow') : dom === 1 || i % 5 === 0 ? String(dom) : '',
      title: formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' }),
      value: s.pct,
      due: s.due,
      done: s.done,
    };
  });
}

/** Share of due days (or weeks) in [from, to] that were done; frozen days count as misses here. */
export function goalRate(streak, from, to) {
  if (!streak) return null;
  let due = 0;
  let done = 0;
  for (const [k, st] of streak.status) {
    if (k < from || k > to) continue;
    if (st === 'done') {
      due += 1;
      done += 1;
    } else if (st === 'missed' || st === 'frozen') due += 1;
  }
  return due ? done / due : null;
}

/** Loop-style habit strength: a forgiving moving average that rises with every done day. */
export function habitStrength(streak) {
  if (!streak) return 0;
  const a = streak.unit === 'week' ? 0.3 : 0.1;
  let s = 0;
  for (const st of streak.status.values()) {
    if (st === 'done') s += a * (1 - s);
    else if (st === 'missed' || st === 'frozen') s -= a * s;
  }
  return s;
}

export function weekdayRates(goals, lookup, today, weeks = 8) {
  const due = Array(7).fill(0);
  const done = Array(7).fill(0);
  for (const day of eachDay(addDays(today, -weeks * 7), addDays(today, -1))) {
    const s = daySummary(goals, lookup, day);
    const w = weekday(day);
    due[w] += s.due;
    done[w] += s.done;
  }
  return due.map((d, i) => (d ? done[i] / d : null));
}

const pct = (v) => `${Math.round(v * 100)}%`;

/** A few Health-style "Highlights" sentences. */
export function highlights({ goals, lookup, today, streaks }) {
  const out = [];
  const cur = periodStats(goals, lookup, addDays(today, -6), today);
  const prev = periodStats(goals, lookup, addDays(today, -13), addDays(today, -7));
  if (cur.due >= 3 && prev.due >= 3) {
    const diff = Math.round((cur.pct - prev.pct) * 100);
    if (diff >= 3) out.push({ icon: '📈', text: `You're completing ${diff}% more of your goals than last week.` });
    else if (diff <= -3) out.push({ icon: '📉', text: `You're ${-diff}% behind last week. A strong finish turns it around.` });
    else out.push({ icon: '⚖️', text: `Rock steady: ${pct(cur.pct)} of your goals done, level with last week.` });
  }

  const first = firstDay(goals);
  if (first && daysBetween(first, today) >= 14) {
    const rates = weekdayRates(goals, lookup, today);
    let best = -1;
    rates.forEach((r, i) => {
      if (r != null && (best < 0 || r > rates[best])) best = i;
    });
    if (best >= 0 && rates[best] > 0) {
      out.push({ icon: '🗓️', text: `${weekdayName(best, 'long')}s are your strongest day (${pct(rates[best])} done).` });
    }
  }

  const from = addDays(today, -30);
  const rated = goals
    .filter((g) => !g.archived_on)
    .map((g) => ({ g, r: goalRate(streaks.get(g.id), from, addDays(today, -1)) }))
    .filter((x) => x.r != null)
    .sort((a, b) => b.r - a.r);
  if (rated.length >= 2) {
    const top = rated[0];
    const low = rated[rated.length - 1];
    out.push({ icon: top.g.emoji, text: `${top.g.title} is your most consistent goal (${pct(top.r)} lately).` });
    if (low.r < 0.7) out.push({ icon: low.g.emoji, text: `${low.g.title} could use some love (${pct(low.r)}). A reminder might help.` });
  }
  return out.slice(0, 3);
}
