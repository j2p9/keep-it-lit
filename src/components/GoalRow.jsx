import { useEffect, useRef, useState } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { formatDay, formatTime, startOfWeek } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { confetti } from '../lib/confetti.js';
import { healthProgressLabel } from '../lib/healthMetrics.js';
import { isDone, scheduleLabel, targetLabel } from '../lib/schedule.js';
import { daySummary } from '../lib/stats.js';
import { isAtRisk, streakGlyph } from '../lib/streaks.js';
import { allGoals, hoursLeftToday, lookup, restoreCheckin, settings, streaks, tapGoal, today } from '../lib/store.js';
import { openOverlay, showToast } from '../lib/ui.js';
import { Ring } from './Ring.jsx';
import { IconCheck } from './icons.jsx';

/** Tap for the quick action, press and hold for more. Scrolling cancels both. */
export function useLongPress(onLong, onTap, ms = 450) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown(e) {
      if (e.button > 0) return;
      fired.current = false;
      start.current = [e.clientX, e.clientY];
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        tick();
        onLong();
      }, ms);
    },
    onPointerMove(e) {
      if (!start.current) return;
      const dx = e.clientX - start.current[0];
      const dy = e.clientY - start.current[1];
      if (dx * dx + dy * dy > 100) {
        clear();
        start.current = null;
      }
    },
    onPointerUp() {
      if (timer.current && start.current && !fired.current) {
        clear();
        onTap();
      }
      start.current = null;
    },
    onPointerCancel() {
      clear();
      start.current = null;
    },
    onContextMenu(e) {
      e.preventDefault();
    },
    onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTap();
      }
    },
  };
}

/** The goal's current streak. `live` (today only) adds the ⏳ warning when it's about to end. */
export function StreakBadge({ goal, s, done, live = true }) {
  const current = s?.current || 0;
  // Bump the badge when the streak grows.
  const last = useRef(current);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    const grew = current > last.current;
    last.current = current;
    if (!grew) return undefined;
    setBump(true);
    const t = setTimeout(() => setBump(false), 650);
    return () => clearTimeout(t);
  }, [current]);
  if (current < 1) return null;
  const risk = live && isAtRisk(goal, s, today.value, done, hoursLeftToday.value);
  const unit = s.unit === 'week' ? 'week' : 'day';
  return (
    <span
      class={`streak${risk ? ' risk' : ''}${s.current >= 100 ? ' hundred' : ''}${bump ? ' bump' : ''}`}
      aria-label={`${s.current} ${unit} streak${risk ? ', ends soon' : ''}`}
    >
      <span aria-hidden="true">{streakGlyph(s.current, risk)}</span>
      {s.current}
      {s.unit === 'week' && <span class="unit">w</span>}
    </span>
  );
}

export function GoalRow({ goal, day, sub: subText }) {
  const c = lookup.value(goal.id, day);
  const s = streaks.value.get(goal.id);
  const done = isDone(goal, c);
  const skipped = Boolean(c?.skipped);
  const counted = goal.target > 1;
  // Filled in by Apple Health: a tap marks it done by hand instead of adding one.
  const linked = Boolean(goal.health?.metric);
  const tapsCount = counted && !linked;
  const count = c?.count || 0;
  const isToday = day === today.value;
  const color = colorOf(goal.color);
  // Short-lived tap effects: a ring burst on check-off, a floating "+1" on counted goals.
  const [fx, setFx] = useState(null);
  useEffect(() => {
    if (!fx) return undefined;
    const t = setTimeout(() => setFx(null), 700);
    return () => clearTimeout(t);
  }, [fx?.id]);

  const onTap = () => {
    tick();
    const summary = () => daySummary(allGoals.peek(), lookup.peek(), day);
    const before = summary();
    const prev = tapGoal(goal, day);
    const after = summary();
    const row = lookup.peek()(goal.id, day);
    if (tapsCount && !skipped) setFx({ kind: 'plus', id: Date.now() });
    else if (isDone(goal, row) && !done) setFx({ kind: 'burst', id: Date.now() });
    const undo = { label: 'Undo', fn: () => restoreCheckin(goal, day, prev) };
    if (isToday && after.perfect && !before.perfect) {
      confetti();
      showToast('You kept it lit today! 🔥', { action: undo, duration: 4500 });
    } else if (after.perfect && !before.perfect) {
      showToast(`✨ ${formatDay(day, { weekday: 'long' })} is complete`, { action: undo, duration: 3200 });
    } else if (tapsCount && !skipped) {
      const unit = goal.unit ? ` ${goal.unit}` : '';
      showToast(`${goal.emoji} ${row.count} of ${goal.target}${unit}${isDone(goal, row) && !done ? ' · done!' : ''}`, { action: undo, duration: 2600 });
    } else {
      showToast(`${goal.emoji} ${goal.title}: ${isDone(goal, row) ? 'done' : 'not done'}`, { action: undo, duration: 2600 });
    }
  };
  const press = useLongPress(() => openOverlay('goalActions', { goalId: goal.id, day }), onTap);

  // A weekly goal shows the week of the day on screen, not always this week.
  const wk = goal.schedule === 'weekly' && s ? startOfWeek(day, settings.value.weekStart) : null;
  const week = wk ? (wk === s.thisWeek ? s.week : s.weeks?.get(wk)) : null;
  const status = s?.status.get(wk || day);

  let sub;
  if (subText) sub = subText;
  else if (week?.mark === 'sick') sub = '🤒 Sick week · streak paused';
  else if (wk && (status === 'rest' || (week?.mark === 'rest' && status !== 'done'))) sub = '🛌 Rest week · streak keeps going';
  else if (c?.skip === 'rest') sub = status === 'rest' ? '🛌 Rest day · streak keeps going' : '🛌 Rest day';
  else if (c?.skip === 'sick') sub = '🤒 Sick day · streak paused';
  else if (skipped) sub = 'Skipped · streak is safe';
  else if (!done && !wk && status === 'rest') sub = '🛌 Covered by a rest day';
  else if (week) sub = `${week.done} of ${week.required} ${wk === s.thisWeek ? 'this week' : 'that week'}`;
  else if (linked) sub = counted ? `❤️ ${healthProgressLabel(goal, count)}` : '❤️ Apple Health';
  else if (counted) sub = `${count} / ${targetLabel(goal)}`;
  else if (goal.schedule !== 'daily') sub = scheduleLabel(goal);
  else if (goal.reminder_time && !done) sub = `🔔 ${formatTime(goal.reminder_time)}`;

  return (
    <div
      class={`goal${done ? ' done' : ''}${skipped ? ' skipped' : ''}`}
      style={{ '--c': color }}
      role="button"
      tabIndex={0}
      aria-pressed={done}
      aria-label={`${goal.title}${done ? ', done' : ''}. Hold for more options.`}
      {...press}
    >
      <div class="goal-icon" aria-hidden="true">
        {goal.emoji}
      </div>
      <div class="goal-main">
        <div class="goal-title">{goal.title}</div>
        {sub && <div class="goal-sub">{sub}</div>}
        {counted && !done && !skipped && count > 0 && (
          <div class="goal-bar">
            <i style={{ width: `${Math.min(100, (count / goal.target) * 100)}%` }} />
          </div>
        )}
      </div>
      <StreakBadge goal={goal} s={s} done={done} live={isToday} />
      {counted && !done ? (
        <div class="check-count" aria-hidden="true">
          <Ring size={40} stroke={4} value={count / goal.target} color={color} />
          <span class={`count-num${linked ? ' pct' : ''}`} key={count}>
            {linked ? `${Math.min(99, Math.floor((count / goal.target) * 100))}%` : count || '+'}
          </span>
        </div>
      ) : (
        <div class={`check${done ? ' on' : ''}${fx?.kind === 'burst' || (fx?.kind === 'plus' && done) ? ' burst' : ''}`} aria-hidden="true">
          <IconCheck size={20} />
        </div>
      )}
      {fx?.kind === 'plus' && (
        <span class="float-plus" key={fx.id} aria-hidden="true">
          +1
        </span>
      )}
    </div>
  );
}
