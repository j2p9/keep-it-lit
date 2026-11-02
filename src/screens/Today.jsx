import { formatDay } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { installed, installPrompt, promptInstall } from '../lib/install.js';
import { isAndroid, isIOS, isStandalone } from '../lib/platform.js';
import { isDone, isDueOn, isWeekly, TIME_SECTIONS } from '../lib/schedule.js';
import { isAtRisk } from '../lib/streaks.js';
import { currentGoals, hoursLeftToday, lookup, notes, setNote, streaks, today, todaySummary } from '../lib/store.js';
import { openOverlay, setUi, showToast, uiState, welcomeOpen } from '../lib/ui.js';
import { GoalRow } from '../components/GoalRow.jsx';
import { Ring } from '../components/Ring.jsx';
import { IconGear, IconPlus, IconX } from '../components/icons.jsx';

export const MOODS = [
  ['😞', 'Rough'],
  ['😕', 'Meh'],
  ['😐', 'Okay'],
  ['🙂', 'Good'],
  ['😄', 'Great'],
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function timeLeft(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${Math.round(hours)}h`;
}

export function Today() {
  const t = today.value;
  const goals = currentGoals.value;
  const sum = todaySummary.value;
  const st = streaks.value;
  const lk = lookup.value;
  const hours = hoursLeftToday.value;
  const due = goals.filter((g) => isDueOn(g, t));
  const weekly = goals.filter(isWeekly);
  const atRisk = goals.filter((g) => isAtRisk(g, st.get(g.id), t, isDone(g, lk(g.id, t)), hours));
  const alive = goals.filter((g) => st.get(g.id)?.current > 0).length;
  const protectedCount = goals.filter((g) => st.get(g.id)?.freezes > 0 && st.get(g.id)?.current > 0).length;
  const left = sum.due - sum.done;

  let big;
  let small;
  if (sum.due === 0) {
    big = 'Rest day 🌿';
    small = weekly.length ? 'Nothing is due today. Your weekly goals are below.' : 'Nothing is scheduled today. Enjoy it.';
  } else if (sum.perfect) {
    big = 'All done! 🔥';
    small = alive ? `${plural(alive, 'streak')} kept lit today.` : 'Every goal checked off. Great work.';
  } else if (atRisk.length) {
    big = `${left} to go`;
    small = `⏳ ${plural(atRisk.length, 'streak')} end in ${timeLeft(hours)}. You’ve got this.`;
  } else {
    big = `${left} to go`;
    small = sum.done
      ? `Nice start: ${sum.done} done already.`
      : alive
        ? `${plural(alive, 'streak')} waiting for you today.`
        : 'Tap a goal when you’ve done it.';
  }

  return (
    <main class="screen" aria-label="Today">
      <div class="inner">
        <header class="page-head">
          <button class="head-title" onClick={() => (welcomeOpen.value = true)} aria-label="Open your daily summary">
            <div class="eyebrow">{formatDay(t, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            <h1 class="title">Today</h1>
          </button>
          <div class="head-actions">
            <button class="icon-btn" aria-label="Add a goal" onClick={() => openOverlay('templates')}>
              <IconPlus size={22} />
            </button>
            <button class="icon-btn" aria-label="Settings" onClick={() => openOverlay('settings')}>
              <IconGear size={21} />
            </button>
          </div>
        </header>

        <InstallBanner />

        {!goals.length ? (
          <div class="card empty">
            <div class="empty-emoji" aria-hidden="true">
              🎯
            </div>
            <h2>No goals yet</h2>
            <p>Add one small thing you want to do every day. Your first streak starts today.</p>
            <button class="btn btn-primary" onClick={() => openOverlay('templates')}>
              Add your first goal
            </button>
          </div>
        ) : (
          <>
            <section class="card hero" aria-label="Today’s progress">
              <Ring size={128} stroke={14} value={sum.fill ?? 0} glow label={`${sum.done} of ${sum.due} goals done`}>
                {sum.due ? (
                  <>
                    <div class="ring-num" key={sum.done}>
                      {sum.done}
                      <small>/{sum.due}</small>
                    </div>
                    <div class="ring-cap">done</div>
                  </>
                ) : (
                  <div style="font-size:38px" aria-hidden="true">
                    🌿
                  </div>
                )}
              </Ring>
              <div class="hero-text">
                <div class="hero-big">{big}</div>
                <div class="hero-sub">{small}</div>
                {protectedCount > 0 && (
                  <div class="hero-chips">
                    <span class="pill chip-ice">
                      ❄️ {protectedCount === alive ? 'All streaks' : plural(protectedCount, 'streak')} protected
                    </span>
                  </div>
                )}
              </div>
            </section>

            {TIME_SECTIONS.map(({ key, label, icon }) => {
              const list = due.filter((g) => g.time_of_day === key);
              if (!list.length) return null;
              const doneCount = list.filter((g) => isDone(g, lk(g.id, t))).length;
              return (
                <section key={key} aria-label={label}>
                  <h2 class="section-title">
                    <span aria-hidden="true">{icon}</span>
                    {label}
                    <span class="count">
                      {doneCount}/{list.length}
                    </span>
                  </h2>
                  <div class="stack">
                    {list.map((g) => (
                      <GoalRow key={g.id} goal={g} day={t} />
                    ))}
                  </div>
                </section>
              );
            })}

            {weekly.length > 0 && (
              <section aria-label="This week">
                <h2 class="section-title">
                  <span aria-hidden="true">📅</span>This week
                </h2>
                <div class="stack">
                  {weekly.map((g) => (
                    <GoalRow key={g.id} goal={g} day={t} />
                  ))}
                </div>
              </section>
            )}

            <MoodCard day={t} />
            <p class="faint" style="text-align:center;font-size:13px;margin-top:18px">
              Tip: press and hold a goal to skip it, edit it, or log an exact amount.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function MoodCard({ day }) {
  const n = notes.value[day];
  return (
    <section class="card" style="margin-top:22px" aria-label="How is today going?">
      <div class="card-title">
        How’s today going?
        {n?.note && <span class="aside">📝 Note saved</span>}
      </div>
      <div class="mood-row">
        {MOODS.map(([m, label], i) => (
          <button
            key={m}
            class={`mood${n?.mood === i + 1 ? ' on' : ''}`}
            aria-label={label}
            aria-pressed={n?.mood === i + 1}
            onClick={() => {
              tick();
              setNote(day, { mood: n?.mood === i + 1 ? null : i + 1 });
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <button class="link" style="margin-top:12px;font-size:15px" onClick={() => openOverlay('daySheet', { day })}>
        {n?.note ? 'Edit today’s note' : 'Add a note about today'}
      </button>
    </section>
  );
}

function InstallBanner() {
  if (isStandalone() || installed.value || uiState.value.installDismissed) return null;
  const canPrompt = Boolean(installPrompt.value);
  let title;
  let text;
  if (canPrompt) {
    title = 'Install Keep It Lit';
    text = 'One tap from your home screen, and it works offline.';
  } else if (isIOS()) {
    title = 'Get reminders';
    text = 'In Safari tap Share, then “Add to Home Screen”.';
  } else if (isAndroid()) {
    title = 'Add to your home screen';
    text = 'Tap ⋮ in your browser, then “Install app” or “Add to Home screen”.';
  } else {
    return null;
  }
  const install = async () => {
    if (await promptInstall()) showToast('Installed! Open Keep It Lit from your home screen.');
  };
  return (
    <div class="banner" role="note">
      <span style="font-size:24px" aria-hidden="true">
        📲
      </span>
      <div>
        <b>{title}</b>
        {text}
      </div>
      {canPrompt && (
        <button class="btn btn-primary btn-small" onClick={install}>
          Install
        </button>
      )}
      <button class="close" aria-label="Dismiss" onClick={() => setUi({ installDismissed: true })}>
        <IconX size={18} />
      </button>
    </div>
  );
}
