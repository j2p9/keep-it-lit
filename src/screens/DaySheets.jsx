import { useState } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { formatDay } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { isActiveOn, isDone, isDueOn, isWeekly, targetLabel } from '../lib/schedule.js';
import { daySummary } from '../lib/stats.js';
import { allGoals, goals, lookup, notes, setCheckin, setNote, streaks, today } from '../lib/store.js';
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
  const skipped = Boolean(c?.skipped);
  const s = streaks.value.get(goal.id);
  const isToday = day === today.value;
  const when = isToday ? 'today' : 'this day';
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

      {goal.target > 1 && (
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
      )}

      <div class="action-list">
        <button
          class="action"
          onClick={() => {
            tick();
            setCheckin(goal, day, { count: done ? 0 : goal.target, skipped: false });
            onClose();
          }}
        >
          <span class="ico">{done ? '↩️' : '✅'}</span>
          {done ? 'Mark as not done' : 'Mark as done'}
        </button>
        <button
          class="action"
          onClick={() => {
            setCheckin(goal, day, { skipped: !skipped });
            onClose();
            showToast(skipped ? 'Unskipped' : `Skipped ${when}. Your streak is safe.`);
          }}
        >
          <span class="ico">⏭️</span>
          <span>
            {skipped ? 'Unskip' : `Skip ${when}`}
            <small>Rest or sick day. Doesn’t break your streak.</small>
          </span>
        </button>
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

/** A day from the calendar: check off (or back-fill) its goals, plus mood and a note. */
export function DaySheet({ day, onClose }) {
  const t = today.value;
  const future = day > t;
  const all = allGoals.value;
  const list = all.filter((g) => isActiveOn(g, day) && (isDueOn(g, day) || isWeekly(g)));
  const sum = daySummary(all, lookup.value, day);
  const n = notes.value[day];
  const [text, setText] = useState(n?.note || '');
  const saveNote = () => {
    if ((n?.note || '') !== text.trim()) setNote(day, { note: text.trim().slice(0, 1000) });
  };
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
      {list.length === 0 && <p class="muted" style="margin:0 4px 12px">No goals were scheduled for this day.</p>}
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
