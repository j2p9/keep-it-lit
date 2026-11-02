import { AWARD_BY_ID, AWARD_SECTIONS, AWARDS, awardIdOf, awardProgress } from '../lib/awards.js';
import { daysBetween, endOfMonth, formatDay, formatMonth } from '../lib/dates.js';
import { awardState, currentChallenge, goals, today } from '../lib/store.js';
import { openOverlay } from '../lib/ui.js';
import { defForKey } from '../components/chrome.jsx';
import { Medal } from '../components/Medal.jsx';
import { Ring } from '../components/Ring.jsx';
import { Sheet } from '../components/Sheet.jsx';

const shortDay = (d) => formatDay(d, { month: 'short', day: 'numeric', year: 'numeric' });

/** Every award your history currently earns. Undo the check-offs behind one and it goes away. */
function earnedInstances() {
  const all = awardState.value.earned;
  const byDef = new Map();
  for (const [key, day] of all) {
    const id = awardIdOf(key);
    if (!AWARD_BY_ID[id]) continue;
    if (!byDef.has(id)) byDef.set(id, []);
    byDef.get(id).push({ key, day });
  }
  for (const list of byDef.values()) list.sort((a, b) => (a.day < b.day ? 1 : -1));
  return { all, byDef };
}

export function Awards() {
  const { all, byDef } = earnedInstances();
  const { stats } = awardState.value;
  const ch = currentChallenge.value;
  const got = byDef.size;
  const recent = [...all].sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 8);

  return (
    <main class="screen" aria-label="Awards">
      <div class="inner">
        <header class="page-head">
          <div class="head-title">
            <div class="eyebrow">Achievements</div>
            <h1 class="title">Awards</h1>
          </div>
        </header>

        <section class="card awards-hero">
          <Ring size={86} stroke={10} value={got / AWARDS.length} glow label={`${got} of ${AWARDS.length} awards`}>
            <div class="num" style="font-size:22px;font-weight:850">
              {got}
            </div>
          </Ring>
          <div>
            <div class="hero-big">
              {got} of {AWARDS.length} earned
            </div>
            <div class="hero-sub">{all.size} awards in total, counting repeats. Some are secret.</div>
          </div>
        </section>

        {ch && <ChallengeCard target={ch.target} month={ch.month} value={stats.monthPerfect} />}

        {recent.length > 0 && (
          <>
            <h2 class="section-title">Recent</h2>
            <div class="recent-row">
              {recent.map(([key, day]) => {
                const def = defForKey(key);
                const goal = goals.value[key.split(':')[1]];
                return (
                  <button key={key} class="medal-tile" onClick={() => openOverlay('awardDetail', { id: def.id })}>
                    <Medal def={def} size={78} />
                    <span class="name">{def.title}</span>
                    <span class="meta">{goal ? `${goal.emoji} ` : ''}{shortDay(day)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {AWARD_SECTIONS.map(([section, label]) => (
          <section key={section} aria-label={label}>
            <h2 class="section-title">{label}</h2>
            <div class="medal-grid">
              {AWARDS.filter((a) => a.section === section).map((def) => (
                <AwardTile key={def.id} def={def} list={byDef.get(def.id) || []} stats={stats} ch={ch} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function AwardTile({ def, list, stats, ch }) {
  const earned = list.length > 0;
  const secret = def.secret && !earned;
  const progress = earned ? null : awardProgress(def, stats, ch?.target);
  const shown = def.id === 'challenge' && list[0] ? defForKey(list[0].key) : def;
  return (
    <button class={`medal-tile${earned ? '' : ' locked'}`} onClick={() => openOverlay('awardDetail', { id: def.id })}>
      <Medal def={shown} size={82} locked={!earned} secret={secret} count={def.repeat ? list.length : 0} />
      <span class="name">{secret ? 'Secret' : def.title}</span>
      {earned ? (
        <span class="meta">{list.length > 1 ? `Last ${shortDay(list[0].day)}` : shortDay(list[0].day)}</span>
      ) : progress ? (
        <>
          <span class="medal-progress" aria-hidden="true">
            <i style={{ width: `${Math.round((progress[0] / progress[1]) * 100)}%` }} />
          </span>
          <span class="meta">
            {progress[0]} / {progress[1]}
          </span>
        </>
      ) : (
        <span class="meta">{secret ? 'Keep going…' : 'Locked'}</span>
      )}
    </button>
  );
}

export function ChallengeCard({ target, month, value }) {
  const def = { ...AWARD_BY_ID.challenge, label: formatMonth(month, { month: 'short' }).toUpperCase() };
  const left = daysBetween(today.value, endOfMonth(month)) + 1;
  const done = value >= target;
  return (
    <section class="card" style="display:flex;gap:14px;align-items:center">
      <Medal def={def} size={64} locked={!done} />
      <div style="flex:1;min-width:0">
        <div style="font-weight:750">{formatMonth(month, { month: 'long' })} challenge</div>
        <div class="muted" style="font-size:14px;margin-top:2px">
          {done ? 'Complete! 🎉' : `Have ${target} perfect days this month · ${left} ${left === 1 ? 'day' : 'days'} left`}
        </div>
        <div class="progress-line">
          <i style={{ width: `${Math.min(100, Math.round((value / target) * 100))}%` }} />
        </div>
        <div class="faint" style="font-size:12px;margin-top:6px">
          {Math.min(value, target)} of {target} perfect days
        </div>
      </div>
    </section>
  );
}

export function AwardSheet({ id, onClose }) {
  const def = AWARD_BY_ID[id];
  if (!def) return null;
  const { byDef } = earnedInstances();
  const list = byDef.get(id) || [];
  const earned = list.length > 0;
  const secret = def.secret && !earned;
  const progress = earned ? null : awardProgress(def, awardState.value.stats, currentChallenge.value?.target);
  const shown = def.id === 'challenge' && list[0] ? defForKey(list[0].key) : def;
  return (
    <Sheet onClose={onClose} label={secret ? 'Secret award' : def.title}>
      <div class="award-detail">
        <Medal def={shown} size={150} locked={!earned} secret={secret} count={def.repeat ? list.length : 0} />
        <h2>{secret ? 'Secret award' : def.title}</h2>
        <p>{secret ? 'Keep checking off your goals to discover this one.' : def.desc}</p>
        {progress && (
          <div style="max-width:260px;margin:16px auto 0">
            <div class="progress-line">
              <i style={{ width: `${Math.round((progress[0] / progress[1]) * 100)}%` }} />
            </div>
            <div class="faint" style="font-size:13px;margin-top:6px">
              {progress[0]} of {progress[1]}
            </div>
          </div>
        )}
      </div>
      {earned && (
        <div class="earned-list">
          <h3 class="section-title">{list.length > 1 ? `Earned ${list.length} times` : 'Earned'}</h3>
          <div class="action-list">
            {list.slice(0, 30).map(({ key, day }) => {
              const goal = goals.value[key.split(':')[1]];
              return (
                <div key={key} class="action" style="cursor:default">
                  <span class="ico">{goal ? goal.emoji : '🏅'}</span>
                  <span style="flex:1">{goal ? goal.title : def.title}</span>
                  <span class="muted" style="font-size:14px">
                    {shortDay(day)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
