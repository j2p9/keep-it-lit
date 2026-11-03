import { useRef } from 'preact/hooks';
import { addDays, daysBetween, formatDay, formatTime, startOfWeek } from '../lib/dates.js';
import { tick } from '../lib/haptics.js';
import { installed, installPrompt, promptInstall } from '../lib/install.js';
import { isAndroid, isIOS, isStandalone } from '../lib/platform.js';
import { addedOn, goalsForDay, isDone, TIME_SECTIONS } from '../lib/schedule.js';
import { daySummary } from '../lib/stats.js';
import { isAtRisk } from '../lib/streaks.js';
import {
  allGoals,
  backupState,
  currentGoals,
  deviceReady,
  hoursLeftToday,
  lookup,
  nextDay,
  notes,
  restPlan,
  restRule,
  setNote,
  settings,
  startNextDay,
  streaks,
  today,
} from '../lib/store.js';
import { openOverlay, setUi, showToast, uiState, viewDay, welcomeOpen } from '../lib/ui.js';
import { DayStrip } from '../components/DayStrip.jsx';
import { GoalRow } from '../components/GoalRow.jsx';
import { HealthCard } from '../components/HealthCard.jsx';
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

/** "Yesterday", "Monday" (this past week) or "Oct 28". */
function dayName(day, t) {
  const ago = daysBetween(day, t);
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return formatDay(day, { weekday: 'long' });
  return formatDay(day, { month: 'short', day: 'numeric' });
}

export function Today() {
  const t = today.value;
  // Earlier days open from the week strip, a swipe, or the Android back button's history.
  const day = viewDay.value && viewDay.value < t ? viewDay.value : t;
  const isToday = day === t;
  const goals = currentGoals.value;
  const st = streaks.value;
  const lk = lookup.value;
  const hours = hoursLeftToday.value;
  const { due, weekly, later } = goalsForDay(allGoals.value, day, lk);
  const sum = daySummary(allGoals.value, lk, day);
  const atRisk = isToday ? goals.filter((g) => isAtRisk(g, st.get(g.id), t, isDone(g, lk(g.id, t)), hours)) : [];
  const alive = goals.filter((g) => st.get(g.id)?.current > 0).length;
  const protectedCount = isToday ? goals.filter((g) => st.get(g.id)?.freezes > 0 && st.get(g.id)?.current > 0).length : 0;
  const left = sum.due - sum.done;
  const name = isToday ? 'Today' : dayName(day, t);
  const ws = settings.value.weekStart;
  const sameWeek = startOfWeek(day, ws) === startOfWeek(t, ws);

  const goTo = (d) => {
    viewDay.value = d >= t ? null : d;
  };
  const touch = useRef(null);
  const onTouchStart = (e) => (touch.current = [e.touches[0].clientX, e.touches[0].clientY]);
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current[0];
    const dy = e.changedTouches[0].clientY - touch.current[1];
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx > 0) goTo(addDays(day, -1));
    else if (!isToday) goTo(addDays(day, 1));
    else return;
    tick();
  };

  let big;
  let small;
  if (sum.due === 0) {
    big = 'Rest day 🌿';
    if (later.length && !isToday) small = 'Nothing was due. Goals you added later are below.';
    else if (weekly.length) small = isToday ? 'Nothing is due today. Your weekly goals are below.' : 'Nothing was due. Your weekly goals are below.';
    else small = isToday ? 'Nothing is scheduled today. Enjoy it.' : 'Nothing was scheduled that day.';
  } else if (sum.perfect) {
    big = 'All done! 🔥';
    if (!isToday) small = 'Everything was checked off that day.';
    else small = alive ? `${plural(alive, 'streak')} kept lit today.` : 'Every goal checked off. Great work.';
  } else if (left === due.filter((g) => lk(g.id, day)?.skip === 'rest').length) {
    // Everything left was taken off with a rest day.
    big = 'Rest day 🛌';
    small = isToday ? 'Your streaks keep going. Back at it tomorrow.' : 'A rest day covered this day.';
  } else if (!isToday) {
    big = `${left} not done`;
    small = 'Tap what you did that day. Only check off what you really did.';
  } else if (atRisk.length) {
    big = `${left} to go`;
    small = restPlan.value.bank
      ? `⏳ ${timeLeft(hours)} left today. Miss it and a rest day covers you, but you’ve got this.`
      : `⏳ ${plural(atRisk.length, 'streak')} end in ${timeLeft(hours)}. You’ve got this.`;
  } else {
    big = `${left} to go`;
    small = sum.done
      ? `Nice start: ${sum.done} done already.`
      : alive
        ? `${plural(alive, 'streak')} waiting for you today.`
        : 'Tap a goal when you’ve done it.';
  }

  return (
    <main class="screen" aria-label={isToday ? 'Today' : name} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div class="inner">
        <header class="page-head">
          <button
            class="head-title"
            onClick={() => (isToday ? (welcomeOpen.value = true) : goTo(t))}
            aria-label={isToday ? 'Open your daily summary' : 'Back to today'}
          >
            <div class="eyebrow">{formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            <h1 class="title" key={day}>
              {name}
            </h1>
          </button>
          <div class="head-actions">
            {!isToday && (
              <button class="btn btn-secondary btn-small today-btn" onClick={() => goTo(t)}>
                Today
              </button>
            )}
            <button class="icon-btn" aria-label="Add a goal" onClick={() => openOverlay('templates')}>
              <IconPlus size={22} />
            </button>
            <button class="icon-btn" aria-label="Settings" onClick={() => openOverlay('settings')}>
              <IconGear size={21} />
            </button>
          </div>
        </header>

        {isToday && <NextDayBanner />}
        {isToday && <InstallBanner />}
        {allGoals.value.length > 0 && <DayStrip day={day} onPick={goTo} />}

        {!(isToday ? goals.length : allGoals.value.length) ? (
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
            <section class="card hero" aria-label={isToday ? 'Today’s progress' : `${name}’s progress`}>
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
                <div class="hero-chips">
                  {restRule.value.on && (
                    <button class="pill chip-rest" onClick={() => openOverlay('dayOff', { day })}>
                      🛌 {plural(restPlan.value.bank, 'rest day')}
                    </button>
                  )}
                  {!restRule.value.on && sum.due - sum.done > 0 && (
                    <button class="pill" onClick={() => openOverlay('dayOff', { day })}>
                      🤒 Sick day?
                    </button>
                  )}
                  {protectedCount > 0 && (
                    <span class="pill chip-ice">
                      ❄️ {protectedCount === alive ? 'All streaks' : plural(protectedCount, 'streak')} protected
                    </span>
                  )}
                </div>
              </div>
            </section>

            {TIME_SECTIONS.map(({ key, label, icon }) => {
              const list = due.filter((g) => g.time_of_day === key);
              if (!list.length) return null;
              const doneCount = list.filter((g) => isDone(g, lk(g.id, day))).length;
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
                      <GoalRow key={g.id} goal={g} day={day} />
                    ))}
                  </div>
                </section>
              );
            })}

            {weekly.length > 0 && (
              <section aria-label={sameWeek ? 'This week' : 'That week'}>
                <h2 class="section-title">
                  <span aria-hidden="true">📅</span>
                  {sameWeek ? 'This week' : 'That week'}
                </h2>
                <div class="stack">
                  {weekly.map((g) => (
                    <GoalRow key={g.id} goal={g} day={day} />
                  ))}
                </div>
              </section>
            )}

            {later.length > 0 && (
              <section aria-label="Added later">
                <h2 class="section-title">
                  <span aria-hidden="true">🆕</span>Added later
                </h2>
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
              </section>
            )}

            <HealthCard day={day} />
            {isToday && <BackupNudge />}
            <MoodCard day={day} />
            <p class="faint" style="text-align:center;font-size:13px;margin-top:18px">
              {isToday
                ? 'Tip: swipe right or tap a day above to fill in a day you missed. Press and hold a goal for more.'
                : 'Only check off what you really did. You’re the one it’s for.'}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

/** Night owls: between midnight and the day-end hour, offer to start the new date now. */
function NextDayBanner() {
  const next = nextDay.value;
  if (!next) return null;
  const end = formatTime(`${String(settings.value.dayEndHour).padStart(2, '0')}:00`);
  const weekdayOf = (d) => formatDay(d, { weekday: 'long' });
  return (
    <div class="banner" role="note">
      <span style="font-size:24px" aria-hidden="true">
        🌙
      </span>
      <div>
        <b>It’s past midnight</b>
        Your day ends at {end}, so it’s still {weekdayOf(today.value)} here.
      </div>
      <button
        class="btn btn-primary btn-small"
        onClick={() => {
          tick();
          startNextDay();
          showToast(`☀️ ${weekdayOf(next)} has started`);
        }}
      >
        Start {formatDay(next, { weekday: 'short' })}
      </button>
    </div>
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

/** History lives only on this phone: suggest the encrypted backup until it's on (or dismissed). */
function BackupNudge() {
  if (backupState.value.on || !deviceReady.value || uiState.value.backupDismissed) return null;
  return (
    <div class="banner" role="note" style="margin-top:22px">
      <span style="font-size:24px" aria-hidden="true">
        🔐
      </span>
      <div>
        <b>Back up your streaks</b>
        Your history is only on this phone. An encrypted backup brings it back on a new one.
      </div>
      <button class="btn btn-primary btn-small" onClick={() => openOverlay('backup')}>
        Turn on
      </button>
      <button class="close" aria-label="Dismiss" onClick={() => setUi({ backupDismissed: true })}>
        <IconX size={18} />
      </button>
    </div>
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
