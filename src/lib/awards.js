import { addDays, addMonths, daysBetween, endOfMonth, localDayOf, minKey, startOfMonth, startOfWeek } from './dates.js';
import { isActiveOn, isDone } from './schedule.js';
import { STREAK_MILESTONES, WEEK_MILESTONES } from './streaks.js';
import { countsOn, daySummary, doneByDay, firstDay } from './stats.js';

export const PERFECT_STEPS = [1, 10, 25, 50, 100, 250];
export const CHECKIN_STEPS = [1, 50, 100, 250, 500, 1000];
/** Times one goal has been done, for that goal's own medals. */
export const DONE_STEPS = [10, 25, 50, 100, 250, 500, 1000];

const DONE_INFO = {
  10: ['Regular', 'bronze', '10'],
  25: ['Committed', 'bronze', '25'],
  50: ['Dedicated', 'silver', '50'],
  100: ['Centurion', 'gold', '100'],
  250: ['Veteran', 'platinum', '250'],
  500: ['Master', 'legendary', '500'],
  1000: ['Living Legend', 'cosmic', '1K'],
};

const STREAK_INFO = {
  3: ['Spark', 'bronze'],
  7: ['One Week Wonder', 'bronze'],
  14: ['Two-Week Blaze', 'silver'],
  30: ['Month on Fire', 'gold'],
  66: ['Habit Formed', 'gold'],
  100: ['Century', 'platinum'],
  180: ['Half-Year Hero', 'platinum'],
  365: ['Eternal Flame', 'legendary'],
};
const WEEK_INFO = {
  4: ['Monthly Rhythm', 'bronze'],
  12: ['Quarter Strong', 'silver'],
  26: ['Half-Year Habit', 'gold'],
  52: ['Year-Round', 'platinum'],
};
const PERFECT_INFO = {
  1: ['Perfect Day', 'bronze'],
  10: ['Perfect 10', 'silver'],
  25: ['Quarter Century', 'silver'],
  50: ['Golden Fifty', 'gold'],
  100: ['Flawless 100', 'platinum'],
  250: ['Perfectionist', 'legendary'],
};
const CHECKIN_INFO = {
  1: ['First Step', 'bronze'],
  50: ['Getting Warm', 'bronze'],
  100: ['Hundred Club', 'silver'],
  250: ['Quarter Thousand', 'gold'],
  500: ['High Five Hundred', 'platinum'],
  1000: ['Thousand Torch', 'legendary'],
};

// repeat: 'goal' = earned once per goal, 'period' = once per week/month/year, otherwise once ever.
// perGoal awards belong to one goal (key `id:goalId`) and show on that goal's own shelf.
export const AWARDS = [
  ...STREAK_MILESTONES.map((n) => ({
    id: `streak-${n}`,
    section: 'streaks',
    title: STREAK_INFO[n][0],
    tier: STREAK_INFO[n][1],
    desc:
      n === 66
        ? 'Keep this goal going 66 days in a row. That is about how long a new habit takes to stick.'
        : `Keep this goal going ${n} days in a row.`,
    label: String(n),
    glyph: n >= 100 ? '💯' : '🔥',
    shape: n >= 66 ? 'hex' : 'circle',
    repeat: 'goal',
    perGoal: true,
    metric: 'dayStreak',
    target: n,
  })),
  ...WEEK_MILESTONES.map((n) => ({
    id: `wstreak-${n}`,
    section: 'streaks',
    title: WEEK_INFO[n][0],
    tier: WEEK_INFO[n][1],
    desc: `Hit this weekly goal ${n} weeks in a row.`,
    label: `${n}w`,
    glyph: '📅',
    shape: 'shield',
    repeat: 'goal',
    perGoal: true,
    metric: 'weekStreak',
    target: n,
  })),
  ...DONE_STEPS.map((n) => ({
    id: `done-${n}`,
    section: 'streaks',
    title: DONE_INFO[n][0],
    tier: DONE_INFO[n][1],
    desc: `Check off this goal ${n.toLocaleString()} times.`,
    label: DONE_INFO[n][2],
    glyph: '✅',
    shape: n >= 250 ? 'star' : 'shield',
    repeat: 'goal',
    perGoal: true,
    metric: 'goalDone',
    target: n,
  })),
  ...PERFECT_STEPS.map((n) => ({
    id: `perfect-${n}`,
    section: 'perfect',
    title: PERFECT_INFO[n][0],
    tier: PERFECT_INFO[n][1],
    desc: n === 1 ? 'Finish every goal that was due in a day.' : `Have ${n} perfect days in total.`,
    label: String(n),
    glyph: '✨',
    shape: 'star',
    metric: 'perfectDays',
    target: n,
  })),
  {
    id: 'perfect-week',
    section: 'perfect',
    title: 'Perfect Week',
    tier: 'gold',
    desc: 'Every goal, every day, for a whole week.',
    glyph: '🗓️',
    shape: 'hex',
    repeat: 'period',
  },
  {
    id: 'perfect-month',
    section: 'perfect',
    title: 'Perfect Month',
    tier: 'platinum',
    desc: 'Every goal, every day, for a whole calendar month.',
    glyph: '🏆',
    shape: 'hex',
    repeat: 'period',
  },
  {
    id: 'getting-started',
    section: 'milestones',
    title: 'Getting Started',
    tier: 'bronze',
    desc: 'Set up your first goals.',
    glyph: '🚀',
    shape: 'circle',
  },
  ...CHECKIN_STEPS.map((n) => ({
    id: `checkins-${n}`,
    section: 'milestones',
    title: CHECKIN_INFO[n][0],
    tier: CHECKIN_INFO[n][1],
    desc: n === 1 ? 'Check off your very first goal.' : `Check off ${n} goals in total.`,
    label: String(n),
    glyph: '✅',
    shape: 'circle',
    metric: 'checkins',
    target: n,
  })),
  {
    id: 'early-bird',
    section: 'consistency',
    title: 'Early Bird',
    tier: 'silver',
    desc: 'Finish all of a day’s goals before 9 AM.',
    glyph: '🌅',
    shape: 'circle',
    metric: 'earlyDays',
    target: 1,
  },
  {
    id: 'rise-and-shine',
    section: 'consistency',
    title: 'Rise & Shine',
    tier: 'gold',
    desc: 'Have 10 days with everything done before 9 AM.',
    glyph: '☀️',
    shape: 'star',
    metric: 'earlyDays',
    target: 10,
  },
  {
    id: 'comeback',
    section: 'consistency',
    title: 'Comeback',
    tier: 'silver',
    desc: 'Lose a 7-day streak, then build that goal back to 7.',
    glyph: '💪',
    shape: 'shield',
  },
  {
    id: 'on-fire',
    section: 'consistency',
    title: 'On Fire',
    tier: 'flame',
    desc: 'Have 3 goals on 7-day streaks at the same time.',
    glyph: '🔥',
    shape: 'star',
  },
  {
    id: 'ice-saver',
    section: 'consistency',
    title: 'Saved by the Ice',
    tier: 'ice',
    desc: 'A streak freeze kept one of your streaks alive.',
    glyph: '❄️',
    shape: 'hex',
  },
  {
    id: 'challenge',
    section: 'challenges',
    title: 'Monthly Challenge',
    tier: 'cosmic',
    desc: 'Reach your personal target of perfect days in a month.',
    glyph: '🏔️',
    shape: 'shield',
    repeat: 'period',
    metric: 'challenge',
  },
  {
    id: 'new-year',
    section: 'limited',
    title: 'New Year Spark',
    tier: 'cosmic',
    desc: 'Have a perfect day on January 1.',
    glyph: '🎆',
    shape: 'star',
    repeat: 'period',
  },
  {
    id: 'leap-day',
    section: 'limited',
    title: 'Leap of Faith',
    tier: 'cosmic',
    desc: 'Have a perfect day on February 29.',
    glyph: '🐸',
    shape: 'star',
    repeat: 'period',
  },
  {
    id: 'anniversary',
    section: 'limited',
    title: 'One Year Lit',
    tier: 'legendary',
    desc: 'Keep It Lit for a whole year.',
    glyph: '🎂',
    shape: 'star',
    metric: 'joinedDays',
    target: 365,
  },
  {
    id: 'overachiever',
    section: 'secret',
    secret: true,
    title: 'Overachiever',
    tier: 'flame',
    desc: 'Hit double the target on a counted goal.',
    glyph: '⚡',
    shape: 'circle',
  },
  {
    id: 'unstoppable',
    section: 'secret',
    secret: true,
    title: 'Unstoppable',
    tier: 'legendary',
    desc: 'Have 10 perfect days in a row.',
    glyph: '🌋',
    shape: 'star',
  },
  {
    id: 'seven-wonders',
    section: 'secret',
    secret: true,
    title: 'Seven Wonders',
    tier: 'cosmic',
    desc: 'Complete 7 different goals in one day.',
    glyph: '🌈',
    shape: 'hex',
  },
];

export const AWARD_SECTIONS = [
  ['streaks', 'Streaks'],
  ['perfect', 'Perfect days'],
  ['milestones', 'Milestones'],
  ['consistency', 'Consistency'],
  ['challenges', 'Monthly challenges'],
  ['limited', 'Limited edition'],
  ['secret', 'Secret'],
];

export const AWARD_BY_ID = Object.fromEntries(AWARDS.map((a) => [a.id, a]));
export const awardIdOf = (key) => key.split(':')[0];

/** Every due goal finished in the morning (4–9 AM) of that same day. Late-night check-offs don't count. */
function doneEarly(goals, lookup, day) {
  for (const g of goals) {
    const c = lookup(g.id, day);
    if (!countsOn(g, day, c) || c?.skipped) continue;
    if (!c?.completed_at || localDayOf(c.completed_at) !== day) return false;
    const hour = new Date(c.completed_at).getHours();
    if (hour < 4 || hour >= 9) return false;
  }
  return true;
}

/**
 * Works out every award instance the history has earned, with the day it was earned.
 * Returns { earned: Map(award_key -> 'YYYY-MM-DD'), stats } where stats feed progress bars.
 */
export function evaluateAwards({ goals, checkinsList, lookup, today, streaks, challenges = [], joinedOn, weekStart = 0 }) {
  const earned = new Map();
  const add = (key, day) => {
    if (!day || day > today) return;
    const prev = earned.get(key);
    if (!prev || day < prev) earned.set(key, day);
  };
  const stats = {
    perfectDays: 0,
    checkins: 0,
    dayStreak: 0,
    weekStreak: 0,
    earlyDays: 0,
    monthPerfect: 0,
    joinedDays: 0,
    goalDone: new Map(), // goal id -> times done
  };
  const live = goals.filter((g) => !g.deleted_at);
  if (joinedOn) stats.joinedDays = Math.max(0, daysBetween(joinedOn, today));
  const first = firstDay(live);
  if (!first) return { earned, stats };
  const byId = new Map(live.map((g) => [g.id, g]));

  // Each goal's own "times done" medals, earned on the day of the nth check-off.
  const doneDays = new Map();
  for (const c of checkinsList) {
    const g = byId.get(c.goal_id);
    if (!g || c.day > today || !isActiveOn(g, c.day) || !isDone(g, c)) continue;
    if (!doneDays.has(g.id)) doneDays.set(g.id, []);
    doneDays.get(g.id).push(c.day);
  }
  for (const [id, days] of doneDays) {
    days.sort();
    stats.goalDone.set(id, days.length);
    for (const n of DONE_STEPS) if (days.length >= n) add(`done-${n}:${id}`, days[n - 1]);
  }

  const created = live.map((g) => (g.created_at ? localDayOf(g.created_at) : g.start_on)).sort()[0];
  add('getting-started', minKey(created, today));

  for (const g of live) {
    const s = streaks.get(g.id);
    if (!s) continue;
    const base = s.unit === 'week' ? 'wstreak' : 'streak';
    for (const [m, day] of Object.entries(s.milestones)) add(`${base}-${m}:${g.id}`, day);
    if (s.comebackOn) add('comeback', s.comebackOn);
    if (s.firstFrozen) add('ice-saver', s.firstFrozen);
    if (!g.archived_on) {
      if (s.unit === 'week') stats.weekStreak = Math.max(stats.weekStreak, s.current);
      else stats.dayStreak = Math.max(stats.dayStreak, s.current);
    }
  }

  const doneMap = doneByDay(live, checkinsList);
  const summaries = new Map();
  let perfectRun = 0;
  let total = 0;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const s = daySummary(live, lookup, day);
    summaries.set(day, s);
    if (s.perfect) {
      stats.perfectDays += 1;
      perfectRun += 1;
      for (const n of PERFECT_STEPS) if (stats.perfectDays === n) add(`perfect-${n}`, day);
      if (perfectRun === 10) add('unstoppable', day);
      if (day.endsWith('-01-01')) add(`new-year:${day.slice(0, 4)}`, day);
      if (day.endsWith('-02-29')) add(`leap-day:${day.slice(0, 4)}`, day);
      if (doneEarly(live, lookup, day)) {
        stats.earlyDays += 1;
        if (stats.earlyDays === 1) add('early-bird', day);
        if (stats.earlyDays === 10) add('rise-and-shine', day);
      }
      if (day.startsWith(today.slice(0, 7))) stats.monthPerfect += 1;
    } else if (s.due > 0 && day !== today) {
      perfectRun = 0;
    }
    const n = doneMap.get(day) || 0;
    const before = total;
    total += n;
    for (const step of CHECKIN_STEPS) if (before < step && total >= step) add(`checkins-${step}`, day);
    if (n >= 7) add('seven-wonders', day);
  }
  stats.checkins = total;

  for (const c of checkinsList) {
    const g = byId.get(c.goal_id);
    if (g && g.target > 1 && !c.skipped && c.count >= 2 * g.target) add('overachiever', c.day);
  }

  // A clean stretch: fully tracked, nothing due left undone, at least one perfect day.
  const clean = (from, to) => {
    let any = false;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const s = summaries.get(d);
      if (!s) return false;
      if (s.due > 0 && !s.perfect) return false;
      if (s.perfect) any = true;
    }
    return any;
  };
  for (let wk = startOfWeek(first, weekStart); addDays(wk, 6) <= today; wk = addDays(wk, 7)) {
    if (wk >= first && clean(wk, addDays(wk, 6))) add(`perfect-week:${wk}`, addDays(wk, 6));
  }
  for (let m = startOfMonth(first); endOfMonth(m) <= today; m = addMonths(m, 1)) {
    if (m >= first && clean(m, endOfMonth(m))) add(`perfect-month:${m.slice(0, 7)}`, endOfMonth(m));
  }

  // On Fire: three day-based streaks of 7+ alive on the same day.
  const lines = live
    .map((g) => ({ g, s: streaks.get(g.id) }))
    .filter(({ s }) => s && s.unit === 'day' && s.timeline.length)
    .map(({ g, s }) => ({ tl: s.timeline, i: 0, v: 0, end: g.archived_on }));
  if (lines.length >= 3) {
    for (let day = first; day <= today; day = addDays(day, 1)) {
      let hot = 0;
      for (const line of lines) {
        while (line.i < line.tl.length && line.tl[line.i][0] <= day) {
          line.v = line.tl[line.i][1];
          line.i += 1;
        }
        if (line.end && day >= line.end) line.v = 0;
        if (line.v >= 7) hot += 1;
      }
      if (hot >= 3) {
        add('on-fire', day);
        break;
      }
    }
  }

  for (const ch of challenges) {
    let count = 0;
    for (let d = ch.month; d <= minKey(endOfMonth(ch.month), today); d = addDays(d, 1)) {
      if (summaries.get(d)?.perfect) count += 1;
      if (count === ch.target) {
        add(`challenge:${ch.month.slice(0, 7)}`, d);
        break;
      }
    }
  }

  if (joinedOn) add('anniversary', addDays(joinedOn, 365));
  return { earned, stats };
}

/**
 * One goal's own awards in order: its streak medals (days, or weeks for weekly goals), then
 * times done. Each item: { def, key, day (when earned, or null), progress ([have, need] or null) }.
 */
export function goalShelf(goal, streak, earned, doneCount = 0) {
  const weekly = goal.schedule === 'weekly';
  const ladder = [
    ...(weekly ? WEEK_MILESTONES.map((n) => `wstreak-${n}`) : STREAK_MILESTONES.map((n) => `streak-${n}`)),
    ...DONE_STEPS.map((n) => `done-${n}`),
  ];
  return ladder.map((id) => {
    const def = AWARD_BY_ID[id];
    const key = `${id}:${goal.id}`;
    const day = earned.get(key) || null;
    const have = def.metric === 'goalDone' ? doneCount : streak?.current || 0;
    return { def, key, day, progress: day ? null : [Math.min(have, def.target), def.target] };
  });
}

/** Award keys the history has earned that haven't been stored (and celebrated) yet. */
export function newAwards(storedKeys, earned) {
  const out = [];
  for (const [key, day] of earned) if (!storedKeys.has(key)) out.push({ award_key: key, earned_on: day });
  return out.sort((a, b) => (a.earned_on < b.earned_on ? -1 : 1));
}

export function awardProgress(def, stats, challengeTarget) {
  switch (def.metric) {
    case 'dayStreak':
    case 'weekStreak':
    case 'perfectDays':
    case 'checkins':
    case 'earlyDays':
    case 'joinedDays':
      return [Math.min(stats[def.metric], def.target), def.target];
    case 'challenge':
      return challengeTarget ? [Math.min(stats.monthPerfect, challengeTarget), challengeTarget] : null;
    default:
      return null;
  }
}
