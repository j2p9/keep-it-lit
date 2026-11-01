// Keep It Lit sign-up. Creates an account that is ready to use straight away (no confirmation
// email), then the app signs in with the same email and password.
import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim().slice(0, 40);

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (password.length < 8 || password.length > 72) {
    return json({ error: 'Use at least 8 characters for your password.' }, 400);
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) {
    const exists = /already|exists|registered/i.test(error.message);
    if (!exists) console.error('Sign-up failed', error.message);
    return json(
      { error: exists ? 'An account with this email already exists. Try signing in.' : 'We couldn’t create your account. Please try again.' },
      exists ? 409 : 400,
    );
  }
  return json({ ok: true });
});
