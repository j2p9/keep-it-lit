// Offline-first sync of the little that lives in the cloud: the profile (name, time zone,
// reminder settings) and each goal's streak snapshot. Changes are queued in an outbox kept in
// localStorage, so a killed app loses nothing, and pushed to Supabase in the background.
// Goals, check-ins, notes and awards stay on the phone (see store.js).
import { readJSON, removeKey, writeJSON } from './local.js';
import { supabase } from './supabase.js';

export const TABLES = ['profiles'];
// Synced by app versions before local-only. Read once more to move each account over.
export const LEGACY = ['goals', 'checkins', 'day_notes', 'achievements', 'challenges'];

const CONFLICT = {
  profiles: 'id',
  goals: 'id',
  checkins: 'goal_id,day',
  day_notes: 'user_id,day',
  achievements: 'user_id,award_key',
  challenges: 'user_id,month',
};

const COLUMNS = {
  profiles: [
    'id',
    'display_name',
    'timezone',
    'settings',
    'stats',
    'reminder_checkin_enabled',
    'reminder_checkin_time',
    'reminder_saver_enabled',
    'reminder_saver_time',
    'reminder_morning_enabled',
    'reminder_morning_time',
  ],
};

export function rowKey(table, r) {
  switch (table) {
    case 'profiles':
    case 'goals':
      return r.id;
    case 'checkins':
      return `${r.goal_id}|${r.day}`;
    case 'day_notes':
      return r.day;
    case 'achievements':
      return r.award_key;
    case 'challenges':
      return r.month;
    default:
      return '';
  }
}

const pick = (table, row) =>
  COLUMNS[table] ? Object.fromEntries(COLUMNS[table].filter((c) => row[c] !== undefined).map((c) => [c, row[c]])) : row;

// Postgres "bad data" and "constraint" errors: retrying would never succeed.
const isPermanent = (error) => /^(22|23)/.test(String(error?.code || ''));
// A table that no longer exists (legacy tables get dropped once every account has moved).
const isMissingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

let ctx = null;
let outbox = { entries: {}, seq: 0 };
let cursors = {};
// Streak snapshot: the last set the server accepted, and a newer one waiting to go.
let streaks = { sent: null, pending: null };
let timer = null;
let running = null;
let again = false;
let backoff = 0;
let lastPull = 0;

const synced = (e) => TABLES.includes(e.table);
const pendingTotal = () => Object.values(outbox.entries).filter(synced).length + (streaks.pending ? 1 : 0);
const save = () => ctx && writeJSON(`outbox:${ctx.uid}`, outbox);
const saveStreaks = () => ctx && writeJSON(`streaks:${ctx.uid}`, streaks);
const report = (state, extra = {}) => ctx?.onStatus?.({ state, pending: pendingTotal(), ...extra });

export function start(opts) {
  stop();
  ctx = opts;
  outbox = readJSON(`outbox:${opts.uid}`, { entries: {}, seq: 0 });
  cursors = readJSON(`cursor:${opts.uid}`, {});
  streaks = readJSON(`streaks:${opts.uid}`, { sent: null, pending: null });
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);
  report(pendingTotal() ? 'pending' : 'idle');
  flushSoon(300);
}

export function stop() {
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisibility);
  clearTimeout(timer);
  ctx = null;
}

function onOnline() {
  flushSoon(100);
  pull();
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    flushSoon(100);
    if (Date.now() - lastPull > 15000) pull();
  } else {
    flush(); // get pending changes out before iOS suspends the app
  }
}

/** Outbox rows saved for a user, read straight from storage (used before sync starts). */
export const pendingRows = (uid) => Object.values(readJSON(`outbox:${uid}`, { entries: {} }).entries);
export const pendingKeys = () => new Set(Object.keys(outbox.entries));
export const pendingCount = pendingTotal;

/** Changes an older app version queued for the legacy tables, which this one no longer sends. */
export const legacyPendingKeys = () => new Set(Object.values(outbox.entries).filter((e) => !synced(e)).map((e) => e.id));

export function dropLegacy() {
  const before = Object.keys(outbox.entries).length;
  outbox.entries = Object.fromEntries(Object.entries(outbox.entries).filter(([, e]) => synced(e)));
  if (Object.keys(outbox.entries).length !== before) save();
}

export function enqueueMany(items) {
  if (!ctx || !items.length) return;
  for (const [table, row] of items) {
    const id = `${table}|${rowKey(table, row)}`;
    outbox.seq += 1;
    outbox.entries[id] = { id, table, row: pick(table, row), v: outbox.seq };
  }
  save();
  report('pending');
  flushSoon();
}

export const enqueue = (table, row) => enqueueMany([[table, row]]);

/** Queues the full set of streak rows; only the newest set is ever sent. */
export function queueStreaks(rows) {
  if (!ctx) return;
  const json = JSON.stringify(rows);
  if (json === (streaks.pending ?? streaks.sent)) return;
  streaks.pending = json === streaks.sent ? null : json;
  saveStreaks();
  if (!streaks.pending) return;
  report('pending');
  flushSoon(2500);
}

export function flushSoon(ms = 600) {
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

export async function flush() {
  if (!ctx || !supabase) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const entries = Object.values(outbox.entries).filter(synced);
    if (!entries.length && !streaks.pending) return report('synced', { at: Date.now() });
    if (!navigator.onLine) return report('offline');
    report('syncing');
    try {
      for (const table of TABLES) {
        const batch = entries.filter((e) => e.table === table);
        for (let i = 0; i < batch.length; i += 200) await pushChunk(table, batch.slice(i, i + 200));
      }
      if (streaks.pending) await pushStreaks();
      backoff = 0;
      report(pendingTotal() ? 'pending' : 'synced', { at: Date.now() });
    } catch (err) {
      backoff = Math.min(60000, backoff ? backoff * 2 : 3000);
      report(navigator.onLine ? 'error' : 'offline', { error: err?.message });
      clearTimeout(timer);
      timer = setTimeout(flush, backoff);
    }
  })();
  try {
    await running;
  } finally {
    running = null;
    if (again) {
      again = false;
      flushSoon(50);
    }
  }
}

async function pushChunk(table, chunk) {
  const { error } = await supabase.from(table).upsert(
    chunk.map((e) => e.row),
    { onConflict: CONFLICT[table] },
  );
  if (!error) return settle(chunk);
  if (!isPermanent(error)) throw error;
  // One bad row must not block everything else: retry one by one, drop what the server rejects.
  for (const e of chunk) {
    const { error: single } = await supabase.from(table).upsert([e.row], { onConflict: CONFLICT[table] });
    if (single && !isPermanent(single)) throw single;
    if (single) console.warn('Dropped a change the server rejected', table, single.message);
    settle([e]);
  }
}

function settle(entries) {
  // Only clear entries that weren't changed again while they were in flight.
  for (const e of entries) if (outbox.entries[e.id]?.v === e.v) delete outbox.entries[e.id];
  save();
}

async function pushStreaks() {
  const json = streaks.pending;
  const { error } = await supabase.rpc('replace_goal_streaks', { p_rows: JSON.parse(json) });
  if (error && !isPermanent(error)) throw error;
  if (error) console.warn('The server rejected the streak snapshot', error.message);
  streaks.sent = json;
  if (streaks.pending === json) streaks.pending = null;
  saveStreaks();
}

export async function pull() {
  if (!ctx || !supabase || !navigator.onLine) return false;
  const mine = ctx;
  try {
    for (const table of TABLES) {
      const rows = await fetchSince(table, cursors[table]);
      if (mine !== ctx) return false;
      if (rows.length) {
        ctx.onRows(table, rows);
        cursors[table] = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), cursors[table] || '');
      }
    }
    writeJSON(`cursor:${ctx.uid}`, cursors);
    lastPull = Date.now();
    return true;
  } catch (err) {
    console.warn('Pull failed', err);
    return false;
  }
}

/** Everything still in the legacy tables for this account, or null when it can't be read. */
export async function pullLegacy() {
  if (!ctx || !supabase || !navigator.onLine) return null;
  const mine = ctx;
  try {
    const out = {};
    for (const table of LEGACY) out[table] = await fetchSince(table, null);
    return mine === ctx ? out : null;
  } catch (err) {
    console.warn('Reading the old cloud copy failed', err);
    return null;
  }
}

async function fetchSince(table, since) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select('*').order('updated_at', { ascending: true }).range(from, from + 999);
    // Look back two minutes so rows committed out of order are not missed.
    if (since) q = q.gte('updated_at', new Date(Date.parse(since) - 120000).toISOString());
    const { data, error } = await q;
    if (error && isMissingTable(error)) return out;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export function forget(uid) {
  removeKey(`outbox:${uid}`);
  removeKey(`cursor:${uid}`);
  removeKey(`streaks:${uid}`);
}
