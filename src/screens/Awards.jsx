import { useEffect, useRef } from 'preact/hooks';
import { AWARD_BY_ID, AWARD_SECTIONS, AWARDS, awardIdOf, awardProgress, goalShelf } from '../lib/awards.js';
import { colorOf } from '../lib/colors.js';
import { daysBetween, endOfMonth, formatDay, formatMonth } from '../lib/dates.js';
import { archivedGoals, awardState, currentChallenge, currentGoals, goals, streaks, today } from '../lib/store.js';
import { openOverlay, setUi, uiState } from '../lib/ui.js';
import { defForKey } from '../components/chrome.jsx';
import { Segmented } from '../components/controls.jsx';
import { Medal } from '../components/Medal.jsx';
import { Ring } from '../components/Ring.jsx';
import { Sheet } from '../components/Sheet.jsx';

const shortDay = (d) => formatDay(d, { month: 'short', day: 'numeric', year: 'numeric' });
const GENERAL = AWARDS.filter((a) => !a.perGoal);

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

/** What a locked medal on a goal's shelf asks for: "30 days", "12 weeks", "100 times". */
function needs(def) {
  const n = def.target.toLocaleString();
  if (def.metric === 'goalDone') return `${n} times`;
  return def.metric === 'weekStreak' ? `${n} weeks` : `${n} days`;
}

/** One goal's own awards: its streak medals, then times done. */
export function GoalShelf({ goal, heading = true }) {
  const { earned, stats } = awardState.value;
  const shelf = goalShelf(goal, streaks.value.get(goal.id), earned, stats.goalDone?.get(goal.id) || 0);
  const got = shelf.filter((x) => x.day).length;
  const next = shelf.find((x) => !x.day);
  const row = useRef(null);
  const nextRef = useRef(null);
  // Start the row at the next medal to earn, so progress is in view.
  useEffect(() => {
    const el = nextRef.current;
    if (row.current && el) row.current.scrollLeft = Math.max(0, el.offsetLeft - row.current.clientWidth / 2 + el.clientWidth / 2);
  }, [goal.id]);
  return (
    <section class="card goal-shelf" style={{ '--c': colorOf(goal.color) }} aria-label={`${goal.title} awards`}>
      <div class="card-title">
        {heading ? (
          <>
            <span aria-hidden="true">{goal.emoji}</span>
            {goal.title}
          </>
        ) : (
          'Awards'
        )}
        <span class="aside">
          {got} of {shelf.length}
        </span>
      </div>
      <div class="recent-row shelf-row" ref={row}>
        {shelf.map((item) => (
          <button
            key={item.key}
            ref={item === next ? nextRef : undefined}
            class={`medal-tile${item.day ? '' : ' locked'}`}
            onClick={() => openOverlay('awardDetail', { id: item.def.id, goalId: goal.id })}
          >
            <Medal def={{ ...item.def, glyph: goal.emoji }} size={66} locked={!item.day} />
            <span class="name">{item.def.title}</span>
            {item.day ? (
              <span class="meta">{shortDay(item.day)}</span>
            ) : item === next ? (
              <>
                <span class="medal-progress" aria-hidden="true">
                  <i style={{ width: `${Math.round((item.progress[0] / item.progress[1]) * 100)}%` }} />
                </span>
                <span class="meta">
                  {item.progress[0].toLocaleString()} / {item.progress[1].toLocaleString()}
                </span>
              </>
            ) : (
              <span class="meta">{needs(item.def)}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Awards() {
  const { all, byDef } = earnedInstances();
  const { stats } = awardState.value;
  const ch = currentChallenge.value;
  const view = uiState.value.awardsView === 'general' ? 'general' : 'goals';
  const generalGot = GENERAL.filter((a) => byDef.has(a.id)).length;
  const forGoals = [...all.keys()].filter((k) => AWARD_BY_ID[awardIdOf(k)]?.perGoal).length;
  const recent = [...all].sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 8);
  const shelves = currentGoals.value;
  const archived = archivedGoals.value.filter((g) => [...all.keys()].some((k) => k.endsWith(`:${g.id}`)));

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
          <Ring size={86} stroke={10} value={generalGot / GENERAL.length} glow label={`${all.size} awards earned`}>
            <div class="num" style="font-size:22px;font-weight:850">
              {all.size}
            </div>
          </Ring>
          <div>
            <div class="hero-big">
              {all.size} {all.size === 1 ? 'award' : 'awards'} earned
            </div>
            <div class="hero-sub">
              {forGoals} for your goals · {generalGot} of {GENERAL.length} general. Some are secret.
            </div>
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
                  <button
                    key={key}
                    class="medal-tile"
                    onClick={() => openOverlay('awardDetail', { id: def.id, goalId: def.perGoal ? goal?.id : undefined })}
                  >
                    <Medal def={def} size={78} />
                    <span class="name">{def.title}</span>
                    <span class="meta">{shortDay(day)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style="margin:20px 0 6px">
          <Segmented
            label="Show awards"
            options={[
              ['goals', 'By goal'],
              ['general', 'General'],
            ]}
            value={view}
            onChange={(v) => setUi({ awardsView: v })}
          />
        </div>

        {view === 'goals' ? (
          <>
            {shelves.length === 0 && (
              <div class="card empty">
                <p>Add a goal to start earning its own awards.</p>
              </div>
            )}
            <div class="stack">
              {shelves.map((g) => (
                <GoalShelf key={g.id} goal={g} />
              ))}
            </div>
            {archived.length > 0 && (
              <>
                <h2 class="section-title">Archived goals</h2>
                <div class="stack">
                  {archived.map((g) => (
                    <GoalShelf key={g.id} goal={g} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          AWARD_SECTIONS.filter(([section]) => GENERAL.some((a) => a.section === section)).map(([section, label]) => (
            <section key={section} aria-label={label}>
              <h2 class="section-title">{label}</h2>
              <div class="medal-grid">
                {GENERAL.filter((a) => a.section === section).map((def) => (
                  <AwardTile key={def.id} def={def} list={byDef.get(def.id) || []} stats={stats} ch={ch} />
                ))}
              </div>
            </section>
          ))
        )}
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

/** One goal's medal: when it was earned, or how far along it is. */
function GoalAwardSheet({ def, goal, onClose }) {
  const { earned, stats } = awardState.value;
  const item = goalShelf(goal, streaks.value.get(goal.id), earned, stats.goalDone?.get(goal.id) || 0).find((x) => x.def.id === def.id);
  const day = item?.day || earned.get(`${def.id}:${goal.id}`) || null;
  const progress = day ? null : item?.progress;
  return (
    <Sheet onClose={onClose} label={def.title}>
      <div class="award-detail">
        <Medal def={{ ...def, glyph: goal.emoji }} size={150} locked={!day} />
        <h2>{def.title}</h2>
        <p>
          {goal.emoji} {goal.title}. {def.desc}
        </p>
        {day && <p class="muted">Earned {shortDay(day)}</p>}
        {progress && (
          <div style="max-width:260px;margin:16px auto 0">
            <div class="progress-line">
              <i style={{ width: `${Math.round((progress[0] / progress[1]) * 100)}%` }} />
            </div>
            <div class="faint" style="font-size:13px;margin-top:6px">
              {progress[0].toLocaleString()} of {progress[1].toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function AwardSheet({ id, goalId, onClose }) {
  const def = AWARD_BY_ID[id];
  if (!def) return null;
  const goal = goalId ? goals.value[goalId] : null;
  if (def.perGoal && goal) return <GoalAwardSheet def={def} goal={goal} onClose={onClose} />;
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
              const g = goals.value[key.split(':')[1]];
              return (
                <div key={key} class="action" style="cursor:default">
                  <span class="ico">{g ? g.emoji : '🏅'}</span>
                  <span style="flex:1">{g ? g.title : def.title}</span>
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
