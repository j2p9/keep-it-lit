// App state as signals, plus every action that changes it. Each change is written to the phone
// immediately (snapshot + sync outbox) and synced to the cloud in the background.
import { batch, computed, effect, signal } from '@preact/signals';
import { addDays, hoursLeft, localDayOf, todayKey } from './dates.js';
import { checkinKey, goalStreak, makeLookup } from './streaks.js';
import { daySummary, firstDay } from './stats.js';
import { isDone, isDueOn } from './schedule.js';
import { evaluateAwards, newAwards } from './awards.js';
import { challengeTarget } from './challenge.js';
import { readJSON, removeKey, writeJSON } from './local.js';
import { cloudConfigured, supabase } from './supabase.js';
import * as sync from './sync.js';
import { deviceTimezone, newId, persistStorage, setAppBadge } from './platform.js';
import { disablePush, refreshPush } from './push.js';
import { makeDemo } from './demo.js';
import { celebrate, onboardingActive, recoveryMode, setUi, uiState, welcomeOpen } from './ui.js';

export const DEFAULT_SETTINGS = { theme: 'auto', weekStart: 0, dayEndHour: 0, freezes: true, onboarded: false };

export const session = signal({ status: 'loading', user: null, demo: false });
export const profile = signal(null);
export const goals = signal({});
export const checkins = signal({});
export const notes = signal({});
export const achievements = signal({});
export const challenges = signal({});
export const ready = signal(false);
/** True once we hold the server's copy (or a local one), so awards aren't re-earned on a fresh device. */
export const synced = signal(false);
export const syncStatus = signal({ state: 'idle', pending: 0 });
/** First sign-in on this device: wait for the cloud copy before deciding to show onboarding. */
export const firstLoad = signal(false);
export const clock = signal(new Date());

export const uid = () => session.peek().user?.id;
const nowIso = () => new Date().toISOString();
const hm = (t) => (typeof t === 'string' ? t.slice(0, 5) : t);

let lastSettings = DEFAULT_SETTINGS;
export const settings = computed(() => {
  const next = { ...DEFAULT_SETTINGS, ...(profile.value?.settings || {}) };
  const same =
    Object.keys(next).length === Object.keys(lastSettings).length &&
    Object.keys(next).every((k) => next[k] === lastSettings[k]);
  return same ? lastSettings : (lastSettings = next);
});

export const today = computed(() => todayKey(clock.value, settings.value.dayEndHour));
export const hoursLeftToday = computed(() => hoursLeft(clock.value, settings.value.dayEndHour));

const bySort = (a, b) => a.sort_order - b.sort_order || String(a.created_at || '').localeCompare(String(b.created_at || ''));
export const allGoals = computed(() =>
  Object.values(goals.value)
    .filter((g) => !g.deleted_at)
    .sort(bySort),
);
export const currentGoals = computed(() => allGoals.value.filter((g) => !g.archived_on || g.archived_on > today.value));
export const archivedGoals = computed(() => allGoals.value.filter((g) => g.archived_on && g.archived_on <= today.value));
export const lookup = computed(() => makeLookup(checkins.value));
export const checkinList = computed(() => Object.values(checkins.value));

export const streaks = computed(() => {
  const { freezes, weekStart } = settings.value;
  const t = today.value;
  const lk = lookup.value;
  return new Map(allGoals.value.map((g) => [g.id, goalStreak(g, lk, t, { freezes, weekStart })]));
});

export const todaySummary = computed(() => daySummary(currentGoals.value, lookup.value, today.value));
export const joinedOn = computed(() => (profile.value?.created_at ? localDayOf(profile.value.created_at) : null));

export const awardState = computed(() =>
  evaluateAwards({
    goals: allGoals.value,
    checkinsList: checkinList.value,
    lookup: lookup.value,
    today: today.value,
    streaks: streaks.value,
    challenges: Object.values(challenges.value),
    joinedOn: joinedOn.value,
    weekStart: settings.value.weekStart,
  }),
);

export const currentChallenge = computed(() => challenges.value[`${today.value.slice(0, 7)}-01`] || null);
export const needsOnboarding = computed(() => ready.value && !settings.value.onboarded && allGoals.value.length === 0);

// ---------------------------------------------------------------- clock

const params = new URLSearchParams(location.search);
const demoRequested = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && params.has('demo');
// Demo-only time travel, e.g. ?demo&at=2026-11-02T20:30 to preview the evening hourglass.
const clockOffset = demoRequested && params.get('at') ? Date.parse(params.get('at')) - Date.now() : 0;
export const tickClock = () => (clock.value = new Date(Date.now() + clockOffset));
setInterval(tickClock, 30000);

// ---------------------------------------------------------------- local persistence

const snapshotKey = () => (session.peek().demo ? 'data:demo' : `data:${uid()}`);

function saveNow() {
  if (!ready.peek() || !session.peek().user) return;
  writeJSON(snapshotKey(), {
    v: 1,
    profile: profile.peek(),
    goals: goals.peek(),
    checkins: checkins.peek(),
    notes: notes.peek(),
    achievements: achievements.peek(),
    challenges: challenges.peek(),
  });
}

let saveTimer = null;
effect(() => {
  // Touch every piece of user data so any change schedules a save.
  void [profile.value, goals.value, checkins.value, notes.value, achievements.value, challenges.value];
  if (!ready.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
});
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
  else tickClock();
});

function normProfile(p) {
  return {
    ...p,
    settings: p.settings || {},
    stats: p.stats || {},
    reminder_checkin_time: hm(p.reminder_checkin_time),
    reminder_saver_time: hm(p.reminder_saver_time),
    reminder_morning_time: hm(p.reminder_morning_time),
  };
}
const normGoal = (g) => ({ ...g, reminder_time: hm(g.reminder_time) });
const TABLE_SIGNAL = { goals, checkins, day_notes: notes, achievements, challenges };

function mergeRows(table, rows, { skipPending = false } = {}) {
  const pending = skipPending ? sync.pendingKeys() : new Set();
  if (table === 'profiles') {
    for (const r of rows) {
      if (r.id !== uid() || pending.has(`profiles|${r.id}`)) continue;
      profile.value = normProfile({ ...(profile.peek() || {}), ...r });
    }
    return;
  }
  const target = TABLE_SIGNAL[table];
  const next = { ...target.peek() };
  for (const r of rows) {
    const key = sync.rowKey(table, r);
    if (pending.has(`${table}|${key}`)) continue;
    const merged = { ...(next[key] || {}), ...r };
    next[key] = table === 'goals' ? normGoal(merged) : merged;
  }
  target.value = next;
}

function loadLocal(id) {
  const snap = readJSON(`data:${id}`, null);
  batch(() => {
    profile.value = snap?.profile ? normProfile(snap.profile) : null;
    goals.value = snap?.goals || {};
    checkins.value = snap?.checkins || {};
    notes.value = snap?.notes || {};
    achievements.value = snap?.achievements || {};
    challenges.value = snap?.challenges || {};
    // Changes still waiting in the outbox are newer than the snapshot.
    for (const e of sync.pendingRows(id)) mergeRows(e.table, [e.row]);
    synced.value = Boolean(snap);
    ready.value = true;
  });
}

function resetData() {
  batch(() => {
    ready.value = false;
    synced.value = false;
    profile.value = null;
    goals.value = {};
    checkins.value = {};
    notes.value = {};
    achievements.value = {};
    challenges.value = {};
  });
}

// ---------------------------------------------------------------- session

export async function boot() {
  tickClock();
  persistStorage();
  if (demoRequested) return startDemo(params.get('demo'));
  if (!cloudConfigured) {
    session.value = { status: 'signedOut', user: null, demo: false };
    return;
  }
  const { data } = await supabase.auth.getSession();
  await useSession(data.session);
  supabase.auth.onAuthStateChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') recoveryMode.value = true;
    // Run outside the auth callback: awaiting Supabase calls inside it can deadlock.
    setTimeout(() => {
      if (event === 'SIGNED_OUT') useSession(null);
      else if (s?.user && s.user.id !== uid()) useSession(s);
    }, 0);
  });
}

async function useSession(s) {
  if (!s?.user) {
    sync.stop();
    resetData();
    session.value = { status: 'signedOut', user: null, demo: false };
    return;
  }
  if (s.user.id === uid() && ready.peek()) return;
  sync.stop();
  loadLocal(s.user.id);
  session.value = { status: 'signedIn', user: s.user, demo: false };
  sync.start({
    uid: s.user.id,
    onRows: (table, rows) => batch(() => mergeRows(table, rows, { skipPending: true })),
    onStatus: (st) => (syncStatus.value = st),
  });
  if (!synced.peek()) firstLoad.value = true;
  if (await sync.pull()) synced.value = true;
  firstLoad.value = false;
  afterSignIn(s.user);
}

function afterSignIn(user) {
  const p = profile.peek();
  if (!p) return; // offline on a new device: try again next launch
  const patch = {};
  const tz = deviceTimezone();
  if (p.timezone !== tz) patch.timezone = tz;
  const name = user.user_metadata?.display_name;
  if (name && !p.display_name) patch.display_name = name;
  if (Object.keys(patch).length) updateProfile(patch);
  refreshPush(user.id).catch(() => {});
}

// ?demo keeps your demo changes, ?demo=reset starts the sample over, ?demo=fresh starts empty (onboarding).
function startDemo(mode) {
  const fresh = mode === 'fresh';
  const saved = mode ? null : readJSON('data:demo', null);
  const snap = saved || makeDemo(today.peek(), { fresh });
  session.value = { status: 'signedIn', user: { id: 'demo', email: 'you@example.com' }, demo: true };
  batch(() => {
    profile.value = normProfile(snap.profile);
    goals.value = snap.goals;
    checkins.value = snap.checkins;
    notes.value = snap.notes || {};
    achievements.value = snap.achievements || {};
    challenges.value = snap.challenges || {};
    synced.value = true;
    ready.value = true;
  });
}

export async function signOut({ force = false } = {}) {
  if (session.peek().demo) {
    removeKey('data:demo');
    location.href = `${location.pathname}?demo=fresh`;
    return { ok: true };
  }
  await sync.flush();
  if (sync.pendingCount() && !force) return { pending: sync.pendingCount() };
  const id = uid();
  await disablePush().catch(() => {});
  removeKey(`data:${id}`);
  sync.forget(id);
  await supabase.auth.signOut().catch(() => {});
  await useSession(null);
  return { ok: true };
}

export async function deleteAccount() {
  const id = uid();
  await disablePush().catch(() => {});
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  removeKey(`data:${id}`);
  sync.forget(id);
  await supabase.auth.signOut().catch(() => {});
  await useSession(null);
}

// ---------------------------------------------------------------- actions

export function updateProfile(patch) {
  const prev = profile.peek();
  const row = { ...(prev || {}), ...patch, id: prev?.id || uid() };
  profile.value = normProfile(row);
  // Without the cloud copy yet (first sign-in while offline), send only what changed so
  // nothing already saved on the server gets overwritten with defaults.
  sync.enqueue('profiles', prev ? row : { id: row.id, ...patch });
}

export const updateSettings = (patch) => updateProfile({ settings: { ...settings.peek(), ...patch } });

function buildCheckin(goal, day, patch) {
  const prev = checkins.peek()[checkinKey(goal.id, day)];
  const base = prev || { goal_id: goal.id, day, user_id: uid(), count: 0, skipped: false, completed_at: null };
  const row = { ...base, ...patch, user_id: base.user_id || uid() };
  const was = isDone(goal, prev);
  const now = isDone(goal, row);
  if (now && !was) row.completed_at = nowIso();
  if (!now) row.completed_at = null;
  return { prev, row };
}

export function setCheckin(goal, day, patch) {
  const { prev, row } = buildCheckin(goal, day, patch);
  checkins.value = { ...checkins.peek(), [checkinKey(goal.id, day)]: row };
  sync.enqueue('checkins', row);
  return prev;
}

/** One tap: tick a checkbox goal on/off, or add one to a counted goal. Returns the previous row for undo. */
export function tapGoal(goal, day) {
  const c = checkins.peek()[checkinKey(goal.id, day)];
  if (c?.skipped) return setCheckin(goal, day, { skipped: false });
  if (goal.target <= 1) return setCheckin(goal, day, { count: isDone(goal, c) ? 0 : 1 });
  return setCheckin(goal, day, { count: (c?.count || 0) + 1 });
}

export function restoreCheckin(goal, day, prev) {
  const row = prev ? { ...prev } : { goal_id: goal.id, day, user_id: uid(), count: 0, skipped: false, completed_at: null };
  checkins.value = { ...checkins.peek(), [checkinKey(goal.id, day)]: row };
  sync.enqueue('checkins', row);
}

const nextSort = () => allGoals.peek().reduce((m, g) => Math.max(m, g.sort_order), -1) + 1;

export function saveGoal(data) {
  const existing = data.id ? goals.peek()[data.id] : null;
  const row = existing
    ? { ...existing, ...data }
    : {
        id: newId(),
        user_id: uid(),
        emoji: '🔥',
        color: 'flame',
        target: 1,
        unit: null,
        schedule: 'daily',
        days: [0, 1, 2, 3, 4, 5, 6],
        per_week: 3,
        time_of_day: 'anytime',
        reminder_time: null,
        sort_order: nextSort(),
        start_on: today.peek(),
        archived_on: null,
        deleted_at: null,
        created_at: nowIso(),
        ...data,
      };
  goals.value = { ...goals.peek(), [row.id]: row };
  sync.enqueue('goals', row);
  return row;
}

/** Creates a goal, optionally crediting a streak the user already has ("already doing this"). */
export function createGoal(data, priorStreak = 0) {
  const t = today.peek();
  let start = t;
  const days = [];
  if (priorStreak > 0 && data.schedule !== 'weekly') {
    const probe = { ...data, id: 'probe', start_on: '0000-01-01' };
    for (let d = addDays(t, -1), guard = 0; days.length < priorStreak && guard < 2000; d = addDays(d, -1), guard += 1) {
      if (isDueOn(probe, d)) days.push(d);
      start = d;
    }
  }
  return batch(() => {
    const g = saveGoal({ ...data, start_on: start });
    if (days.length) {
      const next = { ...checkins.peek() };
      const items = [];
      for (const d of days) {
        const { row } = buildCheckin(g, d, { count: g.target });
        next[checkinKey(g.id, d)] = row;
        items.push(['checkins', row]);
      }
      checkins.value = next;
      sync.enqueueMany(items);
    }
    return g;
  });
}

export const archiveGoal = (g) => saveGoal({ id: g.id, archived_on: today.peek() });
export const unarchiveGoal = (g) => saveGoal({ id: g.id, archived_on: null });
export const deleteGoal = (g) => saveGoal({ id: g.id, deleted_at: nowIso() });

export function moveGoal(g, dir) {
  const list = currentGoals.peek();
  const i = list.findIndex((x) => x.id === g.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const order = list.map((x) => x.id);
  [order[i], order[j]] = [order[j], order[i]];
  batch(() => order.forEach((id, k) => goals.peek()[id].sort_order !== k && saveGoal({ id, sort_order: k })));
}

export function setNote(day, patch) {
  const prev = notes.peek()[day];
  const row = { user_id: uid(), day, note: '', mood: null, ...prev, ...patch };
  notes.value = { ...notes.peek(), [day]: row };
  sync.enqueue('day_notes', row);
}

function storeAwards(rows) {
  const next = { ...achievements.peek() };
  const items = rows.map((a) => {
    const row = { user_id: uid(), award_key: a.award_key, earned_on: a.earned_on, seen: Boolean(a.seen) };
    next[a.award_key] = row;
    return ['achievements', row];
  });
  achievements.value = next;
  sync.enqueueMany(items);
}

export function markAwardsSeen(keys) {
  const cur = achievements.peek();
  const rows = keys.map((k) => cur[k]).filter((a) => a && !a.seen).map((a) => ({ ...a, seen: true }));
  if (rows.length) storeAwards(rows);
}

export function completeOnboarding() {
  setUi({ lastWelcome: today.peek() });
  updateSettings({ onboarded: true });
}

// ---------------------------------------------------------------- backup

export function exportData() {
  return {
    app: 'keep-it-lit',
    version: 1,
    exported_at: nowIso(),
    user_id: uid(),
    goals: Object.values(goals.peek()),
    checkins: Object.values(checkins.peek()),
    notes: Object.values(notes.peek()),
    achievements: Object.values(achievements.peek()),
    challenges: Object.values(challenges.peek()),
  };
}

export function importData(data) {
  if (data?.app !== 'keep-it-lit' || !Array.isArray(data.goals)) throw new Error('That file is not a Keep It Lit backup.');
  const me = uid();
  // Backups from another account get fresh goal ids so they can't collide with that account's rows.
  const ids = new Map();
  const mapId = (id) => {
    if (data.user_id === me) return id;
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id);
  };
  const items = [];
  batch(() => {
    const g = { ...goals.peek() };
    for (const row of data.goals) {
      const r = normGoal({ ...row, id: mapId(row.id), user_id: me });
      g[r.id] = r;
      items.push(['goals', r]);
    }
    goals.value = g;
    const c = { ...checkins.peek() };
    for (const row of data.checkins || []) {
      const r = { ...row, goal_id: mapId(row.goal_id), user_id: me };
      c[checkinKey(r.goal_id, r.day)] = r;
      items.push(['checkins', r]);
    }
    checkins.value = c;
    const n = { ...notes.peek() };
    for (const row of data.notes || []) {
      const r = { ...row, user_id: me };
      n[r.day] = r;
      items.push(['day_notes', r]);
    }
    notes.value = n;
    const a = { ...achievements.peek() };
    for (const row of data.achievements || []) {
      const [id, part] = row.award_key.split(':');
      const key = part && ids.has(part) ? `${id}:${ids.get(part)}` : row.award_key;
      const r = { ...row, award_key: key, user_id: me, seen: true };
      a[key] = r;
      items.push(['achievements', r]);
    }
    achievements.value = a;
    const ch = { ...challenges.peek() };
    for (const row of data.challenges || []) {
      const r = { ...row, user_id: me };
      ch[r.month] = r;
      items.push(['challenges', r]);
    }
    challenges.value = ch;
  });
  sync.enqueueMany(items);
  return { goals: data.goals.length, checkins: (data.checkins || []).length };
}

export const syncNow = async () => {
  await sync.flush();
  if (await sync.pull()) synced.value = true;
};

// ---------------------------------------------------------------- automatic follow-ups

// New awards: store them, and celebrate the ones earned in the last couple of days.
effect(() => {
  if (!ready.value || !synced.value) return;
  const { earned } = awardState.value;
  const fresh = newAwards(new Set(Object.keys(achievements.peek())), earned);
  if (!fresh.length) return;
  const cutoff = addDays(today.peek(), -2);
  const rows = fresh.map((a) => ({ ...a, seen: a.earned_on < cutoff }));
  storeAwards(rows);
  celebrate(rows.filter((r) => !r.seen));
});

// Awards earned on another device (or left uncelebrated when the app closed) get their moment too.
let celebratedStored = false;
effect(() => {
  if (!ready.value || !synced.value || celebratedStored) return;
  celebratedStored = true;
  celebrate(Object.values(achievements.peek()).filter((a) => !a.seen));
});

// Personal monthly challenge, fixed when the month starts.
effect(() => {
  if (!ready.value || !synced.value) return;
  const month = `${today.value.slice(0, 7)}-01`;
  const list = allGoals.value;
  if (challenges.value[month] || !list.length) return;
  const { target } = challengeTarget({ goals: list, lookup: lookup.peek(), today: today.peek(), first: firstDay(list) });
  const row = { user_id: uid(), month, target };
  challenges.value = { ...challenges.peek(), [month]: row };
  sync.enqueue('challenges', row);
});

// Streak numbers for the reminder text the server sends.
let statsTimer = null;
effect(() => {
  if (!ready.value || session.value.demo) return;
  const map = {};
  for (const [id, s] of streaks.value) map[id] = s.current;
  const next = { day: today.value, streaks: map };
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    if (JSON.stringify(profile.peek()?.stats) !== JSON.stringify(next)) updateProfile({ stats: next });
  }, 2500);
});

// Home Screen icon badge: goals left today.
effect(() => {
  if (!ready.value) return;
  const s = todaySummary.value;
  setAppBadge(Math.max(0, s.due - s.done));
});

// Accounts that already have goals (made before onboarding existed, or imported) skip onboarding.
effect(() => {
  if (ready.value && synced.value && !onboardingActive.value && !settings.value.onboarded && allGoals.value.length) {
    updateSettings({ onboarded: true });
  }
});

// The daily welcome dashboard, once per day (not on the day you sign up).
effect(() => {
  if (!ready.value || onboardingActive.value || !settings.value.onboarded || !allGoals.value.length) return;
  const t = today.value;
  if (uiState.peek().lastWelcome === t) return;
  setUi({ lastWelcome: t });
  welcomeOpen.value = true;
});
