import { useRef } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { addDays, addMonths, endOfMonth, formatDay, formatMonth, minKey, startOfMonth, startOfWeek, weekday, weekdayLetters } from '../lib/dates.js';
import { isDone } from '../lib/schedule.js';
import { daySummary, firstDay, goalRate, habitStrength } from '../lib/stats.js';
import { allGoals, goals, lookup, restPlan, settings, streaks, today } from '../lib/store.js';
import { openOverlay, setUi, uiState } from '../lib/ui.js';
import { Ring } from '../components/Ring.jsx';
import { IconBack, IconCheck, IconNext } from '../components/icons.jsx';

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);

const WEEK_BADGE = { done: null, rest: '🛌', frozen: '❄️', missed: '', skipped: '–' };

/**
 * A weekly goal's calendar, one row per week: the days it was done, and the week's result
 * (hit, rest week, sick, freeze, missed, or this week's progress). Tap a week's result to rest
 * it or mark it sick, or a day to fill it in.
 */
function WeekCalendar({ goal, st, month, from }) {
  const t = today.value;
  const ws = settings.value.weekStart;
  const lk = lookup.value;
  const color = colorOf(goal.color);
  const weeks = [];
  for (let wk = startOfWeek(month, ws); wk <= endOfMonth(month); wk = addDays(wk, 7)) weeks.push(wk);
  return (
    <div class={`week-cal from-${from}`} key={month} style={{ '--c': color }}>
      <div class="wc-row wc-head" aria-hidden="true">
        {weekdayLetters(ws).map((l, i) => (
          <span key={i} class="wc-day">
            {l}
          </span>
        ))}
        <span class="wc-week">Week</span>
      </div>
      {weeks.map((wk) => {
        const end = addDays(wk, 6);
        const started = end >= goal.start_on;
        const info = started ? st?.weeks?.get(wk) : null;
        const status = wk > t || !started ? 'none' : st?.status.get(wk) || 'none';
        const sick = info?.mark === 'sick';
        const label = `Week of ${formatDay(wk, { month: 'short', day: 'numeric' })}: ${info ? `${info.done} of ${info.required}` : 'not started'}`;
        return (
          <div key={wk} class={`wc-row ${status}`}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(wk, i);
              const c = lk(goal.id, d);
              const done = isDone(goal, c);
              const cls = `wc-day${done ? ' done' : ''}${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === t ? ' today' : ''}${d > t ? ' future' : ''}`;
              const inner = done ? <IconCheck size={13} /> : c?.skipped ? (c.skip === 'sick' ? '🤒' : '–') : Number(d.slice(8));
              return d > t ? (
                <span key={d} class={cls} aria-hidden="true">
                  {Number(d.slice(8))}
                </span>
              ) : (
                <button key={d} class={cls} aria-label={`${formatDay(d)}${done ? ': done' : ''}`} onClick={() => openOverlay('daySheet', { day: d })}>
                  {inner}
                </button>
              );
            })}
            {status === 'none' ? (
              <span class="wc-week" />
            ) : (
              <button
                class="wc-week"
                aria-label={`${label}, ${sick ? 'sick' : status}`}
                onClick={() => openOverlay('goalActions', { goalId: goal.id, day: minKey(end, t) })}
              >
                {status === 'pending' ? (
                  <Ring size={34} stroke={3.5} value={info?.required ? info.done / info.required : 0} color={color}>
                    <span class="wc-n">
                      {info?.done || 0}/{info?.required ?? goal.per_week}
                    </span>
                  </Ring>
                ) : (
                  <span class={`wc-badge ${status}`}>{status === 'done' ? <IconCheck size={16} /> : sick ? '🤒' : WEEK_BADGE[status]}</span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Calendar() {
  const t = today.value;
  const ui = uiState.value;
  const thisMonth = startOfMonth(t);
  const month = ui.calMonth && ui.calMonth < thisMonth ? ui.calMonth : thisMonth;
  const ws = settings.value.weekStart;
  const list = allGoals.value;
  const goal = ui.calGoal !== 'all' ? goals.value[ui.calGoal] : null;
  const selected = goal && !goal.deleted_at ? goal : null;
  const lk = lookup.value;
  const st = selected ? streaks.value.get(selected.id) : null;
  const first = firstDay(list);
  const touch = useRef(null);
  // Slide the month in from the direction you moved.
  const nav = useRef({ month: null, from: 'none' });
  if (nav.current.month !== month) {
    const before = nav.current.month;
    nav.current = { month, from: before == null ? 'none' : month > before ? 'right' : 'left' };
  }

  const days = [];
  for (let d = startOfWeek(month, ws); d <= endOfMonth(month) || days.length % 7; d = addDays(d, 1)) days.push(d);

  const go = (n) => {
    const next = addMonths(month, n);
    if (next <= thisMonth) setUi({ calMonth: next });
  };

  // Status of one day for the selected goal: done, rest, frozen, skipped, missed, pending, off or none.
  const goalStatus = (d) => {
    if (!selected || d < selected.start_on || d > t) return 'none';
    const c = lk(selected.id, d);
    if (selected.schedule === 'weekly') return c?.skipped ? 'skipped' : isDone(selected, c) ? 'done' : 'off';
    return st?.status.get(d) || 'none';
  };
  const linked = (s) => s === 'done' || s === 'frozen' || s === 'rest';
  const rested = restPlan.value.days;
  const weekly = selected?.schedule === 'weekly';

  // Month summary
  const to = minKey(endOfMonth(month), t);
  let perfect = 0;
  let due = 0;
  let done = 0;
  let run = 0;
  let bestRun = 0;
  if (first && to >= month) {
    for (let d = month < first ? first : month; d <= to; d = addDays(d, 1)) {
      const s = daySummary(list, lk, d);
      due += s.due;
      done += s.done;
      if (s.perfect) {
        perfect += 1;
        run += 1;
        bestRun = Math.max(bestRun, run);
      } else if (s.due && d !== t) run = 0;
    }
  }

  return (
    <main class="screen" aria-label="Calendar">
      <div class="inner">
        <header class="page-head">
          <div class="head-title">
            <div class="eyebrow">History</div>
            <h1 class="title">Calendar</h1>
          </div>
        </header>

        <div class="chips" role="tablist" aria-label="Show goal">
          <button role="tab" aria-selected={!selected} class={`chip${!selected ? ' on' : ''}`} onClick={() => setUi({ calGoal: 'all' })}>
            All goals
          </button>
          {list.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={selected?.id === g.id}
              class={`chip${selected?.id === g.id ? ' on' : ''}`}
              onClick={() => setUi({ calGoal: g.id })}
            >
              {g.emoji} {g.title}
            </button>
          ))}
        </div>

        <section
          class="card"
          onTouchStart={(e) => (touch.current = [e.touches[0].clientX, e.touches[0].clientY])}
          onTouchEnd={(e) => {
            if (!touch.current) return;
            const dx = e.changedTouches[0].clientX - touch.current[0];
            const dy = e.changedTouches[0].clientY - touch.current[1];
            touch.current = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          <div class="month-nav">
            <h2>{formatMonth(month)}</h2>
            {month !== thisMonth && (
              <button class="pill" onClick={() => setUi({ calMonth: null })}>
                Today
              </button>
            )}
            <button class="icon-btn" aria-label="Previous month" onClick={() => go(-1)}>
              <IconBack size={20} />
            </button>
            <button class="icon-btn" aria-label="Next month" disabled={month >= thisMonth} onClick={() => go(1)}>
              <IconNext size={20} />
            </button>
          </div>

          {weekly ? (
            <WeekCalendar goal={selected} st={st} month={month} from={nav.current.from} />
          ) : (
          <div class={`cal-grid from-${nav.current.from}`} key={month}>
            {weekdayLetters(ws).map((l, i) => (
              <div key={i} class="cal-wd" aria-hidden="true">
                {l}
              </div>
            ))}
            {days.map((d) => {
              if (d.slice(0, 7) !== month.slice(0, 7)) return <div key={d} aria-hidden="true" />;
              const future = d > t;
              const before = !first || d < first;
              // Earlier days stay tappable, so goals added later can be filled in for them.
              const tappable = !future;
              const col = (weekday(d) - ws + 7) % 7;
              let cls = 'cal-day';
              let mark = null;
              let label = d;
              if (d === t) cls += ' today';
              if (future) cls += ' future';
              else if (before) cls += ' before';
              else if (selected) {
                const s = goalStatus(d);
                const color = colorOf(selected.color);
                if (linked(s)) {
                  const prev = col > 0 && linked(goalStatus(addDays(d, -1)));
                  const next = col < 6 && linked(goalStatus(addDays(d, 1)));
                  if (prev || next) cls += ' chain';
                  if (!prev) cls += ' chain-start';
                  if (!next) cls += ' chain-end';
                }
                if (s === 'done') mark = <span class="cal-dot done"><IconCheck size={14} /></span>;
                else if (s === 'rest') mark = <span aria-hidden="true">🛌</span>;
                else if (s === 'frozen') mark = <span aria-hidden="true">❄️</span>;
                else if (s === 'skipped') mark = lk(selected.id, d)?.skip === 'sick' ? <span aria-hidden="true">🤒</span> : <span class="faint">–</span>;
                else if (s === 'missed' || s === 'pending') mark = <span class="cal-dot missed" />;
                else if (s === 'off') mark = <span class="cal-dot rest" />;
                label = `${d}: ${s}`;
                return (
                  <button key={d} class={cls} style={{ '--c': color }} aria-label={label} onClick={() => openOverlay('daySheet', { day: d })}>
                    <span class="cal-num">{Number(d.slice(8))}</span>
                    <span class="cal-mark">{mark}</span>
                  </button>
                );
              } else {
                const s = daySummary(list, lk, d);
                label = s.due ? `${d}: ${s.done} of ${s.due}` : `${d}: nothing due`;
                if (rested.has(d)) label += ', rest day used';
                mark = s.due ? (
                  <Ring size={30} stroke={4.5} value={s.fill} color={s.perfect ? 'url(#kil-flame)' : 'var(--accent)'} glow={s.perfect}>
                    {s.perfect ? <span style="font-size:11px">🔥</span> : rested.has(d) ? <span style="font-size:11px">🛌</span> : null}
                  </Ring>
                ) : (
                  <span class="cal-dot rest" />
                );
              }
              return tappable ? (
                <button key={d} class={cls} aria-label={label} onClick={() => openOverlay('daySheet', { day: d })}>
                  <span class="cal-num">{Number(d.slice(8))}</span>
                  <span class="cal-mark">{mark}</span>
                </button>
              ) : (
                <div key={d} class={cls} aria-hidden="true">
                  <span class="cal-num">{Number(d.slice(8))}</span>
                  <span class="cal-mark" />
                </div>
              );
            })}
          </div>
          )}

          <div class="legend" aria-hidden="true">
            {weekly ? (
              <>
                <span>✔ Week hit</span>
                <span>🛌 Rest week</span>
                <span>🤒 Sick</span>
                <span>❄️ Freeze</span>
                <span>○ Missed</span>
              </>
            ) : selected ? (
              <>
                <span>✔ Done</span>
                <span>🛌 Rest day</span>
                <span>🤒 Sick</span>
                <span>❄️ Freeze</span>
                <span>○ Missed</span>
              </>
            ) : (
              <>
                <span>🔥 Perfect day</span>
                <span>◔ Partly done</span>
                <span>🛌 Rest day used</span>
                <span>• Nothing due</span>
              </>
            )}
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            {selected ? `${selected.emoji} ${selected.title}` : formatMonth(month, { month: 'long' })}
            <span class="aside">{selected ? 'all time' : 'this month'}</span>
          </div>
          {selected && st ? (
            <div class="stat-row">
              <div class="stat">
                <div class="v">{st.current}</div>
                <div class="k">Current {st.unit === 'week' ? 'weeks' : 'streak'}</div>
              </div>
              <div class="stat">
                <div class="v">{st.best}</div>
                <div class="k">Best streak</div>
              </div>
              <div class="stat">
                <div class="v">{pct(habitStrength(st))}</div>
                <div class="k">Strength</div>
              </div>
            </div>
          ) : (
            <div class="stat-row">
              <div class="stat">
                <div class="v">{perfect}</div>
                <div class="k">Perfect days</div>
              </div>
              <div class="stat">
                <div class="v">{pct(due ? done / due : null)}</div>
                <div class="k">Completed</div>
              </div>
              <div class="stat">
                <div class="v">{bestRun}</div>
                <div class="k">Best run</div>
              </div>
            </div>
          )}
          {selected && st && (
            <p class="muted" style="font-size:14px;margin-top:12px">
              Last 30 days: {pct(goalRate(st, addDays(t, -30), addDays(t, -1)))} done. Tap any day to fill it in or add a note.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
