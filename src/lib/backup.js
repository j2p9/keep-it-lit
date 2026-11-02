// End-to-end encrypted backup. The export is gzip-compressed, then encrypted on the phone with a
// key made from the user's passphrase (PBKDF2-SHA256 → AES-GCM-256). The server only ever holds
// ciphertext: without the passphrase nobody, including us, can read it.
import { supabase } from './supabase.js';

export const KDF_ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

const pipe = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function deriveKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await pipe(enc.encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed));
  return { ciphertext: toBase64(ct), iv: toBase64(iv), bytes: ct.length };
}

export async function decryptJSON({ ciphertext, iv }, key) {
  let packed;
  try {
    packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ciphertext)));
  } catch {
    throw new Error('That passphrase doesn’t match this backup.');
  }
  return JSON.parse(dec.decode(await pipe(packed, new DecompressionStream('gzip'))));
}

// ---------------------------------------------------------------- key kept on this device
// The derived key is stored as a non-extractable CryptoKey, so automatic backups don't keep
// asking for the passphrase. It can't be read out, only used.

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keep-it-lit', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function keyStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', mode);
    const req = fn(tx.objectStore('keys'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const saveDeviceKey = (uid, value) => keyStore('readwrite', (s) => s.put(value, `backup:${uid}`));
export const loadDeviceKey = (uid) => keyStore('readonly', (s) => s.get(`backup:${uid}`)).catch(() => null);
export const forgetDeviceKey = (uid) => keyStore('readwrite', (s) => s.delete(`backup:${uid}`)).catch(() => {});

// ---------------------------------------------------------------- cloud copy

export async function fetchBackupInfo() {
  const { data, error } = await supabase.from('backups').select('updated_at, bytes').maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchBackup() {
  const { data, error } = await supabase.from('backups').select('ciphertext, iv, salt, kdf, updated_at').maybeSingle();
  if (error) throw error;
  return data;
}

export async function uploadBackup(uid, payload) {
  const { error } = await supabase.from('backups').upsert({ user_id: uid, ...payload }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function deleteBackup(uid) {
  const { error } = await supabase.from('backups').delete().eq('user_id', uid);
  if (error) throw error;
}
