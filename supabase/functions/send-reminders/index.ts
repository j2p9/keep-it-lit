// Keep It Lit reminders. Called every minute by pg_cron (with the cron secret) to send whatever
// due_reminders() says is due, and by signed-in users from Settings to send a test notification.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const APP_URL = 'https://j2p9.github.io/keep-it-lit/';

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Config = { vapid_public: string; vapid_private: string; vapid_subject?: string; cron_secret: string };
let config: Config | null = null;

async function loadConfig(): Promise<Config> {
  if (config) return config;
  const { data, error } = await admin.rpc('kil_private_config');
  if (error) throw error;
  config = data as Config;
  webpush.setVapidDetails(config.vapid_subject || APP_URL, config.vapid_public, config.vapid_private);
  return config;
}

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// One reminder that's due, from due_reminders(). Streak numbers come from the app's snapshot.
type Due = {
  user_id: string;
  kind: string;
  local_day: string;
  display_name: string;
  goal_id: string | null;
  goal_title: string | null;
  goal_emoji: string | null;
  goal_streak: number | null;
  due_count: number;
  done_count: number;
  has_goals: boolean;
  remaining: { id: string; e: string; t: string; n: number }[];
  day_end_hour: number;
};

type Payload = { title: string; body: string; tag: string; url?: string; badge?: number };

const goalsWord = (n: number) => `${n} ${n === 1 ? 'goal' : 'goals'}`;

function message(r: Due): Payload {
  const left = r.due_count - r.done_count;
  const first = (r.display_name || '').split(' ')[0];
  const endsAt = r.day_end_hour ? `${r.day_end_hour} AM` : 'midnight';
  const risky = r.remaining.filter((g) => g.n > 0).sort((a, b) => b.n - a.n);
  const list = risky
    .slice(0, 3)
    .map((g) => `${g.e}${g.n}`)
    .join(' ');

  if (r.kind === 'checkin') {
    if (risky.length) return { title: `${goalsWord(left)} to go today 🔥`, body: `Keep your streaks lit: ${list}. Tap to check in.`, tag: 'checkin' };
    return {
      title: `${goalsWord(left)} left today`,
      body: r.done_count ? `Nice, ${r.done_count} done already. Keep it lit 🔥` : 'A few minutes now keeps your day on track 🔥',
      tag: 'checkin',
    };
  }
  if (r.kind === 'saver') {
    if (!r.has_goals) return { title: 'Set up your goals', body: 'It takes a minute: pick a few small things to do every day 🔥', tag: 'saver' };
    if (risky.length) {
      return {
        title: `⏳ ${risky.length === 1 ? 'Your streak ends' : `${risky.length} streaks end`} at ${endsAt}`,
        body: `${list} · ${goalsWord(left)} left. You’ve got this!`,
        tag: 'saver',
      };
    }
    return { title: `${goalsWord(left)} left today`, body: 'Finish strong before the day ends 🔥', tag: 'saver' };
  }
  if (r.kind === 'morning') {
    return {
      title: `Good morning${first ? `, ${first}` : ''} ☀️`,
      body: r.due_count ? `${goalsWord(r.due_count)} today. Let’s keep it lit!` : 'Rest day today 🌿',
      tag: 'morning',
      url: './#welcome',
    };
  }
  const n = r.goal_streak ?? 0;
  return {
    title: `${r.goal_emoji ?? '🔥'} ${r.goal_title ?? 'Your goal'}`,
    body: n > 0 ? `Time for this one. Your 🔥${n} streak is on the line.` : 'Time for this one. Tap to check it off.',
    tag: r.kind,
  };
}

async function sendToUser(userId: string, payload: Payload) {
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ url: './#today', ...payload }),
          { TTL: 3 * 3600, urgency: 'high' },
        );
        sent += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Gone or unknown: the phone unsubscribed or the app was removed.
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('Push failed', code, (err as Error).message);
      }
    }),
  );
  return sent;
}

async function sendDue(at?: string) {
  const { data, error } = await admin.rpc('due_reminders', at ? { p_at: at } : {});
  if (error) throw error;
  const rows = (data ?? []) as Due[];
  let sent = 0;
  for (const r of rows) {
    // Claim the reminder first so overlapping runs never send it twice.
    const { data: claimed, error: claimError } = await admin
      .from('reminder_log')
      .upsert({ user_id: r.user_id, day: r.local_day, kind: r.kind }, { onConflict: 'user_id,day,kind', ignoreDuplicates: true })
      .select('user_id');
    if (claimError) {
      console.error('Claim failed', claimError.message);
      continue;
    }
    if (!claimed?.length) continue;
    sent += await sendToUser(r.user_id, { ...message(r), badge: Math.max(0, r.due_count - r.done_count) });
  }
  return { due: rows.length, sent };
}

/** Encrypts and signs a sample push for a throwaway key, without sending anything. */
async function selfTest() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const details = webpush.generateRequestDetails(
    { endpoint: 'https://fcm.googleapis.com/fcm/send/self-test', keys: { p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) } },
    JSON.stringify({ title: 'Self test' }),
    { TTL: 60 },
  );
  return { ok: true, headers: Object.keys(details.headers), bytes: (details.body as Uint8Array | undefined)?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const cfg = await loadConfig();
    const body = await req.json().catch(() => ({}));
    const secret = req.headers.get('x-cron-secret') ?? '';
    if (secret) {
      if (!sameSecret(secret, cfg.cron_secret)) return json({ error: 'Forbidden' }, 403);
      if (body.selftest) return json(await selfTest());
      return json(await sendDue(body.at));
    }
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Please sign in again.' }, 401);
    if (body.test) {
      const sent = await sendToUser(data.user.id, {
        title: 'Keep It Lit 🔥',
        body: 'Reminders are working. We’ll only nudge you when goals are left.',
        tag: 'test',
      });
      return json({ sent });
    }
    return json({ error: 'Bad request' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
});
