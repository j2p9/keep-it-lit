import { useEffect } from 'preact/hooks';
import { AWARD_BY_ID, awardIdOf } from '../lib/awards.js';
import { confetti } from '../lib/confetti.js';
import { addDays, formatMonth, startOfWeek, weekdayLetters } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { daySummary } from '../lib/stats.js';
import { allGoals, goals, lookup, markAwardsSeen, settings, today } from '../lib/store.js';
import { celebrations, hideToast, setUi, toast, uiState } from '../lib/ui.js';
import { Medal } from './Medal.jsx';
import { IconCalendar, IconChart, IconCheck, IconFlame, IconMedal } from './icons.jsx';

const TABS = [
  ['today', 'Today', IconFlame],
  ['calendar', 'Calendar', IconCalendar],
  ['progress', 'Progress', IconChart],
  ['awards', 'Awards', IconMedal],
];

export function TabBar() {
  const tab = uiState.value.tab;
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map(([key, label, Icon]) => (
        <button
          key={key}
          class={`tab${tab === key ? ' on' : ''}`}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => {
            if (tab === key) return;
            tick();
            setUi({ tab: key });
          }}
        >
          <Icon size={25} sw={tab === key ? 2.3 : 1.9} />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" role="status" aria-live="polite" key={t.id}>
      <span class="msg">{t.text}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action.fn();
            hideToast();
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

export function Splash({ text }) {
  return (
    <div class="splash" role="status">
      <div>
        <div class="flame-big" aria-hidden="true">
          🔥
        </div>
        {text && <p>{text}</p>}
      </div>
    </div>
  );
}

/** Award definition for a stored key, with the month shown on monthly challenge medals. */
export function defForKey(key) {
  const def = AWARD_BY_ID[awardIdOf(key)];
  if (!def) return null;
  if (def.id === 'challenge') {
    const month = key.split(':')[1];
    return { ...def, label: formatMonth(`${month}-01`, { month: 'short' }).toUpperCase() };
  }
  return def;
}

/** Full-screen moment for each newly earned award, one at a time. */
export function Celebration() {
  const queue = celebrations.value.filter((c) => defForKey(c.award_key));
  const item = queue[0];
  useEffect(() => {
    if (!item) return;
    tick();
    confetti({ y: 0.38 });
  }, [item?.award_key]);
  if (!item) return null;
  const def = defForKey(item.award_key);
  const goal = goals.value[item.award_key.split(':')[1]];
  const rest = queue.length - 1;
  const next = () => {
    markAwardsSeen([item.award_key]);
    celebrations.value = queue.slice(1);
  };
  const skipAll = () => {
    markAwardsSeen(queue.map((q) => q.award_key));
    celebrations.value = [];
  };
  return (
    <div class="celebrate" role="dialog" aria-modal="true" aria-label={`New award: ${def.title}`}>
      <Medal def={def} size={176} />
      <div class="kicker">New award</div>
      <h2>{def.title}</h2>
      <p>
        {goal ? `${goal.emoji} ${goal.title}. ` : ''}
        {def.desc}
      </p>
      <button class="btn btn-primary" onClick={next} autoFocus>
        {rest ? `Nice! · ${rest} more` : 'Nice!'}
      </button>
      {rest > 1 && (
        <button class="btn btn-ghost" style="color:rgba(255,255,255,.7)" onClick={skipAll}>
          Skip the rest
        </button>
      )}
    </div>
  );
}

/** This week at a glance, Duolingo-style. */
export function WeekStrip() {
  const t = today.value;
  const ws = settings.value.weekStart;
  const start = startOfWeek(t, ws);
  const letters = weekdayLetters(ws);
  const list = allGoals.value;
  const lk = lookup.value;
  return (
    <div class="week-strip">
      {letters.map((letter, i) => {
        const day = addDays(start, i);
        const s = daySummary(list, lk, day);
        let cls = 'dot';
        if (day <= t) {
          if (s.due === 0) cls += ' rest';
          else if (s.perfect) cls += ' perfect';
          else if (s.done > 0) cls += ' partial';
        }
        if (day === t) cls += ' today';
        return (
          <div key={day} aria-label={`${letter}: ${s.perfect ? 'perfect' : `${s.done} of ${s.due}`}`}>
            <div class="wd">{letter}</div>
            <div class={cls} style={day > t ? 'opacity:.4' : undefined}>
              {s.perfect && day <= t && <IconCheck size={16} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
