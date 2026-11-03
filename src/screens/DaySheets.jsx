import { useEffect, useRef, useState } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { formatDay, startOfWeek } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { formatMetric, fromCount, METRIC, toCount } from '../lib/healthMetrics.js';
import { addedOn, goalsForDay, isDone, targetLabel } from '../lib/schedule.js';
import { daySummary } from '../lib/stats.js';
import {
  allGoals,
  goals,
  health,
  lookup,
  notes,
  restPlan,
  restRule,
  setCheckin,
  setDayOff,
  setNote,
  settings,
  setWeekMark,
  streaks,
  takeDayOff,
  today,
  weekMarks,
} from '../lib/store.js';
import { openOverlay, showToast } from '../lib/ui.js';
import { GoalRow } from '../components/GoalRow.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { Stepper } from '../components/controls.jsx';
import { MOODS } from './Today.jsx';

/** Long-press menu for a goal on a given day. */
export function GoalActions({ goalId, day, onClose }) {
  const goal = goals.value[goalId];
  if (!goal) return null;
  const c = lookup.value(goal.id, day);
  const done = isDone(goal, c);
  const s = streaks.value.get(goal.id);
  const isToday = day === today.value;
  const streakText = s?.current ? `🔥 ${s.current}-${s.unit} streak` : 'No streak yet';

  return (
    <Sheet onClose={onClose} label={goal.title}>
      <div style="display:flex;align-items:center;gap:12px;margin:0 4px 16px">
        <div class="goal-icon" style={{ '--c': colorOf(goal.color) }} aria-hidden="true">
          {goal.emoji}
        </div>
        <div style="min-width:0">
          <div class="sheet-title" style="margin:0">
            {goal.title}
          </div>
          <div class="muted" style="font-size:14px">
            {isToday ? 'Today' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })} · {streakText}
          </div>
        </div>
      </div>

      {goal.health?.metric ? (
        <HealthAmount goal={goal} day={day} count={c?.count || 0} />
      ) : (
        goal.target > 1 && (
        <div class="form-group row-between">
          <div>
            <div style="font-weight:650">Amount</div>
            <div class="muted" style="font-size:13px">Goal: {targetLabel(goal)}</div>
          </div>
          <Stepper
            label="Amount"
            value={c?.count || 0}
            max={goal.target * 20}
            onChange={(v) => {
              tick();
              setCheckin(goal, day, { count: v, skipped: false });
            }}
          />
        </div>
        )
      )}

      <div class="action-list">
        <button
          class="action"
          onClick={() => {
            tick();
            setCheckin(goal, day, { count: done ? 0 : goal.target, skipped: false, skip: null });
            onClose();
          }}
        >
          <span class="ico">{done ? '↩️' : '✅'}</span>
          {done ? 'Mark as not done' : 'Mark as done'}
        </button>
        {!done && <DayOffActions goal={goal} day={day} onClose={onClose} />}
        <button
          class="action"
          onClick={() => {
            onClose();
            openOverlay('goalEditor', { goalId: goal.id });
          }}
        >
          <span class="ico">✏️</span>Edit goal
        </button>
        <button
          class="action"
          onClick={() => {
            onClose();
            openOverlay('goalDetail', { goalId: goal.id });
          }}
        >
          <span class="ico">📊</span>Stats and history
        </button>
      </div>
    </Sheet>
  );
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Rest and sick options for one goal. A rest day (today only) spends a banked rest day that
 * covers the whole day; weekly goals rest or go sick for the whole week. Sick is always free.
 */
function DayOffActions({ goal, day, onClose }) {
  const t = today.value;
  const isToday = day === t;
  const plan = restPlan.value;
  const restOn = restRule.value.on;
  const c = lookup.value(goal.id, day);
  const ws = settings.value.weekStart;
  const wk = startOfWeek(day, ws);
  const thisWeek = wk === startOfWeek(t, ws);
  const banked = plural(plan.bank, 'rest day');
  const act = (fn, msg) => {
    tick();
    fn();
    onClose();
    showToast(msg);
  };

  if (goal.schedule === 'weekly') {
    const mark = weekMarks.value[`${goal.id}|${wk}`];
    if (mark) {
      return (
        <button class="action" onClick={() => act(() => setWeekMark(goal, wk, null), `${goal.emoji} Back on for the week`)}>
          <span class="ico">↩️</span>Undo {mark === 'rest' ? 'rest' : 'sick'} week
        </button>
      );
    }
    const canRest = plan.bank > 0 || plan.weeks.has(wk);
    return (
      <>
        {restOn && thisWeek && (
          <button class="action" disabled={!canRest} onClick={() => act(() => setWeekMark(goal, wk, 'rest'), '🛌 Rest week. Your streak keeps going.')}>
            <span class="ico">🛌</span>
            <span>
              Rest this week
              <small>{canRest ? `Uses 1 of your ${banked}` : 'No rest days banked yet. Perfect days earn them.'}</small>
            </span>
          </button>
        )}
        <button class="action" onClick={() => act(() => setWeekMark(goal, wk, 'sick'), '🤒 Sick week. Your streak is paused.')}>
          <span class="ico">🤒</span>
          <span>
            Sick {thisWeek ? 'this' : 'that'} week
            <small>Free. Your streak pauses for the week.</small>
          </span>
        </button>
      </>
    );
  }

  if (c?.skipped) {
    const kind = c.skip === 'rest' ? 'rest day' : c.skip === 'sick' ? 'sick day' : 'skip';
    return (
      <button class="action" onClick={() => act(() => setDayOff(goal, day, null), `${goal.emoji} Back on`)}>
        <span class="ico">↩️</span>Undo {kind}
      </button>
    );
  }
  const covered = plan.days.has(day);
  const canRest = plan.bank > 0 || covered;
  return (
    <>
      {restOn && isToday && (
        <button class="action" disabled={!canRest} onClick={() => act(() => setDayOff(goal, day, 'rest'), '🛌 Rest day. Your streak keeps going.')}>
          <span class="ico">🛌</span>
          <span>
            Rest day
            <small>
              {covered ? 'Today’s rest day covers it' : canRest ? `Uses 1 of your ${banked} for the whole day` : 'No rest days banked yet. Perfect days earn them.'}
            </small>
          </span>
        </button>
      )}
      <button class="action" onClick={() => act(() => setDayOff(goal, day, 'sick'), '🤒 Sick day. Your streak is paused.')}>
        <span class="ico">🤒</span>
        <span>
          Sick day
          <small>Free. Your streak pauses.</small>
        </span>
      </button>
    </>
  );
}

/** Taking a whole day off: a banked rest day (today), or a free sick day. */
export function DayOffSheet({ day, onClose }) {
  const t = today.value;
  const isToday = day === t;
  const plan = restPlan.value;
  const rule = restRule.value;
  const lk = lookup.value;
  const { due } = goalsForDay(allGoals.value, day, lk);
  const open = due.filter((g) => !isDone(g, lk(g.id, day)) && !lk(g.id, day)?.skipped);
  const off = due.filter((g) => lk(g.id, day)?.skipped);
  const rested = plan.days.has(day);
  const canRest = rule.on && isToday && open.length > 0 && (plan.bank > 0 || rested);
  const name = isToday ? 'today' : formatDay(day, { weekday: 'long' });
  const act = (fn, msg) => {
    tick();
    fn();
    onClose();
    showToast(msg);
  };

  return (
    <Sheet
      onClose={onClose}
      title={isToday ? 'Take today off?' : `${formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}`}
      sub={rule.on ? `🛌 ${plural(plan.bank, 'rest day')} banked · next one after ${plural(plan.nextIn, 'more perfect day')}` : null}
    >
      {!isToday && rested && <p class="form-note">🛌 A rest day covered what was left on this day, so your streaks kept going.</p>}
      <div class="action-list">
        {rule.on && isToday && (
          <button class="action" disabled={!canRest} onClick={() => act(() => takeDayOff(day, 'rest'), '🛌 Enjoy your rest day. Your streaks keep going.')}>
            <span class="ico">🛌</span>
            <span>
              Rest day
              <small>
                {!open.length
                  ? 'Nothing left to cover today.'
                  : canRest
                    ? `Uses 1 rest day. It covers ${open.length === 1 ? 'the goal' : `all ${open.length} goals`} left today.`
                    : 'No rest days banked yet. Perfect days earn them.'}
              </small>
            </span>
          </button>
        )}
        <button
          class="action"
          disabled={!open.length}
          onClick={() => act(() => takeDayOff(day, 'sick'), `🤒 Feel better soon. Your streaks are paused for ${name}.`)}
        >
          <span class="ico">🤒</span>
          <span>
            Sick day
            <small>Free. Every goal left {isToday ? 'today' : 'that day'} pauses.</small>
          </span>
        </button>
        {off.length > 0 && (
          <button class="action" onClick={() => act(() => off.forEach((g) => setDayOff(g, day, null)), 'Back on')}>
            <span class="ico">↩️</span>Undo the day off ({off.length})
          </button>
        )}
      </div>
      <p class="form-note" style="margin-top:14px">
        {rule.on
          ? `Miss a day without marking it and a banked rest day covers it automatically. You earn ${plural(rule.amount, 'rest day')} every ${rule.every} perfect days, up to ${rule.max} (change it in Settings). Only take what you need.`
          : 'Rest days are off. Turn them on in Settings to bank days off with perfect days.'}
      </p>
    </Sheet>
  );
}

/** The amount for a goal Apple Health fills in, in Health units, with what Health reported. */
function HealthAmount({ goal, day, count }) {
  const metric = goal.health.metric;
  const reported = health.value[day]?.[metric];
  return (
    <div class="form-group row-between">
      <div>
        <div style="font-weight:650">Amount</div>
        <div class="muted" style="font-size:13px">
          Goal: {targetLabel(goal) || METRIC[metric].label}
          {reported != null ? ` · ❤️ Health: ${formatMetric(metric, reported)}` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <input
          key={`${metric}-${count}`}
          type="number"
          inputMode="decimal"
          class="time-input"
          style="width:104px;text-align:right"
          aria-label={`Amount in ${METRIC[metric].unit}`}
          min={0}
          defaultValue={String(Math.round(fromCount(metric, count) * 10) / 10)}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if (v >= 0) setCheckin(goal, day, { count: toCount(metric, v), skipped: false });
          }}
        />
        <span class="muted">{METRIC[metric].unit}</span>
      </div>
    </div>
  );
}

/** A day from the calendar: check off (or back-fill) its goals, plus mood and a note. */
export function DaySheet({ day, onClose }) {
  const t = today.value;
  const future = day > t;
  const all = allGoals.value;
  const groups = goalsForDay(all, day, lookup.value);
  const list = [...groups.due, ...groups.weekly];
  const later = future ? [] : groups.later;
  const sum = daySummary(all, lookup.value, day);
  const n = notes.value[day];
  const [text, setText] = useState(n?.note || '');
  const textRef = useRef(text);
  textRef.current = text;
  const saveNote = () => {
    const next = textRef.current.trim().slice(0, 1000);
    if ((notes.peek()[day]?.note || '') !== next) setNote(day, { note: next });
  };
  // Save however the sheet closes, including Android's back button.
  useEffect(() => saveNote, [day]);
  const close = () => {
    saveNote();
    onClose();
  };
  const sub = future
    ? 'Coming up'
    : sum.due
      ? `${sum.done} of ${sum.due} goals done${sum.perfect ? ' · Perfect day 🔥' : ''}`
      : 'Rest day';

  return (
    <Sheet onClose={close} title={day === t ? 'Today' : formatDay(day)} sub={sub}>
      {list.length === 0 && !later.length && <p class="muted" style="margin:0 4px 12px">No goals were scheduled for this day.</p>}
      <div class="stack">
        {list.map((g) =>
          future ? (
            <div key={g.id} class="goal" style={{ '--c': colorOf(g.color), cursor: 'default' }}>
              <div class="goal-icon">{g.emoji}</div>
              <div class="goal-main">
                <div class="goal-title">{g.title}</div>
              </div>
            </div>
          ) : (
            <GoalRow key={g.id} goal={g} day={day} />
          ),
        )}
      </div>
      {later.length > 0 && (
        <>
          <h3 class="section-title">Added later</h3>
          <div class="stack later">
            {later.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                day={day}
                sub={`Added ${formatDay(addedOn(g), { month: 'short', day: 'numeric' })} · tap if you did it`}
              />
            ))}
          </div>
          <p class="faint" style="font-size:13px;margin:10px 4px 0">Only check off what you really did.</p>
        </>
      )}
      {!future && (
        <>
          <h3 class="section-title">Mood</h3>
          <div class="mood-row">
            {MOODS.map(([m, label], i) => (
              <button
                key={m}
                class={`mood${n?.mood === i + 1 ? ' on' : ''}`}
                aria-label={label}
                aria-pressed={n?.mood === i + 1}
                onClick={() => setNote(day, { mood: n?.mood === i + 1 ? null : i + 1 })}
              >
                {m}
              </button>
            ))}
          </div>
          <h3 class="section-title">Note</h3>
          <textarea
            class="textarea"
            maxLength={1000}
            placeholder="Anything worth remembering about this day?"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            onBlur={saveNote}
          />
        </>
      )}
    </Sheet>
  );
}
