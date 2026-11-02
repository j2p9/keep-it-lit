import { useEffect, useRef, useState } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { formatTime } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { confetti } from '../lib/confetti.js';
import { isDone, scheduleLabel, targetLabel } from '../lib/schedule.js';
import { isAtRisk, streakGlyph } from '../lib/streaks.js';
import { hoursLeftToday, lookup, restoreCheckin, streaks, tapGoal, today, todaySummary } from '../lib/store.js';
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

export function StreakBadge({ goal, s, done }) {
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
  const risk = isAtRisk(goal, s, today.value, done, hoursLeftToday.value);
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

export function GoalRow({ goal, day }) {
  const c = lookup.value(goal.id, day);
  const s = streaks.value.get(goal.id);
  const done = isDone(goal, c);
  const skipped = Boolean(c?.skipped);
  const counted = goal.target > 1;
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
    const before = todaySummary.peek();
    const prev = tapGoal(goal, day);
    const after = todaySummary.peek();
    const row = lookup.peek()(goal.id, day);
    if (counted && !skipped) setFx({ kind: 'plus', id: Date.now() });
    else if (isDone(goal, row) && !done) setFx({ kind: 'burst', id: Date.now() });
    const undo = { label: 'Undo', fn: () => restoreCheckin(goal, day, prev) };
    if (isToday && after.perfect && !before.perfect) {
      confetti();
      showToast('You kept it lit today! 🔥', { action: undo, duration: 4500 });
    } else if (counted && !skipped) {
      const unit = goal.unit ? ` ${goal.unit}` : '';
      showToast(`${goal.emoji} ${row.count} of ${goal.target}${unit}${isDone(goal, row) && !done ? ' · done!' : ''}`, { action: undo, duration: 2600 });
    } else {
      showToast(`${goal.emoji} ${goal.title}: ${isDone(goal, row) ? 'done' : 'not done'}`, { action: undo, duration: 2600 });
    }
  };
  const press = useLongPress(() => openOverlay('goalActions', { goalId: goal.id, day }), onTap);

  let sub;
  if (skipped) sub = 'Skipped · streak is safe';
  else if (goal.schedule === 'weekly' && s) sub = `${s.week.done} of ${s.week.required} this week`;
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
      {isToday && <StreakBadge goal={goal} s={s} done={done} />}
      {counted && !done ? (
        <div class="check-count" aria-hidden="true">
          <Ring size={40} stroke={4} value={count / goal.target} color={color} />
          <span class="count-num" key={count}>
            {count || '+'}
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
