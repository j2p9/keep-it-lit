import { useMemo, useState } from 'preact/hooks';
import { colorOf } from '../lib/colors.js';
import { addDays } from '../lib/dates.js';
import { scheduleLabel, targetLabel } from '../lib/schedule.js';
import { chartSeries, doneByDay, goalRate, habitStrength, highlights, periodStats, rangeBounds } from '../lib/stats.js';
import {
  allGoals,
  archiveGoal,
  archivedGoals,
  checkinList,
  currentGoals,
  deleteGoal,
  goals,
  lookup,
  settings,
  streaks,
  today,
  unarchiveGoal,
} from '../lib/store.js';
import { openOverlay, setUi, showToast, uiState } from '../lib/ui.js';
import { BarChart, Heatmap } from '../components/charts.jsx';
import { Segmented } from '../components/controls.jsx';
import { Ring } from '../components/Ring.jsx';
import { Page } from '../components/Sheet.jsx';
import { IconNext } from '../components/icons.jsx';
import { GoalShelf } from './Awards.jsx';

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const RANGE_TEXT = { week: 'Last 7 days', month: 'Last 30 days', year: 'Last 12 months' };

export function Progress() {
  const t = today.value;
  const range = uiState.value.range;
  const all = allGoals.value;
  const current = currentGoals.value;
  const lk = lookup.value;
  const st = streaks.value;
  const [sel, setSel] = useState(null);

  const doneMap = useMemo(() => doneByDay(all, checkinList.value), [all, checkinList.value]);
  const b = rangeBounds(range, t);
  const cur = periodStats(all, lk, b.from, b.to, doneMap);
  const prev = periodStats(all, lk, b.prevFrom, b.prevTo, doneMap);
  const series = chartSeries(all, lk, range, t);
  const diff = cur.pct != null && prev.pct != null && prev.due > 0 ? Math.round((cur.pct - prev.pct) * 100) : null;
  const best = current
    .map((g) => ({ g, s: st.get(g.id) }))
    .filter((x) => x.s?.current > 0)
    .sort((a, b2) => b2.s.current - a.s.current)[0];
  const hl = highlights({ goals: all, lookup: lk, today: t, streaks: st });
  const point = sel != null ? series[sel] : null;

  return (
    <main class="screen" aria-label="Progress">
      <div class="inner">
        <header class="page-head">
          <div class="head-title">
            <div class="eyebrow">Trends</div>
            <h1 class="title">Progress</h1>
          </div>
        </header>

        <Segmented
          label="Range"
          options={[
            ['week', 'Week'],
            ['month', 'Month'],
            ['year', 'Year'],
          ]}
          value={range}
          onChange={(v) => {
            setSel(null);
            setUi({ range: v });
          }}
        />

        <div class="tiles">
          <div class="tile">
            <div class="k">✅ Completed</div>
            <div class="v">{pct(cur.pct)}</div>
            {diff != null && (
              <div class={`d ${diff >= 0 ? 'up' : 'down'}`}>
                {diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}% vs before
              </div>
            )}
          </div>
          <div class="tile">
            <div class="k">✨ Perfect days</div>
            <div class="v">
              {cur.perfect}
              <small> / {cur.tracked}</small>
            </div>
            <div class="d faint">{prev.tracked ? `${prev.perfect} before` : 'Keep going'}</div>
          </div>
          <div class="tile">
            <div class="k">☑️ Check-ins</div>
            <div class="v">{cur.checkins}</div>
            <div class="d faint">{RANGE_TEXT[range].toLowerCase()}</div>
          </div>
          <div class="tile">
            <div class="k">🔥 Top streak</div>
            <div class="v">{best ? best.s.current : 0}</div>
            <div class="d faint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              {best ? `${best.g.emoji} ${best.g.title}` : 'Start one today'}
            </div>
          </div>
        </div>

        <section class="card">
          <div class="card-title">
            {range === 'year' ? 'Monthly completion' : 'Daily completion'}
            <span class="aside">{RANGE_TEXT[range]}</span>
          </div>
          <div class="chart-tip" aria-live="polite">
            {point ? (
              <>
                <b>{point.title}</b> · {point.value == null ? 'nothing due' : `${pct(point.value)} (${point.done} of ${point.due})`}
              </>
            ) : (
              'Tap a bar for details. Dashed line: your average.'
            )}
          </div>
          <BarChart data={series} selected={sel} onSelect={(i) => setSel(sel === i ? null : i)} />
        </section>

        {hl.length > 0 && (
          <section class="card">
            <div class="card-title">Highlights</div>
            {hl.map((h) => (
              <div key={h.text} class="highlight">
                <span class="hi" aria-hidden="true">
                  {h.icon}
                </span>
                <span>{h.text}</span>
              </div>
            ))}
          </section>
        )}

        {current.length > 0 && (
          <section class="card">
            <div class="card-title">
              Your goals<span class="aside">last 30 days</span>
            </div>
            {current.map((g) => (
              <GoalStat key={g.id} goal={g} />
            ))}
          </section>
        )}

        {archivedGoals.value.length > 0 && (
          <section class="card">
            <div class="card-title">Archived</div>
            {archivedGoals.value.map((g) => (
              <GoalStat key={g.id} goal={g} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function GoalStat({ goal }) {
  const t = today.value;
  const s = streaks.value.get(goal.id);
  const rate = goalRate(s, addDays(t, -30), addDays(t, -1));
  const strength = habitStrength(s);
  const color = colorOf(goal.color);
  const unit = s?.unit === 'week' ? 'w' : '';
  return (
    <button class="goal-stat" style={{ '--c': color }} onClick={() => openOverlay('goalDetail', { goalId: goal.id })}>
      <div class="goal-icon" style="width:40px;height:40px;font-size:21px;border-radius:13px" aria-hidden="true">
        {goal.emoji}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{goal.title}</div>
        <div class="muted" style="font-size:13px;margin-top:2px">
          🔥 {s?.current || 0}
          {unit} · best {s?.best || 0}
          {unit} · {pct(rate)}
        </div>
        <div class="mini-bar">
          <i style={{ width: `${Math.round((rate || 0) * 100)}%` }} />
        </div>
      </div>
      <Ring size={42} stroke={5} value={strength} color={color} label={`Habit strength ${pct(strength)}`}>
        <span style="font-size:11px;font-weight:800" class="num">
          {Math.round(strength * 100)}
        </span>
      </Ring>
      <IconNext size={18} style="color:var(--text-3)" />
    </button>
  );
}

/** Everything about one goal: streaks, strength, heatmap, next award. */
export function GoalDetail({ goalId, onClose }) {
  const goal = goals.value[goalId];
  if (!goal) return null;
  const t = today.value;
  const s = streaks.value.get(goal.id);
  const color = colorOf(goal.color);
  const rate = goalRate(s, addDays(t, -30), addDays(t, -1));
  const doneTotal = checkinList.value.filter((c) => c.goal_id === goal.id && !c.skipped && c.count >= goal.target).length;
  const archived = goal.archived_on && goal.archived_on <= t;

  return (
    <Page
      title={goal.title}
      onBack={onClose}
      right={
        <button
          class="bar-btn right"
          onClick={() => {
            onClose();
            openOverlay('goalEditor', { goalId: goal.id });
          }}
        >
          Edit
        </button>
      }
    >
      <div class="detail-hero" style={{ '--c': color }}>
        <div class="goal-icon" aria-hidden="true">
          {goal.emoji}
        </div>
        <h2>{goal.title}</h2>
        <div class="muted" style="margin-top:4px">
          {scheduleLabel(goal)}
          {goal.target > 1 ? ` · ${targetLabel(goal)}` : ''}
          {archived ? ' · Archived' : ''}
        </div>
      </div>

      <div class="stat-row">
        <div class="stat">
          <div class="v">🔥 {s?.current || 0}</div>
          <div class="k">{s?.unit === 'week' ? 'Weeks now' : 'Current'}</div>
        </div>
        <div class="stat">
          <div class="v">{s?.best || 0}</div>
          <div class="k">Best streak</div>
        </div>
        <div class="stat">
          <div class="v">{pct(habitStrength(s))}</div>
          <div class="k">Strength</div>
        </div>
      </div>
      <div class="stat-row" style="margin-top:8px">
        <div class="stat">
          <div class="v">{pct(rate)}</div>
          <div class="k">Last 30 days</div>
        </div>
        <div class="stat">
          <div class="v">❄️ {s?.freezes || 0}</div>
          <div class="k">Freezes saved</div>
        </div>
        <div class="stat">
          <div class="v">{doneTotal}</div>
          <div class="k">Times done</div>
        </div>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-title">
          History<span class="aside">26 weeks</span>
        </div>
        <Heatmap goal={goal} streak={s} lookup={lookup.value} today={t} weekStart={settings.value.weekStart} />
      </section>

      <GoalShelf goal={goal} heading={false} />

      <p class="faint" style="font-size:13px;margin:14px 6px">
        Each goal earns a ❄️ streak freeze for every {s?.unit === 'week' ? '4 weeks' : '7 days'} in a row (up to 2). A freeze is used
        automatically if you miss a day, so your streak survives.
      </p>

      <div class="stack" style="margin-top:8px">
        {archived ? (
          <button
            class="btn btn-secondary btn-block"
            onClick={() => {
              unarchiveGoal(goal);
              showToast(`${goal.emoji} Back on your list`);
            }}
          >
            Restore goal
          </button>
        ) : (
          <button
            class="btn btn-secondary btn-block"
            onClick={() => {
              archiveGoal(goal);
              showToast(`${goal.emoji} Archived. Its history is kept.`);
              onClose();
            }}
          >
            Archive goal
          </button>
        )}
        <button
          class="btn btn-danger btn-block"
          onClick={() => {
            if (!confirm(`Delete “${goal.title}” and its history? This can’t be undone.`)) return;
            deleteGoal(goal);
            showToast('Goal deleted');
            onClose();
          }}
        >
          Delete goal
        </button>
      </div>
    </Page>
  );
}
