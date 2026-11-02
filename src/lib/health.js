// Apple Health connection. Web apps can't read Health, so the user's iOS Shortcut uploads
// today's numbers to the health-import function with a personal key. Only the key's SHA-256 is
// kept on the server; the key itself is shown once and remembered on this phone.
import { SUPABASE_URL } from '../config.js';
import { readString, removeKey, writeString } from './local.js';
import { supabase } from './supabase.js';

export const HEALTH_URL = `${SUPABASE_URL}/functions/v1/health-import`;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const savedHealthKey = (uid) => readString(`healthKey:${uid}`, null);

/** Makes a new upload key (replacing any old one) and returns it. */
export async function connectHealth(uid) {
  const key = `kil_${base64url(crypto.getRandomValues(new Uint8Array(24)))}`;
  const hash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  const { error } = await supabase
    .from('health_tokens')
    .upsert({ user_id: uid, token_hash: hash, created_at: new Date().toISOString(), last_used_at: null }, { onConflict: 'user_id' });
  if (error) throw error;
  writeString(`healthKey:${uid}`, key);
  return key;
}

export async function disconnectHealth(uid) {
  const { error } = await supabase.from('health_tokens').delete().eq('user_id', uid);
  if (error) throw error;
  removeKey(`healthKey:${uid}`);
}

/** { created_at, last_used_at } when connected, otherwise null. */
export async function healthStatus() {
  const { data, error } = await supabase.from('health_tokens').select('created_at, last_used_at').maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchHealthInbox() {
  const { data, error } = await supabase.from('health_inbox').select('day, metrics, received_at').order('day');
  if (error) throw error;
  return data || [];
}

/** Deletes inbox rows the app has saved; a newer upload that arrived meanwhile is kept. */
export async function clearHealthInbox(rows) {
  if (!rows.length) return;
  const upTo = rows.reduce((m, r) => (r.received_at > m ? r.received_at : m), '');
  const { error } = await supabase
    .from('health_inbox')
    .delete()
    .in('day', rows.map((r) => r.day))
    .lte('received_at', upTo);
  if (error) throw error;
}
