// Keep It Lit: receives today's Apple Health numbers from the user's iOS Shortcut.
// Auth is the personal key the app showed once (only its SHA-256 is stored). The numbers wait in
// health_inbox until the app picks them up and deletes them (or 7 days, then a cron job does).
import { createClient } from 'npm:@supabase/supabase-js@2';

// Accepted numbers and their sane ranges, in the units the Shortcut sends.
const RANGES: Record<string, [number, number]> = {
  steps: [0, 200000], // count
  exercise: [0, 1440], // minutes
  active: [0, 20000], // kcal
  stand: [0, 24], // hours
  mindful: [0, 1440], // minutes
  sleep: [0, 24], // hours
  water: [0, 20000], // mL
  workouts: [0, 50], // count
};

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Shortcuts sometimes sends numbers as text ("8,432", "7.3 hr"): take the first number in it.
function toNumber(v: unknown) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

/** 'YYYY-MM-DD' within about two days of now, or null. */
function validDay(v: unknown) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const t = Date.parse(`${v.trim()}T12:00:00Z`);
  if (Number.isNaN(t) || Math.abs(t - Date.now()) > 2.5 * 86400000) return null;
  return v.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (key.length < 20) return json({ error: 'Missing key. Copy it from Keep It Lit → Settings → Apple Health.' }, 401);
  const { data: token } = await admin.from('health_tokens').select('user_id').eq('token_hash', await sha256(key)).maybeSingle();
  if (!token) return json({ error: 'Unknown key. Connect Apple Health again in Keep It Lit settings.' }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Send the numbers as JSON.' }, 400);
  const day = validDay((body as Record<string, unknown>).date);
  if (!day) return json({ error: 'date must be today, as YYYY-MM-DD.' }, 400);

  const metrics: Record<string, number> = {};
  for (const [name, [lo, hi]] of Object.entries(RANGES)) {
    const v = toNumber((body as Record<string, unknown>)[name]);
    if (Number.isFinite(v) && v >= lo && v <= hi) metrics[name] = Math.round(v * 100) / 100;
  }
  if (!Object.keys(metrics).length) return json({ error: 'No Health numbers found.' }, 400);

  // Several runs a day add up: newer numbers replace older ones, others are kept.
  const { data: existing } = await admin.from('health_inbox').select('metrics').eq('user_id', token.user_id).eq('day', day).maybeSingle();
  const merged = { ...(existing?.metrics ?? {}), ...metrics };
  const { error } = await admin
    .from('health_inbox')
    .upsert({ user_id: token.user_id, day, metrics: merged, received_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
  if (error) {
    console.error('Save failed', error.message);
    return json({ error: 'Could not save. Please try again.' }, 500);
  }
  await admin.from('health_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', token.user_id);

  // Goals Health has already completed today shouldn't count as "left" in tonight's reminders.
  for (const [metric, value] of Object.entries(merged)) {
    await admin
      .from('goal_streaks')
      .update({ day, done_today: true })
      .eq('user_id', token.user_id)
      .eq('health_metric', metric)
      .lte('health_target', value)
      .lte('day', day);
  }

  return json({ ok: true, date: day, received: Object.keys(metrics).length });
});
