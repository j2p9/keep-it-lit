import { AWARD_BY_ID } from '../lib/awards.js';
import { colorOf } from '../lib/colors.js';
import { addDays, formatDay } from '../lib/dates.js';
import { isDueOn } from '../lib/schedule.js';
import { daySummary } from '../lib/stats.js';
import { nextMilestone } from '../lib/streaks.js';
import { allGoals, awardState, clock, currentChallenge, currentGoals, lookup, profile, streaks, today } from '../lib/store.js';
import { closeWelcome, welcomeLeaving } from '../lib/ui.js';
import { WeekStrip } from '../components/chrome.jsx';
import { HealthCard } from '../components/HealthCard.jsx';

// Original encouragement, one per day.
const LINES = [
  'Small steps every day add up to big change.',
  'You don’t have to be perfect. You just have to show up.',
  'Today’s tiny win is tomorrow’s habit.',
  'Keep the flame small and steady and it never goes out.',
  'Missed a day? Never miss two.',
  'Every streak starts with day one.',
  'Make it easy, make it daily, make it yours.',
  'Be the person who does the thing.',
  'Progress loves consistency more than intensity.',
  'One more day. One more check. One more reason to be proud.',
  'The best time to start was yesterday. The next best is now.',
  'Done is better than perfect.',
  'Your future self is cheering for today’s you.',
  'Light one goal at a time.',
];

function timeOfDay(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

const GREETING = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hey there' };

export function Welcome() {
  const t = today.value;
  const time = timeOfDay(clock.value.getHours());
  const name = (profile.value?.display_name || '').split(' ')[0];
  const all = allGoals.value;
  const current = currentGoals.value;
  const lk = lookup.value;
  const st = streaks.value;
  const y = addDays(t, -1);
  const ySum = daySummary(all, lk, y);

  const grew = [];
  const saved = [];
  const lost = [];
  for (const g of current) {
    const s = st.get(g.id);
    if (!s || s.unit !== 'day') continue;
    const status = s.status.get(y);
    if (status === 'done') grew.push(g);
    else if (status === 'frozen') saved.push(g);
    else if (status === 'missed') lost.push(g);
  }

  const live = current
    .map((g) => ({ g, s: st.get(g.id) }))
    .filter((x) => x.s?.current > 0)
    .sort((a, b) => b.s.current - a.s.current);
  const next = current
    .map((g) => ({ g, s: st.get(g.id), m: st.get(g.id) && nextMilestone(st.get(g.id)) }))
    .filter((x) => x.m && x.s.current > 0)
    .sort((a, b) => a.m.left - b.m.left)[0];
  const nextDef = next && AWARD_BY_ID[`${next.s.unit === 'week' ? 'wstreak' : 'streak'}-${next.m.target}`];
  const ch = currentChallenge.value;
  const monthPerfect = awardState.value.stats.monthPerfect;
  const dueToday = current.filter((g) => isDueOn(g, t) || g.schedule === 'weekly');
  const line = LINES[Number(t.replace(/-/g, '')) % LINES.length];
  const emojis = (list) => list.map((g) => g.emoji).join(' ');

  return (
    <div
      class={`welcome${welcomeLeaving.value ? ' leaving' : ''}`}
      data-time={time}
      role="dialog"
      aria-modal="true"
      aria-label="Your day at a glance"
    >
      <div class="welcome-glow" aria-hidden="true" />
      <div class="welcome-inner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <div class="hello">
              {GREETING[time]}
              {name ? `, ${name}` : ''}
            </div>
            <div class="date">{formatDay(t)}</div>
          </div>
          <span class="flame-big" aria-hidden="true">
            🔥
          </span>
        </div>

        <section class="card" style="margin-top:22px">
          <div class="card-title">
            Yesterday
            <span class="aside">{ySum.due ? `${ySum.done} of ${ySum.due} done` : 'Rest day'}</span>
          </div>
          {ySum.due === 0 && <div class="recap-line">🌿 A rest day. Fresh energy for today.</div>}
          {ySum.perfect && <div class="recap-line">✨ Perfect day: you finished everything.</div>}
          {grew.length > 0 && (
            <div class="recap-line">
              <span>🔥</span>
              <span>
                {grew.length === 1 ? 'Streak grew' : `${grew.length} streaks grew`}: {emojis(grew)}
              </span>
            </div>
          )}
          {saved.length > 0 && (
            <div class="recap-line">
              <span>❄️</span>
              <span>A streak freeze saved {emojis(saved)}. Lucky!</span>
            </div>
          )}
          {lost.length > 0 && (
            <div class="recap-line">
              <span>💔</span>
              <span>{emojis(lost)} reset. Never miss twice: start it again today.</span>
            </div>
          )}
          {ySum.due > 0 && !ySum.perfect && !grew.length && !saved.length && !lost.length && (
            <div class="recap-line">👋 Today is a great day to start a streak.</div>
          )}
        </section>

        <HealthCard day={t} latest />

        {live.length > 0 && (
          <section class="card">
            <div class="card-title">Your streaks</div>
            <div class="streak-list">
              {live.map(({ g, s }) => (
                <div key={g.id} class="streak-card" style={{ '--c': colorOf(g.color) }}>
                  <div class="e" aria-hidden="true">
                    {g.emoji}
                  </div>
                  <div class="n">
                    {s.current >= 100 ? '💯' : '🔥'}
                    {s.current}
                    {s.unit === 'week' ? 'w' : ''}
                  </div>
                  <div class="t">{g.title}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section class="card">
          <div class="card-title">This week</div>
          <WeekStrip />
        </section>

        {(nextDef || ch) && (
          <section class="card">
            <div class="card-title">Up next</div>
            {nextDef && (
              <div style="margin-bottom:12px">
                <div style="font-weight:650">
                  {next.g.emoji} {next.g.title} is {next.m.left} {next.s.unit === 'week' ? 'week' : 'day'}
                  {next.m.left === 1 ? '' : 's'} from 🏅 {nextDef.title}
                </div>
                <div class="progress-line">
                  <i style={{ width: `${Math.round((next.s.current / next.m.target) * 100)}%` }} />
                </div>
              </div>
            )}
            {ch && (
              <div>
                <div style="font-weight:650">
                  🏔️ Monthly challenge: {Math.min(monthPerfect, ch.target)} of {ch.target} perfect days
                </div>
                <div class="progress-line">
                  <i style={{ width: `${Math.min(100, Math.round((monthPerfect / ch.target) * 100))}%` }} />
                </div>
              </div>
            )}
          </section>
        )}

        <section class="card">
          <div class="card-title">
            Today’s plan<span class="aside">{dueToday.length} {dueToday.length === 1 ? 'goal' : 'goals'}</span>
          </div>
          <div style="font-size:28px;letter-spacing:4px;line-height:1.4" aria-label={dueToday.map((g) => g.title).join(', ')}>
            {dueToday.length ? emojis(dueToday) : '🌿'}
          </div>
        </section>

        <p class="quote">“{line}”</p>
        <button class="btn btn-primary btn-block" onClick={closeWelcome}>
          Let’s go 🔥
        </button>
      </div>
    </div>
  );
}
