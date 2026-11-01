import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../config.js';

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = cloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'kil-auth',
      },
    })
  : null;

/** Calls one of our Edge Functions, sending the signed-in user's token when there is one. */
export async function callFunction(name, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
