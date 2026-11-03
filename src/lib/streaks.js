import { addDays, daysBetween, minKey, startOfWeek } from './dates.js';
import { isDone, isDueOn } from './schedule.js';

// Streak freezes, Duolingo-style: earned by keeping a streak going and spent
// automatically on a missed day, so one slip doesn't wipe out weeks of work.
export const FREEZE_EVERY_DAYS = 7;
export const FREEZE_EVERY_WEEKS = 4;
export const FREEZE_MAX = 2;

export const STREAK_MILESTONES = [3, 7, 14, 30, 66, 100, 180, 365];
export const WEEK_MILESTONES = [4, 12, 26, 52];

export const checkinKey = (goalId, day) => `${goalId}|${day}`;
export const makeLookup = (checkins) => (goalId, day) => checkins[checkinKey(goalId, day)];

const NO_REST = { days: new Set(), weeks: new Set() };

/**
 * One week of a weekly goal: check-offs, how many it needs, and skipped (sick) days. A week
 * marked sick needs nothing.
 */
export function weekProgress(goal, lookup, wk, lastDay, mark) {
  let done = 0;
  let skipped = 0;
  const doneDays = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(wk, i);
    if (day < goal.start_on || day > lastDay) continue;
    const c = lookup(goal.id, day);
    if (c?.skipped) skipped += 1;
    else if (isDone(goal, c)) {
      done += 1;
      doneDays.push(day);
    }
  }
  // A goal that starts mid-week only needs what is still possible that week.
  const open = wk < goal.start_on ? 7 - daysBetween(wk, goal.start_on) : 7;
  const required = mark === 'sick' ? 0 : Math.max(0, Math.min(goal.per_week, open) - skipped);
  return { done, required, skipped, doneDays, mark: mark || null };
}

/**
 * Replays one goal's history and returns its streak. Day statuses:
 * done | rest | frozen | skipped | missed | off | pending (today, not done yet).
 * An unfinished today is pending, so the streak only breaks once the day is over. Days (and
 * weeks) in `opts.rest` were covered by a banked rest day; freezes are the backup after that.
 */
export function goalStreak(goal, lookup, today, opts = {}) {
  if (goal.schedule === 'weekly') return weeklyStreak(goal, lookup, today, opts);
  const freezes = opts.freezes !== false;
  const rest = opts.rest || NO_REST;
  const last = goal.archived_on ? minKey(addDays(goal.archived_on, -1), today) : today;
  const status = new Map();
  const milestones = {};
  const timeline = [];
  let current = 0;
  let best = 0;
  let bank = 0;
  let brokeBig = false;
  let comebackOn = null;
  let firstFrozen = null;
  let firstRest = null;

  for (let day = goal.start_on; day <= last; day = addDays(day, 1)) {
    if (!isDueOn(goal, day)) {
      status.set(day, 'off');
      continue;
    }
    const c = lookup(goal.id, day);
    // A sick day (or an older skip) pauses the streak for free.
    if (c?.skipped && c.skip !== 'rest') {
      status.set(day, 'skipped');
      continue;
    }
    if (isDone(goal, c)) {
      current += 1;
      if (freezes && current % FREEZE_EVERY_DAYS === 0 && bank < FREEZE_MAX) bank += 1;
      if (current > best) best = current;
      for (const m of STREAK_MILESTONES) if (current === m && !milestones[m]) milestones[m] = day;
      if (brokeBig && current === 7 && !comebackOn) comebackOn = day;
      status.set(day, 'done');
    } else if (rest.days.has(day)) {
      firstRest ??= day;
      status.set(day, 'rest');
    } else if (day === today) {
      status.set(day, 'pending');
      continue;
    } else if (freezes && bank > 0) {
      bank -= 1;
      firstFrozen ??= day;
      status.set(day, 'frozen');
    } else {
      if (current >= 7) brokeBig = true;
      current = 0;
      status.set(day, 'missed');
    }
    timeline.push([day, current]);
  }

  return { goalId: goal.id, unit: 'day', current, best, freezes: bank, status, milestones, comebackOn, firstFrozen, firstRest, timeline };
}

function weeklyStreak(goal, lookup, today, opts) {
  const freezes = opts.freezes !== false;
  const weekStart = opts.weekStart ?? 0;
  const rest = opts.rest || NO_REST;
  const weekMark = opts.weekMark || (() => null);
  const status = new Map();
  const weeks = new Map();
  const milestones = {};
  let current = 0;
  let best = 0;
  let bank = 0;
  let brokeBig = false;
  let comebackOn = null;
  let firstFrozen = null;
  let firstRest = null;
  const lastDay = goal.archived_on ? minKey(addDays(goal.archived_on, -1), today) : today;
  const thisWeek = startOfWeek(today, weekStart);

  if (lastDay >= goal.start_on) {
    for (let wk = startOfWeek(goal.start_on, weekStart); wk <= lastDay; wk = addDays(wk, 7)) {
      const w = weekProgress(goal, lookup, wk, lastDay, weekMark(goal.id, wk));
      weeks.set(wk, w);
      const { done, required, doneDays } = w;

      // Nothing needed: sick that week, or every possible day was skipped.
      if (required === 0) {
        status.set(wk, 'skipped');
        continue;
      }
      if (done >= required) {
        current += 1;
        if (freezes && current % FREEZE_EVERY_WEEKS === 0 && bank < FREEZE_MAX) bank += 1;
        if (current > best) best = current;
        const reached = doneDays[required - 1];
        for (const m of WEEK_MILESTONES) if (current === m && !milestones[m]) milestones[m] = reached;
        if (brokeBig && current === 4 && !comebackOn) comebackOn = reached;
        status.set(wk, 'done');
      } else if (rest.weeks.has(wk)) {
        // A banked rest day covered the whole week.
        firstRest ??= addDays(wk, 6);
        status.set(wk, 'rest');
      } else if (wk === thisWeek && !goal.archived_on) {
        status.set(wk, 'pending');
      } else if (freezes && bank > 0) {
        bank -= 1;
        firstFrozen ??= addDays(wk, 6);
        status.set(wk, 'frozen');
      } else {
        if (current >= 4) brokeBig = true;
        current = 0;
        status.set(wk, 'missed');
      }
    }
  }

  const week = weeks.get(thisWeek) ?? { done: 0, required: goal.per_week, skipped: 0 };
  return {
    goalId: goal.id,
    unit: 'week',
    current,
    best,
    freezes: bank,
    status,
    weeks,
    week,
    thisWeek,
    milestones,
    comebackOn,
    firstFrozen,
    firstRest,
    timeline: [],
  };
}

/** ⏳ like Snapchat: a live streak whose goal is still undone in the last hours of the day. */
export function isAtRisk(goal, s, today, done, hoursLeftToday, riskHours = 4) {
  if (!s || s.current < 1 || done || hoursLeftToday > riskHours) return false;
  if (s.unit === 'week') {
    // Last day of the week and still short of the weekly target.
    return today === addDays(s.thisWeek, 6) && s.status.get(s.thisWeek) === 'pending' && s.week.done < s.week.required;
  }
  return s.status.get(today) === 'pending';
}

/** How a streak count should be decorated: 🔥 normally, ⏳ when at risk, 💯 from 100. */
export function streakGlyph(current, atRisk) {
  if (atRisk) return '⏳';
  if (current >= 100) return '💯';
  return '🔥';
}

export function nextMilestone(s) {
  const steps = s.unit === 'week' ? WEEK_MILESTONES : STREAK_MILESTONES;
  const next = steps.find((m) => m > s.current);
  return next ? { target: next, left: next - s.current } : null;
}
