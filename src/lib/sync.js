// Offline-first sync. Every change is applied on the phone first and queued in an outbox
// (kept in localStorage, so a killed app loses nothing). The outbox is pushed to Supabase in
// the background; remote changes are pulled on launch and whenever the app comes back.
import { readJSON, removeKey, writeJSON } from './local.js';
import { supabase } from './supabase.js';

export const TABLES = ['profiles', 'goals', 'checkins', 'day_notes', 'achievements', 'challenges'];

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
  goals: [
    'id',
    'user_id',
    'title',
    'emoji',
    'color',
    'target',
    'unit',
    'schedule',
    'days',
    'per_week',
    'time_of_day',
    'reminder_time',
    'sort_order',
    'start_on',
    'archived_on',
    'deleted_at',
    'created_at',
  ],
  checkins: ['goal_id', 'day', 'user_id', 'count', 'skipped', 'completed_at'],
  day_notes: ['user_id', 'day', 'note', 'mood'],
  achievements: ['user_id', 'award_key', 'earned_on', 'seen'],
  challenges: ['user_id', 'month', 'target'],
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
  Object.fromEntries(COLUMNS[table].filter((c) => row[c] !== undefined).map((c) => [c, row[c]]));

// Postgres "bad data" and "constraint" errors: retrying would never succeed.
const isPermanent = (error) => /^(22|23)/.test(String(error?.code || ''));

let ctx = null;
let outbox = { entries: {}, seq: 0 };
let cursors = {};
let timer = null;
let running = null;
let again = false;
let backoff = 0;
let lastPull = 0;

const pendingTotal = () => Object.keys(outbox.entries).length;
const save = () => ctx && writeJSON(`outbox:${ctx.uid}`, outbox);
const report = (state, extra = {}) => ctx?.onStatus?.({ state, pending: pendingTotal(), ...extra });

export function start(opts) {
  stop();
  ctx = opts;
  outbox = readJSON(`outbox:${opts.uid}`, { entries: {}, seq: 0 });
  cursors = readJSON(`cursor:${opts.uid}`, {});
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
    const entries = Object.values(outbox.entries);
    if (!entries.length) return report('synced', { at: Date.now() });
    if (!navigator.onLine) return report('offline');
    report('syncing');
    try {
      for (const table of TABLES) {
        const batch = entries.filter((e) => e.table === table);
        for (let i = 0; i < batch.length; i += 200) await pushChunk(table, batch.slice(i, i + 200));
      }
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

async function fetchSince(table, since) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select('*').order('updated_at', { ascending: true }).range(from, from + 999);
    // Look back two minutes so rows committed out of order are not missed.
    if (since) q = q.gte('updated_at', new Date(Date.parse(since) - 120000).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export function forget(uid) {
  removeKey(`outbox:${uid}`);
  removeKey(`cursor:${uid}`);
}
