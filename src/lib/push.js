// Web Push for the installed Home Screen app (iOS 16.4+). Permission must be asked from a tap.
import { VAPID_PUBLIC_KEY } from '../config.js';
import { callFunction, supabase } from './supabase.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

function keyBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

async function save(sub, userId) {
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 400) },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

/** Call straight from a click handler: the permission prompt needs the user's tap. */
export async function enablePush(userId) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const result = await Notification.requestPermission();
  if (result !== 'granted') return { ok: false, reason: result };
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await save(sub, userId);
  return { ok: true };
}

/** Keeps this device's subscription on file (endpoints can change between launches). */
export async function refreshPush(userId) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub, userId).catch(() => {});
}

export async function hasSubscription() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export const sendTestPush = () => callFunction('send-reminders', { test: true });
