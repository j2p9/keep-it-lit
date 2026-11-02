// App state as signals, plus every action that changes it. Goals, check-ins, notes, awards and
// Health numbers live only on this phone: every change is saved here right away. The cloud keeps
// the profile, a snapshot of each goal's streak (so reminders stay smart) and, if you turn it on,
// an end-to-end encrypted backup.
import { batch, computed, effect, signal } from '@preact/signals';
import { addDays, hoursLeft, localDayOf, startOfWeek, todayKey } from './dates.js';
import { checkinKey, goalStreak, makeLookup } from './streaks.js';
import { daySummary, firstDay } from './stats.js';
import { isDone, isDueOn } from './schedule.js';
import { evaluateAwards, newAwards } from './awards.js';
import { challengeTarget } from './challenge.js';
import { buildStreakRows } from './cloudstreaks.js';
import { healthCount, healthUpdates, toCount, unitFor } from './healthMetrics.js';
import { localCopyComplete } from './migrate.js';
import * as vault from './backup.js';
import * as healthApi from './health.js';
import { readJSON, readString, removeKey, writeJSON, writeString } from './local.js';
import { cloudConfigured, supabase } from './supabase.js';
import * as sync from './sync.js';
import { deviceTimezone, newId, persistStorage, setAppBadge } from './platform.js';
import { disablePush, refreshPush } from './push.js';
import { makeDemo } from './demo.js';
import { celebrate, onboardingActive, recoveryMode, setUi, uiState, welcomeOpen } from './ui.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  weekStart: 0,
  dayEndHour: 0,
  freezes: true,
  onboarded: false,
  localOnly: false,
  health: false,
};

export const session = signal({ status: 'loading', user: null, demo: false });
export const profile = signal(null);
export const goals = signal({});
export const checkins = signal({});
export const notes = signal({});
export const achievements = signal({});
export const challenges = signal({});
/** Apple Health numbers by day: { 'YYYY-MM-DD': { steps, exercise, …, at } }. */
export const health = signal({});
export const ready = signal(false);
/** True once we hold the server's profile (or a local copy), so awards aren't re-earned on a fresh device. */
export const synced = signal(false);
export const syncStatus = signal({ state: 'idle', pending: 0 });
/** First sign-in on this device: wait for the cloud before deciding what to show. */
export const firstLoad = signal(false);
export const clock = signal(new Date());
/** A step that comes before the app: 'migrate' (move to local-only) or 'restore' (new phone). */
export const setupStep = signal(null);
/** What a new phone can bring back: { backup: { updated_at, bytes } | null, streaks: rows }. */
export const restoreInfo = signal(null);
/** This phone holds the account's real data, so it may update the cloud streaks and backup. */
export const deviceReady = signal(false);
export const backupState = signal({ on: false, at: null, busy: false, error: null });

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
const snapshotOf = () => ({
  v: 2,
  profile: profile.peek(),
  goals: goals.peek(),
  checkins: checkins.peek(),
  notes: notes.peek(),
  achievements: achievements.peek(),
  challenges: challenges.peek(),
  health: health.peek(),
});

/** Writes everything to this phone. Returns false if storage refused it (full or disabled). */
function saveNow() {
  if (!ready.peek() || !session.peek().user) return false;
  return writeJSON(snapshotKey(), snapshotOf());
}

let saveTimer = null;
effect(() => {
  // Touch every piece of user data so any change schedules a save.
  void [profile.value, goals.value, checkins.value, notes.value, achievements.value, challenges.value, health.value];
  if (!ready.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
});
addEventListener('pagehide', saveNow);

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

/** Merges rows from the cloud (or the outbox). Keys in `skip` hold newer changes from this phone. */
function mergeRows(table, rows, { skip = new Set(), me = uid() } = {}) {
  if (table === 'profiles') {
    for (const r of rows) {
      if (r.id !== me || skip.has(`profiles|${r.id}`)) continue;
      profile.value = normProfile({ ...(profile.peek() || {}), ...r });
    }
    return;
  }
  const target = TABLE_SIGNAL[table];
  if (!target) return;
  const next = { ...target.peek() };
  for (const r of rows) {
    const key = sync.rowKey(table, r);
    if (skip.has(`${table}|${key}`)) continue;
    const merged = { ...(next[key] || {}), ...r };
    next[key] = table === 'goals' ? normGoal(merged) : merged;
  }
  target.value = next;
}

function loadLocal(id) {
  const snap = readJSON(`data:${id}`, null);
  const queued = sync.pendingRows(id);
  batch(() => {
    profile.value = snap?.profile ? normProfile(snap.profile) : null;
    goals.value = snap?.goals || {};
    checkins.value = snap?.checkins || {};
    notes.value = snap?.notes || {};
    achievements.value = snap?.achievements || {};
    challenges.value = snap?.challenges || {};
    health.value = snap?.health || {};
    // Changes still waiting in the outbox are newer than the snapshot.
    for (const e of queued) mergeRows(e.table, [e.row], { me: id });
    synced.value = Boolean(snap);
    deviceReady.value = readString(`local:${id}`) === '1';
    setupStep.value = null;
    restoreInfo.value = null;
    ready.value = true;
  });
  // An older version may have queued changes for the cloud that now live only here: save them now.
  if (queued.length) writeJSON(`data:${id}`, snapshotOf());
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
    health.value = {};
    deviceReady.value = false;
    setupStep.value = null;
    restoreInfo.value = null;
    backupState.value = { on: false, at: null, busy: false, error: null };
  });
  backupKey = null;
  backupWatchFor = null;
  preparedFor = null;
  clearTimeout(backupTimer);
}

const markDeviceReady = (id) => {
  if (!session.peek().demo) writeString(`local:${id}`, '1');
  deviceReady.value = true;
};

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
  resetData();
  // Start sync before loading, so the streak snapshot worked out on load has somewhere to go.
  sync.start({
    uid: s.user.id,
    onRows: (table, rows) => batch(() => mergeRows(table, rows, { skip: sync.pendingKeys() })),
    onStatus: (st) => (syncStatus.value = st),
  });
  loadLocal(s.user.id);
  session.value = { status: 'signedIn', user: s.user, demo: false };
  loadBackupKey(s.user.id);
  if (!synced.peek()) firstLoad.value = true;
  if (await sync.pull()) synced.value = true;
  await prepareLocalOnly();
  firstLoad.value = false;
  afterSignIn(s.user);
  pullHealth();
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
    health.value = snap.health || {};
    synced.value = true;
    deviceReady.value = true;
    ready.value = true;
  });
  loadBackupKey('demo');
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
  saveNow();
  if (backupKey && readString(`backupDirty:${id}`)) await runBackup();
  await disablePush().catch(() => {});
  // Goals and history stay saved on this phone for the next time you sign in.
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
  for (const k of [`data:${id}`, `local:${id}`, `healthKey:${id}`, `backupDirty:${id}`, `backupAt:${id}`]) removeKey(k);
  sync.forget(id);
  await vault.forgetDeviceKey(id);
  await supabase.auth.signOut().catch(() => {});
  await useSession(null);
}

// ---------------------------------------------------------------- moving to local-only

let preparedFor = null;
let preparing = false;

/**
 * Runs on each launch until it has nothing left to check: moves an account's old cloud copy onto
 * this phone, and on a phone without the account's data offers the backup or the cloud streaks.
 */
async function prepareLocalOnly() {
  const id = uid();
  if (!id || session.peek().demo || preparedFor === id || preparing || !synced.peek()) return;
  preparing = true;
  try {
    if (await checkCloudCopy(id)) preparedFor = id;
  } catch (err) {
    console.warn('Will try the local-only check again later', err);
  } finally {
    preparing = false;
  }
}

async function checkCloudCopy(id) {
  const s = settings.peek();
  // 1. Anything still in the old cloud tables (from before local-only, or from an older app
  //    version on another phone) is merged into this phone's copy first.
  if (!s.localOnly || !deviceReady.peek()) {
    const legacy = await sync.pullLegacy();
    if (!legacy || uid() !== id) return false;
    if (Object.values(legacy).some((rows) => rows.length)) {
      mergeLegacy(legacy);
      if (!saveNow() || !localCopyComplete(legacy, readJSON(`data:${id}`, null))) throw new Error('Couldn’t save the cloud copy');
      if (!s.localOnly) {
        setupStep.value = 'migrate';
        return true;
      }
      // This account already moved to local-only, so these came from an older version: clear them.
      await purgeCloudCopy();
    }
    sync.dropLegacy();
  }
  // 2. A phone that doesn't hold this account's data yet.
  if (!deviceReady.peek()) {
    const [backup, rows] = await Promise.all([vault.fetchBackupInfo(), fetchCloudStreaks()]);
    if (uid() !== id) return false;
    if (backup || rows.length) {
      batch(() => {
        restoreInfo.value = { backup, streaks: rows };
        setupStep.value = 'restore';
      });
      return true;
    }
    markDeviceReady(id);
  }
  if (!s.localOnly) updateSettings({ localOnly: true });
  return true;
}

function mergeLegacy(legacy) {
  // Changes this phone hadn't sent yet are newer than the cloud's copy.
  const skip = sync.legacyPendingKeys();
  batch(() => {
    for (const table of sync.LEGACY) mergeRows(table, legacy[table] || [], { skip });
  });
}

async function purgeCloudCopy() {
  const { error } = await supabase.rpc('purge_cloud_copy');
  if (error) throw error;
  sync.dropLegacy();
}

async function fetchCloudStreaks() {
  const { data, error } = await supabase.from('goal_streaks').select('*').order('current', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Finishes moving this account to local-only. The cloud copy is deleted only after this phone
 * has saved every row of it (and the encrypted backup is uploaded, when a passphrase is given).
 */
export async function completeMigration(passphrase) {
  const id = uid();
  if (!session.peek().demo) {
    const legacy = await sync.pullLegacy();
    if (!legacy) throw new Error('You’re offline. Connect to the internet and try again. Nothing was deleted.');
    mergeLegacy(legacy);
    if (!saveNow() || !localCopyComplete(legacy, readJSON(`data:${id}`, null))) {
      throw new Error('Couldn’t save everything on this phone. Free up some space and try again. Nothing was deleted.');
    }
  }
  if (passphrase) await enableBackup(passphrase);
  if (!session.peek().demo) await purgeCloudCopy();
  finishSetup(id);
}

function finishSetup(id) {
  markDeviceReady(id);
  batch(() => {
    setupStep.value = null;
    restoreInfo.value = null;
    // Goals came back: no need to pick new ones.
    if (allGoals.peek().length) onboardingActive.value = false;
  });
  preparedFor = id;
  const p = profile.peek();
  if (!settings.peek().localOnly || Object.keys(p?.stats || {}).length) {
    updateProfile({ settings: { ...settings.peek(), localOnly: true }, stats: {} });
  }
}

/** New phone: unlock the encrypted backup and bring everything back. */
export async function restoreFromBackup(passphrase) {
  const id = uid();
  const box = await cloud().get(id);
  if (!box) throw new Error('No backup was found for this account.');
  const iterations = box.kdf?.iterations || vault.KDF_ITERATIONS;
  const key = await vault.deriveKey(passphrase, vault.fromBase64(box.salt), iterations);
  const data = await vault.decryptJSON(box, key);
  if (uid() !== id) return null;
  const result = importData(data);
  await rememberBackupKey(id, { key, salt: box.salt, iterations });
  writeString(`backupAt:${id}`, box.updated_at || nowIso());
  backupState.value = { on: true, at: box.updated_at || null, busy: false, error: null };
  saveNow();
  finishSetup(id);
  return result;
}

/** New phone without the backup: keep what's here, optionally rebuilding goals from the cloud streaks. */
export function startFresh({ withStreaks = false } = {}) {
  const id = uid();
  const rows = withStreaks ? restoreInfo.peek()?.streaks || [] : [];
  batch(() => rows.forEach(restoreStreakGoal));
  saveNow();
  finishSetup(id);
}

function restoreStreakGoal(r) {
  const t = today.peek();
  const metric = r.health_metric;
  const weekly = r.schedule === 'weekly';
  const thisWeek = startOfWeek(t, settings.peek().weekStart);
  const doneToday = r.day === t && r.done_today;
  // A streak that already counts today (or this week) gets that day checked off instead of backfilled.
  const counted = weekly ? r.week_of === thisWeek && r.week_done >= r.per_week : doneToday;
  const g = createGoal(
    {
      title: r.title,
      emoji: r.emoji,
      schedule: r.schedule,
      days: r.days,
      per_week: r.per_week,
      reminder_time: hm(r.reminder_time),
      target: metric ? Math.max(1, toCount(metric, Number(r.health_target) || 0)) : 1,
      unit: metric ? unitFor(metric) : null,
      health: metric ? { metric } : null,
    },
    Math.max(0, (r.current || 0) - (counted ? 1 : 0)),
  );
  if (doneToday) setCheckin(g, t, { count: g.target });
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

function buildCheckin(goal, day, patch, at) {
  const prev = checkins.peek()[checkinKey(goal.id, day)];
  const base = prev || { goal_id: goal.id, day, user_id: uid(), count: 0, skipped: false, completed_at: null };
  const row = { ...base, ...patch, user_id: base.user_id || uid() };
  const was = isDone(goal, prev);
  const now = isDone(goal, row);
  if (now && !was) row.completed_at = at || nowIso();
  if (!now) row.completed_at = null;
  return { prev, row };
}

/** Changes one goal's check-in for a day. `at` is when it was really done (Health uploads). */
export function setCheckin(goal, day, patch, { at } = {}) {
  const { prev, row } = buildCheckin(goal, day, patch, at);
  checkins.value = { ...checkins.peek(), [checkinKey(goal.id, day)]: row };
  return prev;
}

/** One tap: tick a checkbox goal on/off, or add one to a counted goal. Returns the previous row for undo. */
export function tapGoal(goal, day) {
  const c = checkins.peek()[checkinKey(goal.id, day)];
  if (c?.skipped) return setCheckin(goal, day, { skipped: false });
  if (goal.health?.metric) {
    // Apple Health fills these in. A tap marks it done by hand, or goes back to what Health counted.
    const counted = healthCount(goal, health.peek()[day]) ?? 0;
    return setCheckin(goal, day, { count: isDone(goal, c) ? (counted < goal.target ? counted : 0) : goal.target });
  }
  if (goal.target <= 1) return setCheckin(goal, day, { count: isDone(goal, c) ? 0 : 1 });
  return setCheckin(goal, day, { count: (c?.count || 0) + 1 });
}

export function restoreCheckin(goal, day, prev) {
  const row = prev ? { ...prev } : { goal_id: goal.id, day, user_id: uid(), count: 0, skipped: false, completed_at: null };
  checkins.value = { ...checkins.peek(), [checkinKey(goal.id, day)]: row };
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
        health: null,
        sort_order: nextSort(),
        start_on: today.peek(),
        archived_on: null,
        deleted_at: null,
        created_at: nowIso(),
        ...data,
      };
  goals.value = { ...goals.peek(), [row.id]: row };
  // Newly linked to Health: fill in the numbers we already have.
  const metric = row.health?.metric;
  if (metric && (metric !== existing?.health?.metric || row.target !== existing?.target)) {
    const t = today.peek();
    batch(() => [addDays(t, -1), t].forEach((d) => applyHealthDay(d, health.peek()[d]?.at)));
  }
  return row;
}

/**
 * Creates a goal, optionally crediting a streak the user already has ("already doing this"):
 * that many due days (or, for weekly goals, whole weeks) before today get checked off.
 */
export function createGoal(data, priorStreak = 0) {
  const t = today.peek();
  let start = t;
  const days = [];
  if (priorStreak > 0 && data.schedule === 'weekly') {
    const per = Math.min(7, data.per_week || 3);
    const thisWeek = startOfWeek(t, settings.peek().weekStart);
    for (let w = 1; w <= Math.min(priorStreak, 520); w += 1) {
      start = addDays(thisWeek, -7 * w);
      for (let i = 0; i < per; i += 1) days.push(addDays(start, i));
    }
  } else if (priorStreak > 0) {
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
      for (const d of days) next[checkinKey(g.id, d)] = buildCheckin(g, d, { count: g.target }).row;
      checkins.value = next;
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
}

function storeAwards(rows) {
  const next = { ...achievements.peek() };
  for (const a of rows) next[a.award_key] = { user_id: uid(), award_key: a.award_key, earned_on: a.earned_on, seen: Boolean(a.seen) };
  achievements.value = next;
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

// ---------------------------------------------------------------- export / import

export function exportData() {
  return {
    app: 'keep-it-lit',
    version: 2,
    exported_at: nowIso(),
    user_id: uid(),
    goals: Object.values(goals.peek()),
    checkins: Object.values(checkins.peek()),
    notes: Object.values(notes.peek()),
    achievements: Object.values(achievements.peek()),
    challenges: Object.values(challenges.peek()),
    health: health.peek(),
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
  batch(() => {
    const g = { ...goals.peek() };
    for (const row of data.goals) {
      const r = normGoal({ ...row, id: mapId(row.id), user_id: me });
      g[r.id] = r;
    }
    goals.value = g;
    const c = { ...checkins.peek() };
    for (const row of data.checkins || []) {
      const r = { ...row, goal_id: mapId(row.goal_id), user_id: me };
      c[checkinKey(r.goal_id, r.day)] = r;
    }
    checkins.value = c;
    const n = { ...notes.peek() };
    for (const row of data.notes || []) n[row.day] = { ...row, user_id: me };
    notes.value = n;
    const a = { ...achievements.peek() };
    for (const row of data.achievements || []) {
      const [id, part] = row.award_key.split(':');
      const key = part && ids.has(part) ? `${id}:${ids.get(part)}` : row.award_key;
      a[key] = { ...row, award_key: key, user_id: me, seen: true };
    }
    achievements.value = a;
    const ch = { ...challenges.peek() };
    for (const row of data.challenges || []) ch[row.month] = { ...row, user_id: me };
    challenges.value = ch;
    // Health numbers already on this phone are newer than the file's.
    const h = { ...health.peek() };
    for (const [day, m] of Object.entries(data.health || {})) h[day] = { ...m, ...(h[day] || {}) };
    health.value = h;
  });
  return { goals: data.goals.length, checkins: (data.checkins || []).length };
}

export const syncNow = async () => {
  await sync.flush();
  if (await sync.pull()) synced.value = true;
  await prepareLocalOnly();
  await pullHealth({ force: true });
  if (backupKey && readString(`backupDirty:${uid()}`)) await runBackup();
};

// ---------------------------------------------------------------- encrypted backup

let backupKey = null; // { key: CryptoKey, salt, iterations } for the signed-in account
let backupTimer = null;
let backupWatchFor = null;
let changeSeq = 0;

const demoCloud = {
  info: async () => {
    const b = readJSON('demo-backup', null);
    return b && { updated_at: b.updated_at, bytes: b.bytes };
  },
  get: async () => readJSON('demo-backup', null),
  put: async (_id, payload) => {
    writeJSON('demo-backup', { ...payload, updated_at: nowIso() });
  },
  remove: async () => removeKey('demo-backup'),
};
const realCloud = { info: vault.fetchBackupInfo, get: vault.fetchBackup, put: vault.uploadBackup, remove: vault.deleteBackup };
const cloud = () => (session.peek().demo ? demoCloud : realCloud);

export const fetchBackupInfo = () => cloud().info();

async function loadBackupKey(id) {
  const rec = await vault.loadDeviceKey(id);
  if (uid() !== id) return;
  backupKey = rec || null;
  backupState.value = { on: Boolean(rec), at: readString(`backupAt:${id}`), busy: false, error: null };
  if (rec && readString(`backupDirty:${id}`)) scheduleBackup(5000);
}

async function rememberBackupKey(id, rec) {
  backupKey = rec;
  // If this browser can't keep it, backups still work until the app closes.
  await vault.saveDeviceKey(id, rec).catch(() => {});
}

function scheduleBackup(ms = 120000) {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => runBackup(), ms);
}

function markBackupDirty() {
  changeSeq += 1;
  if (!backupKey) return;
  writeString(`backupDirty:${uid()}`, '1');
  scheduleBackup();
}

/** Encrypts everything on this phone and replaces the cloud backup with it. */
async function runBackup({ strict = false } = {}) {
  const id = uid();
  if (!id || !backupKey) return false;
  clearTimeout(backupTimer);
  const seq = changeSeq;
  const rec = backupKey;
  backupState.value = { ...backupState.peek(), busy: true, error: null };
  try {
    const box = await vault.encryptJSON(exportData(), rec.key);
    await cloud().put(id, { ...box, salt: rec.salt, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: rec.iterations }, version: 2 });
    const at = nowIso();
    writeString(`backupAt:${id}`, at);
    if (changeSeq === seq) removeKey(`backupDirty:${id}`);
    else scheduleBackup();
    if (uid() === id) backupState.value = { on: true, at, busy: false, error: null };
    return true;
  } catch (err) {
    console.warn('Backup failed', err);
    if (uid() === id) backupState.value = { ...backupState.peek(), busy: false, error: 'The last backup didn’t go through. It will try again.' };
    if (strict) throw new Error('Couldn’t save the backup. Check your connection and try again. Nothing was deleted.');
    scheduleBackup(5 * 60000);
    return false;
  }
}

/** Turns on the encrypted backup (or changes its passphrase) and uploads it right away. */
export async function enableBackup(passphrase) {
  const id = uid();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await vault.deriveKey(passphrase, salt);
  await rememberBackupKey(id, { key, salt: vault.toBase64(salt), iterations: vault.KDF_ITERATIONS });
  return runBackup({ strict: true });
}

export const backupNow = () => runBackup({ strict: true });

export async function disableBackup() {
  const id = uid();
  await cloud().remove(id);
  backupKey = null;
  clearTimeout(backupTimer);
  await vault.forgetDeviceKey(id);
  removeKey(`backupDirty:${id}`);
  removeKey(`backupAt:${id}`);
  backupState.value = { on: false, at: null, busy: false, error: null };
}

// Any change to the data marks the backup out of date; it uploads 2 minutes later, or when the
// app goes to the background.
effect(() => {
  void [goals.value, checkins.value, notes.value, achievements.value, challenges.value, health.value];
  if (!ready.peek() || !deviceReady.peek() || setupStep.peek()) return;
  const id = uid();
  if (backupWatchFor !== id) {
    backupWatchFor = id; // the first run is just the data loading
    return;
  }
  markBackupDirty();
});

// ---------------------------------------------------------------- Apple Health

let healthPulledAt = 0;

/** Collects numbers the Shortcut uploaded, applies them, then clears them from the server. */
export async function pullHealth({ force = false } = {}) {
  const s = session.peek();
  if (s.demo || !s.user || !deviceReady.peek() || setupStep.peek() || !settings.peek().health) return null;
  if ((!force && Date.now() - healthPulledAt < 20000) || !navigator.onLine) return null;
  healthPulledAt = Date.now();
  const id = s.user.id;
  let rows;
  try {
    rows = await healthApi.fetchHealthInbox();
  } catch (err) {
    console.warn('Couldn’t read Health numbers', err);
    return null;
  }
  if (uid() !== id) return null;
  if (!rows.length) return 0;
  applyHealthRows(rows);
  // The server's copy goes only once this phone has saved the numbers.
  if (saveNow()) await healthApi.clearHealthInbox(rows).catch(() => {});
  return rows.length;
}

function applyHealthRows(rows) {
  batch(() => {
    const next = { ...health.peek() };
    for (const r of rows) next[r.day] = { ...(next[r.day] || {}), ...r.metrics, at: r.received_at };
    health.value = next;
    for (const r of rows) applyHealthDay(r.day, r.received_at);
  });
}

function applyHealthDay(day, at) {
  const metrics = health.peek()[day];
  if (!metrics) return;
  const lk = (goalId, d) => checkins.peek()[checkinKey(goalId, d)];
  for (const { goal, count } of healthUpdates(allGoals.peek(), lk, day, metrics)) setCheckin(goal, day, { count }, { at });
}

/** The Shortcut is about to run: collect its numbers as soon as the app is back. */
export const expectHealth = () => (healthPulledAt = 0);

export const savedHealthKey = () => healthApi.savedHealthKey(uid());

/** Makes a new upload key for the Shortcut (the old one stops working) and returns it. */
export async function connectHealth() {
  let key;
  if (session.peek().demo) {
    key = `kil_demo_${Math.random().toString(36).slice(2, 12)}`;
    writeString('healthKey:demo', key);
  } else {
    key = await healthApi.connectHealth(uid());
  }
  if (!settings.peek().health) updateSettings({ health: true });
  return key;
}

export async function disconnectHealth() {
  if (session.peek().demo) removeKey('healthKey:demo');
  else await healthApi.disconnectHealth(uid());
  updateSettings({ health: false });
}

export const healthStatus = () => (session.peek().demo ? Promise.resolve(null) : healthApi.healthStatus());

// ---------------------------------------------------------------- automatic follow-ups

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveNow();
    if (backupKey && readString(`backupDirty:${uid()}`)) runBackup();
  } else {
    tickClock();
    resume();
  }
});
addEventListener('online', resume);

/** Back in the app (or back online): finish setup checks that couldn't run, and collect Health numbers. */
async function resume() {
  const s = session.peek();
  if (s.status !== 'signedIn' || s.demo || !ready.peek()) return;
  if (preparedFor !== s.user.id) {
    if (!synced.peek() && (await sync.pull())) synced.value = true;
    await prepareLocalOnly();
  }
  pullHealth();
}

// New awards: store them, and celebrate the ones earned in the last couple of days. Stored rows
// only remember what was already celebrated; what's shown always follows the history, so undoing
// a check-off removes the award (and redoing it brings it back without a second celebration).
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

// Awards left uncelebrated when the app closed get their moment too, as long as the history
// still earns them.
let celebratedStored = false;
effect(() => {
  if (!ready.value || !synced.value || celebratedStored) return;
  celebratedStored = true;
  const { earned } = awardState.peek();
  celebrate(Object.values(achievements.peek()).filter((a) => !a.seen && earned.has(a.award_key)));
});

// Personal monthly challenge, fixed when the month starts.
effect(() => {
  if (!ready.value || !synced.value) return;
  const month = `${today.value.slice(0, 7)}-01`;
  const list = allGoals.value;
  if (challenges.value[month] || !list.length) return;
  const { target } = challengeTarget({ goals: list, lookup: lookup.peek(), today: today.peek(), first: firstDay(list) });
  challenges.value = { ...challenges.peek(), [month]: { user_id: uid(), month, target } };
});

// The only goal data that goes to the cloud: each goal's streak and today's progress, for the
// reminder messages. Sent as a whole set, a moment after the last change.
effect(() => {
  if (!ready.value || session.value.demo || !deviceReady.value || setupStep.value || !settings.value.localOnly) return;
  sync.queueStreaks(
    buildStreakRows({
      goals: allGoals.value,
      streaks: streaks.value,
      lookup: lookup.value,
      today: today.value,
      weekStart: settings.value.weekStart,
    }),
  );
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

// Demo-only helpers for trying Health numbers and the setup screens in the browser.
if (demoRequested) {
  window.kilDemo = {
    health: (metrics, day = today.peek()) => applyHealthRows([{ day, metrics, received_at: nowIso() }]),
    // setup('restore', { newPhone: true }) also empties this "phone", as if signing in on a new one.
    setup: async (step, { newPhone = false } = {}) => {
      if (step === 'restore') {
        const rows = buildStreakRows({ goals: allGoals.peek(), streaks: streaks.peek(), lookup: lookup.peek(), today: today.peek() });
        restoreInfo.value = { backup: await demoCloud.info(), streaks: rows };
      }
      if (newPhone) {
        batch(() => [goals, checkins, notes, achievements, challenges, health].forEach((s) => (s.value = {})));
      }
      setupStep.value = step;
    },
  };
}
